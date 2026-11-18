import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EngineProcess } from './host/engine.js';
import { OverlayProcess } from './host/overlay.js';
import { LlmClient } from './host/llm.js';
import { buildNote, writeNote, formatClock } from './host/note.js';
import { matchPreparedAnswers, normalizePreparedAnswers } from './host/extras.js';
import { isQuestion, isSelfIntro, normalizeQuestionKey, transcriptBlock } from './host/interview.js';
import { annotateJapanese } from './host/furigana.js';
import { readSessionProfile, writeSessionProfile } from './host/session-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = here;

const EMPTY_BACKGROUND = {
  resume: '',
  industry: '',
  company: '',
  position: '',
  knowledge: '',
  selfIntro: '',
};

function normalizeBackground(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    resume: String(source.resume || ''),
    industry: String(source.industry || ''),
    company: String(source.company || ''),
    position: String(source.position || ''),
    knowledge: String(source.knowledge || ''),
    selfIntro: String(source.selfIntro || ''),
  };
}

const DEFAULTS = {
  engine: {
    soundPluginDir: '',
    model: 'small',
    asr: 'auto',
    sensevoiceLanguages: ['zh', 'ja', 'ko', 'yue'],
    cpuThreads: 8,
    minSegmentMs: 1200,
    maxSegmentMs: 8000,
    silenceMs: 600,
    speakerThreshold: 0.58,
  },
  translation: { debug: false },
  overlay: { width: 600, height: 360, opacity: 0.95, grouped: true },
  colors: ['#5B8DEF', '#F59E0B', '#34D399', '#A78BFA', '#F472B6', '#22D3EE'],
  preparedAnswers: [],
  autoAnswer: true,
  translateAnswers: false,
  interviewerSpeaker: null,
  background: { ...EMPTY_BACKGROUND },
};

const CHINESE_LANGUAGES = new Set(['zh', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant', 'cmn', 'yue']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function service(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name);
    return ctx ? ctx[name] : undefined;
  } catch {
    return undefined;
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON');
  }
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (origin === 'dsh-app://app') return true;
  const host = req.headers.host;
  if (host && (origin === `http://${host}` || origin === `https://${host}`)) return true;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
  return false;
}

function isChineseLanguage(language) {
  return CHINESE_LANGUAGES.has(String(language || '').toLowerCase());
}

function publicConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = {
    ...DEFAULTS,
    ...source,
    engine: { ...DEFAULTS.engine, ...(source.engine || {}) },
    translation: { ...DEFAULTS.translation, ...(source.translation || {}) },
    overlay: { ...DEFAULTS.overlay, ...(source.overlay || {}) },
  };
  config.colors = Array.isArray(source.colors) && source.colors.length > 0 ? source.colors : DEFAULTS.colors;
  config.preparedAnswers = normalizePreparedAnswers(source.preparedAnswers || DEFAULTS.preparedAnswers);
  config.autoAnswer = source.autoAnswer !== false && source.autoSummary !== false;
  config.translateAnswers = source.translateAnswers === true;
  config.background = normalizeBackground(source.background);
  config.interviewerSpeaker = Number.isInteger(source.interviewerSpeaker) ? source.interviewerSpeaker : null;
  return config;
}

export const name = 'dsh-live-caption';
export const inject = ['webServer'];

