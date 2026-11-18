import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolvePython(pluginRoot, soundPluginDir) {
  const configured = soundPluginDir || process.env.DSH_CAPTION_SOUND_PLUGIN_DIR || '';
  const candidates = [
    configured ? path.join(configured, 'runtime', 'venv', 'Scripts', 'python.exe') : null,
    path.join('D:\\DSH-Plugins\\dsh-cixisound', 'runtime', 'venv', 'Scripts', 'python.exe'),
    path.join(os.homedir(), 'DSH-Plugins', 'dsh-cixisound', 'runtime', 'venv', 'Scripts', 'python.exe'),
  ];
  const profile = process.env.DSH_PROFILE_DIR;
  if (profile) {
    candidates.push(path.join(profile, 'node_modules', 'dsh-cixisound', 'runtime', 'venv', 'Scripts', 'python.exe'));
  }
  const found = firstExisting(candidates);
  if (!found) {
    throw new Error(
      '找不到 dsh-cixisound 的 Python 运行环境。请确认 dsh-cixisound 已安装，或在插件配置里设置 soundPluginDir。',
    );
  }
  return found;
}

export class EngineProcess {
  constructor(options) {
    this.pluginRoot = options.pluginRoot;
    this.config = options.config;
    this.onEvent = options.onEvent || (() => {});
    this.onStderr = options.onStderr || (() => {});
    this.onExit = options.onExit || (() => {});
    this.child = null;
    this.stderrTail = [];
    this.stopping = false;
    this._stoppedResolve = null;
    this._readyResolve = null;
    this._readyReject = null;
  }

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  pythonPath() {
    return resolvePython(this.pluginRoot, this.config.soundPluginDir);
  }

  modelPath() {
    if (this.config.model === 'medium') {
      const dir = this.config.soundPluginDir || 'D:\\DSH-Plugins\\dsh-cixisound';
      return path.join(dir, 'models', 'medium');
    }
    return path.join(this.pluginRoot, 'assets', 'models', 'small');
  }

  speakerModelPath() {
    return path.join(this.pluginRoot, 'assets', 'models', 'speaker-campplus.onnx');
  }

  baseArgs(extra = []) {
    const args = [
      '-B',
      path.join(this.pluginRoot, 'engine', 'live_engine.py'),
      '--model-dir', this.modelPath(),
      '--speaker-model', this.speakerModelPath(),
      '--asr', this.config.asr || 'auto',
      '--sensevoice-model', path.join(this.pluginRoot, 'assets', 'models', 'sensevoice', 'model.int8.onnx'),
      '--sensevoice-tokens', path.join(this.pluginRoot, 'assets', 'models', 'sensevoice', 'tokens.txt'),
      '--sensevoice-languages', (this.config.sensevoiceLanguages || ['zh', 'ja', 'ko', 'yue']).join(','),
      '--cpu-threads', String(this.config.cpuThreads || 8),
      '--min-segment-ms', String(this.config.minSegmentMs || 1200),
      '--max-segment-ms', String(this.config.maxSegmentMs || 8000),
      '--silence-ms', String(this.config.silenceMs || 600),
      '--speaker-threshold', String(this.config.speakerThreshold || 0.58),
    ];
    if (this.config.model === 'medium') {
      // whisper medium is already local inside dsh-cixisound
    }
    return args.concat(extra);
  }

  env() {
    const libs = path.join(this.pluginRoot, 'libs');
    const existing = process.env.PYTHONPATH;
    return {
      ...process.env,
      PYTHONPATH: existing ? `${libs}${path.delimiter}${existing}` : libs,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      OMP_NUM_THREADS: String(this.config.cpuThreads || 8),
    };
  }

  start() {
    if (this.running) return Promise.resolve();
    const python = this.pythonPath();
    const args = this.baseArgs();
    if (this.config.deviceId) {
      args.push('--device-id', this.config.deviceId);
      if (this.config.deviceName) args.push('--device-name', this.config.deviceName);
    }
    const child = spawn(python, args, {
      cwd: this.pluginRoot,
      env: this.env(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.stopping = false;
    this.stderrTail = [];

    const ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });

    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        const index = buffer.indexOf('\n');
        if (index < 0) break;
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          this.onStderr(`engine non-json: ${line}`);
          continue;
        }
        if (message.type === 'ready') {
          if (this._readyResolve) {
            this._readyResolve(message);
            this._readyResolve = null;
            this._readyReject = null;
          }
        } else if (message.type === 'stopped') {
          if (this._stoppedResolve) {
            this._stoppedResolve(message);
            this._stoppedResolve = null;
          }
        }
        this.onEvent(message);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      this.stderrTail.push(text);
      if (this.stderrTail.length > 80) this.stderrTail.shift();
      this.onStderr(text);
    });

    child.on('error', (error) => {
      if (this._readyReject) {
        this._readyReject(error);
        this._readyReject = null;
        this._readyResolve = null;
      }
      this.onExit({ error, expected: this.stopping });
    });

    child.on('exit', (code, signal) => {
      const wasStopping = this.stopping;
      this.child = null;
      if (this._readyReject) {
        const tail = this.stderrTail.join('').trim().split('\n').slice(-4).join(' | ');
        this._readyReject(new Error(`采集引擎启动失败（exit ${code}）：${tail}`));
        this._readyReject = null;
        this._readyResolve = null;
      }
      if (this._stoppedResolve) {
        this._stoppedResolve({ type: 'stopped', segments: null });
        this._stoppedResolve = null;
      }
      this.onExit({ code, signal, expected: wasStopping });
    });

    return ready;
  }

  async stop(timeoutMs = 7000) {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    this.stopping = true;
    const stopped = new Promise((resolve) => {
      this._stoppedResolve = resolve;
    });
    try {
      child.stdin.write('{"cmd":"stop"}\n');
      child.stdin.end();
    } catch {
      // ignore
    }
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  dispose() {
    this.stopping = true;
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
  }

  async listDevices(timeoutMs = 20000) {
    const python = this.pythonPath();
    const args = ['-B', path.join(this.pluginRoot, 'engine', 'live_engine.py'), '--list-devices'];
    return await new Promise((resolve, reject) => {
      const child = spawn(python, args, {
        cwd: this.pluginRoot,
        env: this.env(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let error = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('枚举音频设备超时'));
      }, timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { error += chunk; });
      child.on('error', (cause) => {
        clearTimeout(timer);
        reject(cause);
      });
      child.on('exit', () => {
        clearTimeout(timer);
        const line = output.trim().split('\n').find((entry) => entry.trim().startsWith('{'));
        if (!line) {
          reject(new Error(`无法读取音频设备：${error.trim().split('\n').slice(-2).join(' | ') || '无输出'}`));
          return;
        }
        try {
          const parsed = JSON.parse(line);
          resolve(parsed);
        } catch (cause) {
          reject(new Error(`音频设备输出无法解析：${cause.message}`));
        }
      });
    });
  }
}
