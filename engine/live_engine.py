#!/usr/bin/env python
"""Live speaker-loopback caption engine for the DSH live-caption plugin.

Reads the Windows default speaker through WASAPI loopback, gates on energy,
segments speech, transcribes with faster-whisper (the runtime bundled with
dsh-cixisound), and clusters speaker embeddings with CAM++.

Protocol: JSON lines on stdout (one object per line), logs on stderr.
Commands: {"cmd":"stop"} on stdin.

This process must not write files. Run it with -B / PYTHONDONTWRITEBYTECODE=1.
"""

import argparse
import collections
import json
import math
import os
import queue
import re
import sys
import threading
import time

import numpy as np

SR = 16000
BLOCK = 1600  # 0.1 s
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log(message):
    sys.stderr.write(str(message) + "\n")
    sys.stderr.flush()


def list_devices():
    import soundcard as sc

    devices = []
    try:
        default = sc.default_speaker()
    except Exception:
        default = None
    default_id = str(default.id) if default is not None else None
    for speaker in sc.all_speakers():
        devices.append({
            "id": str(speaker.id),
            "name": speaker.name,
            "default": str(speaker.id) == default_id,
        })
    emit({"type": "devices", "devices": devices, "defaultId": default_id})


LANG_NAMES = {
    "zh": "中文", "en": "English", "ja": "日本語", "ko": "한국어",
    "fr": "Français", "de": "Deutsch", "es": "Español", "ru": "Русский",
    "yue": "粤语",
}

HALLUCINATION_PATTERNS = [
    re.compile(r"^(\s*(谢谢|感谢)(大家)?(的)?(观看|收看|收听|支持)[。.!！,，]*\s*)$", re.I),
    re.compile(r"^(\s*请(大家)?(点赞|订阅|关注|收藏|转发)[。.!！,，]*\s*)$", re.I),
    re.compile(r"字幕(由|by).{0,40}(提供|制作|字幕组)", re.I),
    re.compile(r"(amara\.org|www\.[a-z0-9\-]+\.[a-z]{2,}|https?://)", re.I),
    re.compile(r"^(like and subscribe|thanks? for watching|thank you for watching)[.!]?$", re.I),
    re.compile(r"^(\s*[♪♫]+\s*)$"),
]


def is_hallucination(text):
    normalized = (text or "").strip()
    if len(normalized) < 2:
        return True
    for pattern in HALLUCINATION_PATTERNS:
        if pattern.search(normalized):
            return True
    if len(normalized) >= 6:
        compact = normalized.replace(" ", "")
        if len(set(compact)) == 1:
            return True
    return False


CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]")
CJK_CLASS = r"[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]"
SENSE_TAG = re.compile(r"<\|[^|]*\|>")


def normalize_text(text):
    text = SENSE_TAG.sub("", text or "")
    text = re.sub(r"\s+", " ", text.strip())
    if CJK.search(text):
        text = re.sub(r"(?<=%s)\s+(?=%s)" % (CJK_CLASS, CJK_CLASS), "", text)
        text = re.sub(r"\s+([，。！？；：、）】》])", r"\1", text)
    return text.strip()


def load_speaker_model(path):
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.log_severity_level = 3
    session = ort.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])
    return session


class SpeakerBank:
    """Online cosine clustering over 192-d CAM++ embeddings."""

    def __init__(self, threshold=0.58, max_speakers=8):
        self.threshold = threshold
        self.max_speakers = max_speakers
        self.centroids = []  # list of np.ndarray (192,)
        self.weights = []
        self.counts = []

    @staticmethod
    def _normalize(vector):
        norm = float(np.linalg.norm(vector))
        if norm < 1e-8:
            return None
        return vector / norm

    def assign(self, embedding, duration_s):
        vector = self._normalize(np.asarray(embedding, dtype=np.float32).reshape(-1))
        if vector is None:
            return 0, 0.0, True
        if not self.centroids:
            self.centroids.append(vector)
            self.weights.append(max(0.5, duration_s))
            self.counts.append(1)
            return 0, 1.0, True
        matrix = np.stack(self.centroids, axis=0)
        scores = matrix @ vector
        best = int(np.argmax(scores))
        best_score = float(scores[best])
        if best_score >= self.threshold or len(self.centroids) >= self.max_speakers:
            weight = self.weights[best]
            blended = self.centroids[best] * weight + vector * max(0.5, duration_s)
            normalized = self._normalize(blended)
            if normalized is not None:
                self.centroids[best] = normalized
                self.weights[best] = min(30.0, weight + max(0.5, duration_s))
                self.counts[best] += 1
            return best, best_score, False
        self.centroids.append(vector)
        self.weights.append(max(0.5, duration_s))
        self.counts.append(1)
        return len(self.centroids) - 1, 1.0, True