export function apply(ctx, rawConfig) {
  const config = publicConfig(rawConfig);
  const llm = new LlmClient(ctx, { config: { translationDebug: config.translation.debug } });

  const state = {
    phase: 'idle',
    sessionId: null,
    startedAt: null,
    endedAt: null,
    device: null,
    deviceId: '',
    notePath: null,
    error: null,
    autoAnswer: config.autoAnswer,
    translateAnswers: config.translateAnswers,
    interviewerSpeaker: config.interviewerSpeaker,
    background: normalizeBackground(config.background),
    analysisCount: 0,
    segments: 0,
  };

  const items = new Map();
  const order = [];
  const analyses = [];
  let engine = null;
  let engineConfig = { ...config.engine };
  let overlay = null;
  let stoppingPromise = null;
  let noteDirectory = null;
  let lastAnswerAt = 0;
  let lastQuestionKey = '';
  let lastIntroAt = 0;
  let pendingQuestion = null;
  let questionTimer = null;
  let answering = false;
  let screenshotBusy = false;
  let longMode = false;
  const longShots = [];

  const translationQueue = [];
  let translationBusy = false;
  let translationWaiters = [];

  function resolveSession(sessionId) {
    if (!sessionId) return null;
    const agents = service(ctx, 'agents');
    if (!agents || typeof agents.get !== 'function') return null;
    try {
      return agents.get(sessionId)?.session || null;
    } catch {
      return null;
    }
  }

  function resolveCwd(sessionId) {
    const session = resolveSession(sessionId);
    const workingDirectory = service(ctx, 'workingDirectory');
    if (session && workingDirectory) {
      try {
        return workingDirectory.get(session);
      } catch {
        // fall through
      }
    }
    if (session?.header?.cwd) return session.header.cwd;
    if (workingDirectory?.defaultDirectory) return workingDirectory.defaultDirectory;
    return process.cwd();
  }

  function orderedItems() {
    const list = [];
    for (const id of order) {
      const item = items.get(id);
      if (item) list.push(item);
    }
    return list;
  }

  function serializeItem(item) {
    return {
      id: item.id,
      time: item.time,
      speaker: item.speaker,
      speakerLabel: item.speakerLabel,
      color: item.color,
      language: item.language,
      languageName: item.languageName,
      text: item.text,
      ruby: item.ruby,
      translation: item.translation,
      translationState: item.translationState,
      extras: item.extras,
    };
  }

  function statusText() {
    if (state.phase === 'starting') return '正在启动引擎…';
    if (state.phase === 'stopping') return '正在收尾并保存笔记…';
    if (state.phase === 'error') return `错误：${state.error || '未知错误'}`;
    if (state.phase === 'listening') {
      return `正在聆听面试${state.device ? ` · ${state.device}` : ''} · 已识别 ${order.length} 段`;
    }
    if (state.notePath) return '已结束 · 笔记已保存';
    return '准备就绪';
  }

  function statusTone() {
    if (state.phase === 'error') return 'error';
    if (state.phase === 'listening') return 'info';
    if (state.phase === 'stopping') return 'info';
    if (state.notePath) return 'ok';
    return 'info';
  }

  function sendStatus(text, tone) {
    if (!overlay) return;
    overlay.send({ op: 'status', text: text || statusText(), tone: tone || statusTone() });
  }

  function overlayInit() {
    return {
      op: 'init',
      title: '面试助手',
      width: config.overlay.width,
      height: config.overlay.height,
      opacity: config.overlay.opacity,
      grouped: config.overlay.grouped !== false,
      colors: config.colors,
      analyze: true,
      screenshot: true,
      longMode,
      status: statusText(),
    };
  }

  function ensureOverlay() {
    if (!overlay) {
      overlay = new OverlayProcess({
        pluginRoot,
        onEvent: (message) => {
          if (message.op === 'hidden') state.overlayHidden = true;
          if (message.op === 'window-ready') state.overlayHidden = false;
        },
        onStderr: (text) => {
          if (config.translation.debug) console.warn(`[live-caption overlay] ${text.trim()}`);
        },
        onAnalyze: () => {
          void requestOverlayAnalysis();
        },
        onScreenshot: (message) => {
          void handleScreenshot(message);
        },
        onExit: ({ expected }) => {
          state.overlayHidden = true;
          if (!expected) console.warn('[live-caption] overlay process exited');
        },
      });
    }
    overlay.ensure();
    return overlay;
  }

  function replayOverlay() {
    ensureOverlay();
    overlay.send(overlayInit());
    for (const item of orderedItems()) overlay.send({ op: 'item', item: serializeItem(item) });
    for (const analysis of analyses) overlay.send({ op: 'analysis', ...analysis });
    sendStatus();
  }

  function showOverlay() {
    if (state.phase === 'idle' && order.length === 0) {
      ensureOverlay();
      overlay.send(overlayInit());
      overlay.show();
      return;
    }
    replayOverlay();
    overlay.show();
  }

  function notifyTranslationIdle() {
    if (translationBusy || translationQueue.length > 0) return;
    const waiters = translationWaiters;
    translationWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function drainTranslations(timeoutMs) {
    return new Promise((resolve) => {
      if (!translationBusy && translationQueue.length === 0) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      translationWaiters.push(finish);
      setTimeout(finish, timeoutMs);
    });
  }

  async function pumpTranslations() {
    if (translationBusy) return;
    translationBusy = true;
    try {
      while (translationQueue.length > 0) {
        const item = translationQueue.shift();
        try {
          const translated = await llm.translate(item.text, item.language);
          item.translation = translated;
          item.translationState = 'done';
          overlay?.send({ op: 'update', id: item.id, patch: { translation: translated, translationState: 'done' } });
        } catch (error) {
          item.translationState = 'failed';
          overlay?.send({ op: 'update', id: item.id, patch: { translationState: 'failed' } });
          if (config.translation.debug) console.warn(`[live-caption] translation failed: ${error.message}`);
        }
      }
    } finally {
      translationBusy = false;
      notifyTranslationIdle();
    }
  }

  function enqueueTranslation(item) {
    translationQueue.push(item);
    void pumpTranslations();
  }

  function handleSegment(message) {
    const text = String(message.text || '').trim();
    if (!text) return;
    const speaker = Number.isFinite(Number(message.speaker)) ? Number(message.speaker) : 0;
    const language = String(message.language || 'zh');
    const needsTranslation = !isChineseLanguage(language);
    const item = {
      id: message.id || `seg-${order.length + 1}`,
      time: formatClock(new Date()),
      speaker,
      speakerLabel: `说话人 ${speaker + 1}`,
      color: config.colors[speaker % config.colors.length],
      language,
      languageName: message.languageName || language,
      text,
      ruby: Array.isArray(message.ruby) ? message.ruby : null,
      translation: null,
      translationState: needsTranslation ? 'pending' : null,
      extras: matchPreparedAnswers(text, config.preparedAnswers),
      startMs: message.startMs,
      endMs: message.endMs,
    };
    items.set(item.id, item);
    order.push(item.id);
    state.segments = order.length;
    overlay?.send({ op: 'item', item: serializeItem(item) });
    sendStatus();
    if (needsTranslation) enqueueTranslation(item);
    maybeTriggerAnswer(item);
  }

  function handleEngineEvent(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      state.phase = 'listening';
      state.device = message.device || state.device;
      state.startedAt = Date.now();
      state.error = null;
      ensureOverlay();
      replayOverlay();
      sendStatus();
      return;
    }
    if (message.type === 'segment') {
      handleSegment(message);
      return;
    }
    if (message.type === 'error') {
      const text = String(message.message || '引擎错误');
      state.error = text;
      if (state.phase === 'starting' || !engine?.running) state.phase = 'error';
      sendStatus(`错误：${text}`, 'error');
      return;
    }
    if (message.type === 'stopped') {
      return;
    }
  }

  function startEngine(sessionId, deviceId, deviceName, background, interviewerSpeaker, autoAnswer, translateAnswers) {
    if (state.phase === 'starting' || state.phase === 'stopping' || engine?.running) {
      throw new HttpError(409, '已经在面试中，请先结束当前面试');
    }
    if (stoppingPromise) throw new HttpError(409, '正在收尾，请稍后');
    const nextBackground = normalizeBackground(background || state.background);
    const hasBackground = ['resume', 'position', 'knowledge']
      .some((key) => nextBackground[key].trim().length > 0);
    if (!hasBackground) {
      throw new HttpError(400, '请先填写面试背景（简历 / 岗位 / 行业知识至少一项）');
    }
    const cwd = resolveCwd(sessionId);
    noteDirectory = cwd;
    items.clear();
    order.length = 0;
    analyses.length = 0;
    state.sessionId = sessionId || null;
    state.notePath = null;
    state.error = null;
    state.startedAt = null;
    state.endedAt = null;
    state.segments = 0;
    state.analysisCount = 0;
    state.phase = 'starting';
    state.deviceId = deviceId || '';
    state.device = deviceName || null;
    state.background = nextBackground;
    state.interviewerSpeaker = Number.isInteger(interviewerSpeaker) ? interviewerSpeaker : null;
    state.autoAnswer = autoAnswer !== false;
    state.translateAnswers = translateAnswers === true;
    longMode = false;
    longShots.length = 0;
    sendLongMode(false);
    lastAnswerAt = 0;
    lastQuestionKey = '';
    lastIntroAt = 0;
    pendingQuestion = null;
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = null;
    engineConfig = {
      ...config.engine,
      deviceId: deviceId || '',
      deviceName: deviceName || '',
    };
    try { engine?.dispose(); } catch { /* ignore */ }
    engine = null;

    ensureOverlay();
    overlay.clear();
    overlay.send(overlayInit());
    overlay.show();
    sendStatus('正在启动引擎…', 'info');

    engine = new EngineProcess({
      pluginRoot,
      config: engineConfig,
      onEvent: handleEngineEvent,
      onStderr: (text) => {
        if (config.translation.debug) console.warn(`[live-caption engine] ${text.trim()}`);
      },
      onExit: ({ code, expected }) => {
        if (expected) return;
        if (state.phase === 'listening' || state.phase === 'starting') {
          state.phase = 'error';
          state.error = `采集引擎意外退出（exit ${code ?? '?'}）`;
          sendStatus(state.error, 'error');
        }
      },
    });

    engine.start().catch((error) => {
      state.phase = 'error';
      state.error = error.message;
      sendStatus(`错误：${error.message}`, 'error');
      try { engine?.dispose(); } catch { /* ignore */ }
    });

    return publicState();
  }

  async function stopSession() {
    if (stoppingPromise) return stoppingPromise;
    stoppingPromise = (async () => {
      if (!engine) {
        if (state.phase !== 'error') state.phase = 'idle';
        return publicState();
      }
      state.phase = 'stopping';
      longMode = false;
      longShots.length = 0;
      sendLongMode(false);
      if (questionTimer) clearTimeout(questionTimer);
      questionTimer = null;
      pendingQuestion = null;
      sendStatus('正在收尾并保存笔记…', 'info');
      const startedAt = state.startedAt || Date.now();
      try {
        await engine.stop();
      } catch (error) {
        state.error = `停止采集时出错：${error.message}`;
      }
      const endedAt = Date.now();
      state.endedAt = endedAt;
      await drainTranslations(4000);
      translationQueue.length = 0;
      try {
        const note = buildNote({
          items: orderedItems(),
          analyses,
          startedAt,
          endedAt,
          sessionId: state.sessionId,
        });
        const file = await writeNote({ directory: noteDirectory, note });
        state.notePath = file;
        state.phase = 'idle';
        state.error = null;
        overlay?.send({ op: 'finished', notePath: file });
        sendStatus(`已结束 · 笔记已保存：${file}`, 'ok');
      } catch (error) {
        state.phase = 'error';
        state.error = `笔记保存失败：${error.message}`;
        sendStatus(`错误：${state.error}`, 'error');
      }
      engine = null;
      return publicState();
    })().finally(() => {
      stoppingPromise = null;
    });
    return stoppingPromise;
  }

  function conversationContext(session) {
    if (!session || typeof session.deriveMessages !== 'function') return '';
    try {
      const messages = session.deriveMessages();
      const lines = [];
      for (const message of messages) {
        if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
        let text = '';
        if (Array.isArray(message.content)) {
          text = message.content
            .filter((block) => block && block.type === 'text')
            .map((block) => block.text || '')
            .join('\n');
        }
        if (!text.trim()) continue;
        lines.push(`${message.role === 'user' ? '用户' : '助手'}：${text.trim()}`);
      }
      return lines.slice(-8).map((line) => line.slice(0, 1200)).join('\n\n').slice(-8000);
    } catch {
      return '';
    }
  }

  function addAnalysis(label, content, kind, extra) {
    const card = {
      id: `ana-${kind || 'answer'}-${Date.now()}-${analyses.length}`,
      time: formatClock(new Date()),
      label,
      content: String(content || '').trim(),
      ...(extra || {}),
    };
    analyses.push(card);
    state.analysisCount = analyses.length;
    overlay?.send({ op: 'analysis', ...card });
    return card;
  }

  function needsChineseTranslation(text, language) {
    const value = String(text || '');
    if (!value.trim()) return false;
    if (/[\u3040-\u30ff\uac00-\ud7af]/.test(value)) return true;
    const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (value.match(/[A-Za-z]/g) || []).length;
    if (cjk >= 4 && latin < 4) return false;
    if (latin > 0) return true;
    if (isChineseLanguage(language)) return false;
    if (language && language !== 'auto') return true;
    return false;
  }

  async function translatedAnswer(content, language, session) {
    if (!state.translateAnswers) return '';
    if (!needsChineseTranslation(content, language)) return '';
    try {
      return await llm.translateToChinese(content, language, session);
    } catch (error) {
      if (config.translation.debug) console.warn(`[live-caption] answer translation failed: ${error.message}`);
      return '';
    }
  }

  function sendLongMode(active) {
    overlay?.send({ op: 'longMode', active: Boolean(active) });
  }

  function latestQuestion() {
    const list = orderedItems();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      if (state.interviewerSpeaker != null && item.speaker !== state.interviewerSpeaker) continue;
      if (isSelfIntro(item.text, item.language)) continue;
      if (isQuestion(item.text, item.language)) return item;
    }
    return null;
  }

  async function answerQuestion(item, customQuestion) {
    const background = state.background;
    const hasBackground = ['resume', 'position', 'knowledge']
      .some((key) => String(background[key] || '').trim().length > 0);
    if (!hasBackground) throw new Error('请先填写面试背景（简历 / 岗位 / 行业知识至少一项）');
    const session = resolveSession(state.sessionId);
    const conversation = conversationContext(session);
    const question = customQuestion || (item ? item.text : '');
    const language = item?.language || 'auto';
    const content = await llm.answerInterview({
      background,
      question,
      transcript: transcriptBlock(orderedItems(), 14),
      conversation,
      session,
      instruction: customQuestion && item ? `面试官刚才的问题是：${item.text}` : '',
      language,
    });
    const rubyLines = await annotateJapanese(content, {
      pluginRoot,
      soundPluginDir: config.engine.soundPluginDir,
      debug: config.translation.debug,
    });
    const translation = await translatedAnswer(content, language, session);
    const extra = { language };
    if (rubyLines) { extra.language = 'ja'; extra.rubyLines = rubyLines; }
    if (translation) extra.translation = translation;
    const analysis = addAnalysis('AI 面试作答', content, 'answer', extra);
    lastAnswerAt = Date.now();
    lastQuestionKey = normalizeQuestionKey(question || (item ? item.text : ''));
    sendStatus('已生成面试作答', 'ok');
    return analysis;
  }

  async function answerManual(question) {
    if (state.phase !== 'listening') throw new HttpError(409, '当前没有在面试');
    if (answering) throw new HttpError(409, '已有作答在生成，请稍候');
    const latest = latestQuestion();
    if (!latest && !question && order.length === 0) {
      throw new HttpError(409, '还没有识别到面试内容');
    }
    answering = true;
    try {
      return await answerQuestion(latest, question || '');
    } finally {
      answering = false;
      if (pendingQuestion) void pumpQuestions();
    }
  }

  function maybeTriggerAnswer(item) {
    if (!state.autoAnswer || state.phase !== 'listening') return;
    if (state.interviewerSpeaker != null && item.speaker !== state.interviewerSpeaker) return;
    if (isSelfIntro(item.text, item.language)) {
      void pushSelfIntro(item);
      return;
    }
    if (!isQuestion(item.text, item.language)) return;
    const key = normalizeQuestionKey(item.text);
    if (key === lastQuestionKey && Date.now() - lastAnswerAt < 20000) return;
    pendingQuestion = item;
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = setTimeout(() => {
      questionTimer = null;
      void pumpQuestions();
    }, 900);
  }

  async function pumpQuestions() {
    if (answering) return;
    answering = true;
    try {
      while (pendingQuestion) {
        const item = pendingQuestion;
        pendingQuestion = null;
        try {
          await answerQuestion(item, '');
        } catch (error) {
          sendStatus(`AI 作答失败：${error.message}`, 'error');
        }
      }
    } finally {
      answering = false;
    }
  }

  async function pushSelfIntro(item) {
    if (Date.now() - lastIntroAt < 60000) return;
    lastIntroAt = Date.now();
    const background = state.background;
    const prepared = String(background.selfIntro || '').trim();
    const language = item?.language || 'auto';
    try {
      let content = prepared;
      let label = '自我介绍稿';
      if (!content) {
        content = await llm.draftSelfIntro({
          background,
          conversation: conversationContext(resolveSession(state.sessionId)),
          session: resolveSession(state.sessionId),
          language,
        });
        label = 'AI 自我介绍稿';
      }
      const rubyLines = await annotateJapanese(content, {
        pluginRoot,
        soundPluginDir: config.engine.soundPluginDir,
        debug: config.translation.debug,
      });
      const translation = await translatedAnswer(content, language, resolveSession(state.sessionId));
      const extra = { language };
      if (rubyLines) { extra.language = 'ja'; extra.rubyLines = rubyLines; }
      if (translation) extra.translation = translation;
      addAnalysis(label, content, 'intro', extra);
      sendStatus(`已推送${label}`, 'ok');
    } catch (error) {
      sendStatus(`自我介绍稿生成失败：${error.message}`, 'error');
    }
  }

  async function requestOverlayAnalysis() {
    if (state.phase !== 'listening') {
      sendStatus('AI 作答失败：当前没有在面试', 'error');
      return;
    }
    if (answering) {
      sendStatus('AI 作答失败：已有作答在生成，请稍候', 'error');
      return;
    }
    sendStatus('AI 作答生成中…', 'info');
    try {
      await answerManual('');
    } catch (error) {
      sendStatus(`AI 作答失败：${error.message}`, 'error');
    }
  }

  async function saveScreenshotImage(base64) {
    const attachments = service(ctx, 'attachments');
    if (!attachments || typeof attachments.saveImage !== 'function') {
      throw new Error('当前没有可用的图片附件服务');
    }
    if (typeof base64 !== 'string' || base64.length < 100) throw new Error('截图数据为空');
    const data = Buffer.from(base64, 'base64');
    if (data.length < 1000) throw new Error('截图数据无效');
    if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) {
      throw new Error('截图不是 PNG 图片');
    }
    return attachments.saveImage({ data, mediaType: 'image/png', name: 'interview-shot.png' });
  }

  async function closeLongAnalysis() {
    if (!longMode) {
      sendStatus('长问题分析模式未开启', 'info');
      return;
    }
    if (screenshotBusy) {
      sendStatus('截图分析中，请稍后再长按 ← 结束', 'info');
      sendLongMode(true);
      return;
    }
    if (longShots.length === 0) {
      longMode = false;
      sendLongMode(false);
      sendStatus('长问题分析模式已关闭（没有可分析的内容）', 'info');
      return;
    }
    const session = resolveSession(state.sessionId);
    try {
      sendStatus('正在整合长问题并作答…', 'info');
      const content = await llm.longAnswer({
        background: state.background,
        conversation: conversationContext(session),
        analyses: longShots.slice(),
        session,
      });
      const translation = await translatedAnswer(content, 'auto', session);
      const rubyLines = await annotateJapanese(content, {
        pluginRoot,
        soundPluginDir: config.engine.soundPluginDir,
        debug: config.translation.debug,
      });
      const extra = { language: 'auto' };
      if (rubyLines) { extra.language = 'ja'; extra.rubyLines = rubyLines; }
      if (translation) extra.translation = translation;
      addAnalysis('AI 长问题作答', content, 'long', extra);
      longMode = false;
      longShots.length = 0;
      sendLongMode(false);
      sendStatus('已生成长问题作答', 'ok');
    } catch (error) {
      sendLongMode(true);
      sendStatus(`长问题作答失败：${error.message}`, 'error');
    }
  }

  async function handleScreenshot(message) {
    const mode = String(message?.mode || '');
    if (mode === 'close') {
      await closeLongAnalysis();
      return;
    }
    if (state.phase !== 'listening') {
      sendStatus('截图答题：当前没有在面试', 'error');
      return;
    }
    if (!['quick', 'region', 'analysis'].includes(mode)) return;
    if (screenshotBusy) {
      sendStatus('上一张截图还在处理中，请稍候', 'info');
      return;
    }
    screenshotBusy = true;
    const session = resolveSession(state.sessionId);
    try {
      const imageRef = await saveScreenshotImage(message.image);
      if (mode === 'analysis') {
        if (!longMode) {
          longMode = true;
          longShots.length = 0;
          sendLongMode(true);
        }
        sendStatus('长问题分析模式：正在分析截图…', 'info');
        const text = await llm.analyzeScreenshot({
          imageRef,
          background: state.background,
          conversation: conversationContext(session),
          session,
        });
        longShots.push({ time: formatClock(new Date()), text });
        sendStatus(`长问题分析模式：已分析 ${longShots.length} 张截图（长按 ← 结束并作答）`, 'info');
        return;
      }
      sendStatus('截图答题中：正在识别并作答…', 'info');
      const content = await llm.answerScreenshot({
        imageRef,
        background: state.background,
        conversation: conversationContext(session),
        instruction: '',
        mode,
        session,
      });
      const language = /[\u3040-\u30ff]/.test(content) ? 'ja' : 'auto';
      const rubyLines = await annotateJapanese(content, {
        pluginRoot,
        soundPluginDir: config.engine.soundPluginDir,
        debug: config.translation.debug,
      });
      const translation = await translatedAnswer(content, language, session);
      const extra = { language, mode };
      if (rubyLines) { extra.language = 'ja'; extra.rubyLines = rubyLines; }
      if (translation) extra.translation = translation;
      addAnalysis('AI 截图作答', content, 'shot', extra);
      sendStatus('已生成截图作答', 'ok');
    } catch (error) {
      sendStatus(`截图答题失败：${error.message}`, 'error');
      if (mode === 'analysis') sendLongMode(longMode);
    } finally {
      screenshotBusy = false;
    }
  }

  function publicState() {
    return {
      phase: state.phase,
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      device: state.device,
      deviceId: state.deviceId || engineConfig.deviceId || '',
      notePath: state.notePath,
      error: state.error,
      autoAnswer: state.autoAnswer,
      translateAnswers: state.translateAnswers,
      longMode,
      interviewerSpeaker: state.interviewerSpeaker,
      segments: order.length,
      analysisCount: analyses.length,
      overlayHidden: overlay ? overlay.hidden : true,
      model: config.engine.model,
      asr: config.engine.asr,
      cwd: noteDirectory,
      speakerCount: new Set(orderedItems().map((item) => item.speaker)).size,
    };
  }

  const routes = [];
  const route = (method, routePath, handler) => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: routePath,
      handler: async (req, res) => {
        try {
          if (req.method !== method) throw new HttpError(405, '方法不允许');
          if (method !== 'GET' && !originAllowed(req)) throw new HttpError(403, '来源不被允许');
          await handler(req, res);
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 500;
          sendJson(res, status, { ok: false, error: error.message || String(error) });
        }
      },
    });
    routes.push(dispose);
  };

  route('GET', '/dsh-live-caption/api/status', async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    void url.searchParams.get('sessionId');
    sendJson(res, 200, {
      ok: true,
      state: publicState(),
      items: orderedItems().slice(-8).map(serializeItem),
      analyses: analyses.slice(-2),
      notePath: state.notePath,
    });
  });

  route('GET', '/dsh-live-caption/api/devices', async (req, res) => {
    const engineProbe = new EngineProcess({
      pluginRoot,
      config: engineConfig,
      onEvent: () => {},
      onStderr: () => {},
      onExit: () => {},
    });
    const devices = await engineProbe.listDevices();
    sendJson(res, 200, { ok: true, ...devices });
  });

  route('POST', '/dsh-live-caption/api/start', async (req, res) => {
    const body = await readJson(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!sessionId) throw new HttpError(400, '请从某个对话的面试助手标签页启动');
    const saved = readSessionProfile(sessionId);
    const background = normalizeBackground(body.background || saved?.background || state.background);
    const hasBackground = ['resume', 'position', 'knowledge']
      .some((key) => background[key].trim().length > 0);
    if (!hasBackground) throw new HttpError(400, '请先填写面试背景（简历 / 岗位 / 行业知识至少一项）');
    const interviewerSpeaker = Number.isInteger(body.interviewerSpeaker)
      ? body.interviewerSpeaker
      : (Number.isInteger(saved?.interviewerSpeaker) ? saved.interviewerSpeaker : null);
    const autoAnswer = typeof body.autoAnswer === 'boolean'
      ? body.autoAnswer
      : (saved?.autoAnswer !== false);
    const translateAnswers = typeof body.translateAnswers === 'boolean'
      ? body.translateAnswers
      : (saved?.translateAnswers === true);
    await writeSessionProfile(sessionId, { background, interviewerSpeaker, autoAnswer, translateAnswers });
    const next = startEngine(
      sessionId,
      body.deviceId,
      body.deviceName,
      background,
      interviewerSpeaker,
      autoAnswer,
      translateAnswers,
    );
    sendJson(res, 200, { ok: true, state: next });
  });

  route('POST', '/dsh-live-caption/api/stop', async (req, res) => {
    await readJson(req);
    const next = await stopSession();
    sendJson(res, 200, { ok: true, state: next, notePath: next.notePath });
  });

  route('POST', '/dsh-live-caption/api/analyze', async (req, res) => {
    const body = await readJson(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (sessionId) {
      const saved = readSessionProfile(sessionId);
      state.background = normalizeBackground(body.background || saved?.background || EMPTY_BACKGROUND);
      state.interviewerSpeaker = Number.isInteger(body.interviewerSpeaker)
        ? body.interviewerSpeaker
        : (Number.isInteger(saved?.interviewerSpeaker) ? saved.interviewerSpeaker : null);
    } else {
      if (body.background && typeof body.background === 'object') {
        state.background = normalizeBackground(body.background);
      }
      if (Number.isInteger(body.interviewerSpeaker)) state.interviewerSpeaker = body.interviewerSpeaker;
    }
    const card = await answerManual(typeof body.question === 'string' ? body.question.trim() : '');
    sendJson(res, 200, { ok: true, analysis: card, state: publicState() });
  });

  const configRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-live-caption/api/config',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url || '/', 'http://localhost');
          const sessionId = url.searchParams.get('sessionId') || '';
          if (sessionId) {
            const saved = readSessionProfile(sessionId);
            state.background = normalizeBackground(saved?.background || EMPTY_BACKGROUND);
            state.interviewerSpeaker = Number.isInteger(saved?.interviewerSpeaker) ? saved.interviewerSpeaker : null;
            state.autoAnswer = saved?.autoAnswer !== false;
            state.translateAnswers = saved?.translateAnswers === true;
          }
          sendJson(res, 200, {
            ok: true,
            background: state.background,
            autoAnswer: state.autoAnswer,
            translateAnswers: state.translateAnswers,
            interviewerSpeaker: state.interviewerSpeaker,
          });
          return;
        }
        if (req.method !== 'POST') throw new HttpError(405, '方法不允许');
        if (!originAllowed(req)) throw new HttpError(403, '来源不被允许');
        const body = await readJson(req);
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
        if (body.background && typeof body.background === 'object') {
          state.background = normalizeBackground(body.background);
        }
        if (typeof body.autoAnswer === 'boolean') state.autoAnswer = body.autoAnswer;
        if (typeof body.autoSummary === 'boolean') state.autoAnswer = body.autoSummary;
        if (typeof body.translateAnswers === 'boolean') state.translateAnswers = body.translateAnswers;
        if (body.interviewerSpeaker === null) state.interviewerSpeaker = null;
        else if (Number.isInteger(body.interviewerSpeaker)) state.interviewerSpeaker = body.interviewerSpeaker;
        if (sessionId) {
          await writeSessionProfile(sessionId, {
            background: state.background,
            interviewerSpeaker: state.interviewerSpeaker,
            autoAnswer: state.autoAnswer,
            translateAnswers: state.translateAnswers,
          });
        }
        sendJson(res, 200, { ok: true, state: publicState(), background: state.background });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        sendJson(res, status, { ok: false, error: error.message || String(error) });
      }
    },
  });
  routes.push(configRoute);

  route('POST', '/dsh-live-caption/api/overlay/show', async (req, res) => {
    await readJson(req);
    showOverlay();
    sendJson(res, 200, { ok: true, state: publicState() });
  });

  return () => {
    if (questionTimer) clearTimeout(questionTimer);
    try { engine?.dispose(); } catch { /* ignore */ }
    try { overlay?.dispose(); } catch { /* ignore */ }
    for (const dispose of routes.reverse()) {
      try { dispose(); } catch { /* ignore */ }
    }
  };
}