class FbankExtractor:
    def __init__(self):
        import kaldi_native_fbank as knf

        self._knf = knf

    def extract(self, audio):
        knf = self._knf
        opts = knf.FbankOptions()
        opts.frame_opts.samp_freq = SR
        opts.frame_opts.dither = 0.0
        opts.frame_opts.window_type = "hamming"
        opts.mel_opts.num_bins = 80
        opts.mel_opts.low_freq = 20.0
        opts.mel_opts.high_freq = -400.0
        opts.use_energy = False
        fbank = knf.OnlineFbank(opts)
        fbank.accept_waveform(SR, audio.astype(np.float32))
        fbank.input_finished()
        count = fbank.num_frames_ready
        if count < 10:
            return None
        frames = np.stack([fbank.get_frame(i) for i in range(count)]).astype(np.float32)
        return frames


def embedding_from_frames(session, frames):
    features = frames[None, :, :]
    output = session.run(None, {"x": features})[0]
    return output.reshape(-1)


def speaker_embedding(session, fbank, audio):
    if session is None or fbank is None:
        return None
    frames = fbank.extract(audio)
    if frames is None:
        return None
    try:
        return embedding_from_frames(session, frames)
    except Exception as exc:
        log("speaker embedding failed: %s" % exc)
        return None


class Engine:
    def __init__(self, args):
        self.args = args
        self.stop = threading.Event()
        self.started_at = time.monotonic()
        self.segments = 0
        self.audio_q = queue.Queue(maxsize=240)
        self.speaker_bank = SpeakerBank(threshold=args.speaker_threshold)
        self.speaker_session = None
        self.fbank = None
        self.capture_error = None
        self.last_language = None
        self.whisper = None
        self.sensevoice = None
        self.sensevoice_languages = set(
            item.strip().lower()
            for item in (args.sensevoice_languages or "zh,ja,ko,yue").split(",")
            if item.strip()
        )
        self.asr_mode = args.asr
        self.device_name = None

    # ---------- setup ----------
    def load_whisper(self):
        from faster_whisper import WhisperModel

        model_dir = self.args.model_dir
        if not os.path.isdir(model_dir):
            raise RuntimeError("whisper model directory not found: %s" % model_dir)
        log("loading whisper model: %s" % model_dir)
        self.whisper = WhisperModel(
            model_dir,
            device="cpu",
            compute_type=self.args.compute_type,
            cpu_threads=self.args.cpu_threads,
        )

    def load_sensevoice(self):
        model = self.args.sensevoice_model or os.path.join(
            PLUGIN_ROOT, "assets", "models", "sensevoice", "model.int8.onnx")
        tokens = self.args.sensevoice_tokens or os.path.join(
            PLUGIN_ROOT, "assets", "models", "sensevoice", "tokens.txt")
        if not (os.path.isfile(model) and os.path.isfile(tokens)):
            log("sensevoice model missing, using whisper: %s" % model)
            return False
        try:
            import sherpa_onnx

            log("loading sensevoice model: %s" % model)
            self.sensevoice = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                model=model,
                tokens=tokens,
                num_threads=max(1, int(self.args.cpu_threads // 2)),
                use_itn=True,
                debug=False,
                language="auto",
            )
            return True
        except Exception as exc:
            log("sensevoice load failed, using whisper: %s" % exc)
            self.sensevoice = None
            return False

    def prepare(self):
        if self.args.asr in ("auto", "sensevoice"):
            loaded = self.load_sensevoice()
            if self.args.asr == "sensevoice" and not loaded:
                raise RuntimeError("SenseVoice 模型不存在，无法强制使用 sensevoice 引擎")
        if self.args.asr in ("auto", "whisper") or self.sensevoice is None:
            self.load_whisper()
        if self.args.speaker_model and not self.args.no_speaker:
            if os.path.isfile(self.args.speaker_model):
                log("loading speaker model: %s" % self.args.speaker_model)
                self.speaker_session = load_speaker_model(self.args.speaker_model)
                self.fbank = FbankExtractor()
            else:
                log("speaker model missing, diarization disabled: %s" % self.args.speaker_model)
        self.resolve_device()

    def resolve_device(self):
        import soundcard as sc

        if self.args.device_id:
            self.mic = sc.get_microphone(id=self.args.device_id, include_loopback=True)
            self.device_name = self.args.device_name or self.args.device_id
            return
        speaker = sc.default_speaker()
        if speaker is None:
            raise RuntimeError("没有找到默认扬声器")
        self.mic = sc.get_microphone(id=str(speaker.id), include_loopback=True)
        self.device_name = speaker.name

    # ---------- capture ----------
    def capture_loop(self):
        try:
            with self.mic.recorder(samplerate=SR, channels=1) as recorder:
                while not self.stop.is_set():
                    data = recorder.record(numframes=BLOCK)
                    array = np.asarray(data, dtype=np.float32)
                    if array.ndim > 1:
                        array = array[:, 0]
                    if array.size == 0:
                        continue
                    try:
                        self.audio_q.put_nowait(array.copy())
                    except queue.Full:
                        try:
                            self.audio_q.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            self.audio_q.put_nowait(array.copy())
                        except queue.Full:
                            pass
        except Exception as exc:
            self.capture_error = exc
            log("capture failed: %s" % exc)
            self.stop.set()

    # ---------- processing ----------
    def sensevoice_transcribe(self, audio):
        stream = self.sensevoice.create_stream()
        stream.accept_waveform(SR, audio.astype(np.float32))
        self.sensevoice.decode_stream(stream)
        result = stream.result
        text = normalize_text(getattr(result, "text", "") or "")
        language = str(getattr(result, "lang", "") or "").strip("<|>").lower()
        return text, language

    def whisper_transcribe(self, audio, language_hint):
        segments, info = self.whisper.transcribe(
            audio,
            language=None,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            word_timestamps=False,
            temperature=0.0,
        )
        pieces = []
        for segment in segments:
            text = normalize_text(segment.text)
            if text and not is_hallucination(text):
                pieces.append(text)
        language = getattr(info, "language", None) or language_hint or "zh"
        probability = float(getattr(info, "language_probability", 0.0) or 0.0)
        return " ".join(pieces).strip(), language, probability

    def transcribe(self, audio, language_hint):
        sense_text = ""
        sense_language = ""
        if self.sensevoice is not None:
            try:
                sense_text, sense_language = self.sensevoice_transcribe(audio)
            except Exception as exc:
                log("sensevoice failed: %s" % exc)
                sense_text, sense_language = "", ""
            if sense_text and not is_hallucination(sense_text):
                if self.asr_mode == "sensevoice" or sense_language in self.sensevoice_languages:
                    return sense_text, sense_language or "zh", 1.0
            else:
                sense_text = ""
        if self.whisper is None:
            if sense_text:
                return sense_text, sense_language or "zh", 1.0
            return "", language_hint or "zh", 0.0
        return self.whisper_transcribe(audio, language_hint)

    def trim_silence(self, audio, threshold):
        if audio.size == 0:
            return audio
        envelope = np.abs(audio)
        active = np.where(envelope > threshold * 0.6)[0]
        if active.size == 0:
            return audio
        start = max(0, int(active[0]) - int(0.08 * SR))
        end = min(len(audio), int(active[-1]) + int(0.12 * SR))
        return audio[start:end]

    def process_segment(self, audio, start_ms, end_ms, force_language=None):
        if audio.size < int(0.45 * SR):
            return
        duration = len(audio) / float(SR)
        language_hint = force_language or self.last_language
        try:
            text, language, probability = self.transcribe(audio, language_hint)
        except Exception as exc:
            log("transcribe failed: %s" % exc)
            emit({"type": "error", "message": "识别失败：%s" % exc})
            return
        if not text:
            return
        if probability < 0.5 and self.last_language:
            language = self.last_language
        self.last_language = language
        speaker = 0
        confidence = 1.0
        if self.speaker_session is not None and self.fbank is not None and duration >= 0.9:
            vector = speaker_embedding(self.speaker_session, self.fbank, audio)
            if vector is not None:
                speaker, confidence, _is_new = self.speaker_bank.assign(vector, duration)
        self.segments += 1
        ruby = None
        if language == "ja":
            try:
                from furigana import annotate_lines

                lines = annotate_lines(text)
                ruby = lines[0] if lines else []
            except Exception as exc:
                log("furigana failed: %s" % exc)
        payload = {
            "type": "segment",
            "id": "seg-%04d" % self.segments,
            "startMs": int(start_ms),
            "endMs": int(end_ms),
            "duration": round(duration, 2),
            "language": language,
            "languageName": LANG_NAMES.get(language, language),
            "languageProbability": round(probability, 3),
            "text": text,
            "speaker": int(speaker),
            "speakerConfidence": round(float(confidence), 3),
        }
        if ruby:
            payload["ruby"] = ruby
        emit(payload)

    def main_loop(self):
        capture = threading.Thread(target=self.capture_loop, name="wasapi-loopback", daemon=True)
        capture.start()
        emit({"type": "ready", "device": self.device_name, "sampleRate": SR,
              "speaker": self.speaker_session is not None,
              "asr": "sensevoice+whisper" if self.sensevoice is not None and self.whisper is not None
                     else ("sensevoice" if self.sensevoice is not None else "whisper")})
        log("capturing from: %s" % self.device_name)

        noise = 0.003
        threshold = 0.006
        pre_roll = collections.deque(maxlen=4)  # 0.4 s
        segment = []
        in_speech = False
        silence_blocks = 0
        speech_start = None
        total_samples = 0
        last_activity_emit = 0.0

        while not self.stop.is_set():
            try:
                block = self.audio_q.get(timeout=0.25)
            except queue.Empty:
                continue
            block_duration = len(block) / float(SR)
            total_samples += len(block)
            rms = float(np.sqrt(np.mean(np.square(block.astype(np.float64)) + 1e-12)))
            active = rms > threshold

            if not in_speech:
                if rms < noise * 2.5:
                    noise = noise * 0.97 + rms * 0.03
                    threshold = max(0.006, noise * 5.0)
                pre_roll.append(block)
                if active:
                    in_speech = True
                    silence_blocks = 0
                    segment = list(pre_roll)
                    speech_start = max(0, total_samples - sum(len(x) for x in segment))
                continue

            segment.append(block)
            if active:
                silence_blocks = 0
            else:
                silence_blocks += 1
            segment_samples = sum(len(x) for x in segment)
            end_ms = int(total_samples / float(SR) * 1000)
            start_ms = int(speech_start / float(SR) * 1000) if speech_start is not None else end_ms

            max_samples = int(self.args.max_segment_ms / 1000.0 * SR)
            silence_limit = max(2, int(self.args.silence_ms / 100.0))
            should_cut = (silence_blocks >= silence_limit and segment_samples >= int(self.args.min_segment_ms / 1000.0 * SR)) \
                or segment_samples >= max_samples
            if should_cut:
                audio = np.concatenate(segment)
                keep_tail = in_speech and silence_blocks == 0
                if not keep_tail:
                    in_speech = False
                    pre_roll.clear()
                    segment = []
                    speech_start = None
                self.process_segment(self.trim_silence(audio, threshold), start_ms, end_ms)
                if keep_tail:
                    # A forced cut while speech continues: keep a short context tail.
                    tail = audio[-int(0.25 * SR):]
                    pre_roll.clear()
                    pre_roll.append(tail)
                    segment = [tail]
                    in_speech = True
                    speech_start = max(0, total_samples - len(tail))
                    silence_blocks = 0

            now = time.monotonic()
            if now - last_activity_emit > 1.0:
                last_activity_emit = now
                emit({"type": "activity", "rms": round(rms, 4), "speech": bool(in_speech)})

        capture.join(timeout=2.0)
        if self.capture_error is not None:
            emit({"type": "error", "message": "音频采集中断：%s" % self.capture_error})
        if segment and in_speech:
            audio = np.concatenate(segment)
            end_ms = int(total_samples / float(SR) * 1000)
            start_ms = int(max(0, total_samples - len(audio)) / float(SR) * 1000)
            self.process_segment(self.trim_silence(audio, threshold), start_ms, end_ms)
        emit({"type": "stopped", "segments": self.segments,
              "durationMs": int((time.monotonic() - self.started_at) * 1000)})


def stdin_loop(engine):
    reader = sys.stdin
    try:
        for line in reader:
            line = line.strip()
            if not line:
                continue
            try:
                command = json.loads(line)
            except Exception:
                continue
            if command.get("cmd") == "stop":
                engine.stop.set()
                break
    except Exception:
        engine.stop.set()
    engine.stop.set()


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--list-devices", action="store_true")
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--speaker-model", default="")
    parser.add_argument("--asr", default="auto", choices=["auto", "sensevoice", "whisper"])
    parser.add_argument("--sensevoice-model", default="")
    parser.add_argument("--sensevoice-tokens", default="")
    parser.add_argument("--sensevoice-languages", default="zh,ja,ko,yue")
    parser.add_argument("--device-id", default="")
    parser.add_argument("--device-name", default="")
    parser.add_argument("--cpu-threads", type=int, default=8)
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--min-segment-ms", type=int, default=1200)
    parser.add_argument("--max-segment-ms", type=int, default=8000)
    parser.add_argument("--silence-ms", type=int, default=600)
    parser.add_argument("--speaker-threshold", type=float, default=0.58)
    parser.add_argument("--no-speaker", action="store_true")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return 0

    engine = Engine(args)
    try:
        engine.prepare()
    except Exception as exc:
        log("setup failed: %s" % exc)
        emit({"type": "error", "message": "启动失败：%s" % exc})
        return 1

    watcher = threading.Thread(target=stdin_loop, args=(engine,), name="stdin", daemon=True)
    watcher.start()
    try:
        engine.main_loop()
    except Exception as exc:
        log("engine failed: %s" % exc)
        emit({"type": "error", "message": "引擎异常：%s" % exc})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
