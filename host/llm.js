import {
  ANSWER_SYSTEM,
  INTRO_SYSTEM,
  LONG_ANSWER_SYSTEM,
  SCREENSHOT_ANALYSIS_SYSTEM,
  SCREENSHOT_SYSTEM,
  buildAnswerPrompt,
  buildLongAnswerPrompt,
  buildScreenshotPrompt,
  buildSelfIntroPrompt,
} from './interview.js';

const LANGUAGE_NAMES = {
  zh: '中文', en: '英语', ja: '日语', ko: '韩语', fr: '法语',
  de: '德语', es: '西班牙语', ru: '俄语', yue: '粤语', it: '意大利语',
  pt: '葡萄牙语', ar: '阿拉伯语',
};

function service(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name);
    return ctx ? ctx[name] : undefined;
  } catch {
    return undefined;
  }
}

function languageName(code) {
  if (!code) return '原文';
  return LANGUAGE_NAMES[String(code).toLowerCase()] || String(code);
}

function stripWrappingQuotes(text) {
  const value = String(text || '').trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === '“' && last === '”') || (first === '「' && last === '」')) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

export class LlmClient {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.config = options.config || {};
  }

  selection() {
    const provider = service(this.ctx, 'agentDefaultModel');
    if (!provider || typeof provider.currentSelection !== 'function') return null;
    try {
      const value = provider.currentSelection();
      if (!value || !value.provider || !value.model) return null;
      return value;
    } catch {
      return null;
    }
  }

  hasLlm() {
    const llm = service(this.ctx, 'llm');
    return Boolean(llm && typeof llm.stream === 'function' && this.selection());
  }

  sessionSelection(session) {
    try {
      const context = session?.requestContext?.();
      if (context?.provider && context.model) {
        return { provider: context.provider, model: context.model };
      }
    } catch {
      // fall through
    }
    try {
      const header = session?.requestHeader?.();
      const config = header?.config;
      if (config?.provider && config.model) {
        return { provider: config.provider, model: config.model };
      }
    } catch {
      // fall through
    }
    return null;
  }

  async lowestReasoningEffort(selected) {
    if (!selected || !selected.provider || !selected.model) return undefined;
    if (!this._effortCache) this._effortCache = new Map();
    const key = `${selected.provider}\n${selected.model}`;
    if (this._effortCache.has(key)) return this._effortCache.get(key);
    const llm = service(this.ctx, 'llm');
    let effort;
    try {
      const info = await llm.resolveModelInfo(selected.provider, selected.model);
      const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : [];
      const preferred = efforts.find((item) => /^(off|none|minimal|low)$/i.test(String(item?.id || '')));
      effort = (preferred || efforts[0] || {}).id;
    } catch {
      effort = undefined;
    }
    this._effortCache.set(key, effort);
    return effort;
  }

  async streamOnce({ system, prompt, maxTokens, timeoutMs, selection, imageRef, reasoningEffort }) {
    const llm = service(this.ctx, 'llm');
    if (!llm || typeof llm.stream !== 'function') throw new Error('当前没有可用的 LLM 服务');
    if (!selection) throw new Error('当前没有可用的对话模型');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('LLM 请求超时')), timeoutMs);
    let text = '';
    let finishKind = '';
    const content = [{ type: 'text', text: prompt }];
    if (imageRef) content.push({ type: 'image', attachment: imageRef });
    try {
      const stream = llm.stream({
        provider: selection.provider,
        model: selection.model,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        system,
        messages: [{ role: 'user', content }],
        maxTokens,
        temperature: 0.25,
        signal: controller.signal,
      });
      for await (const chunk of stream) {
        if (!chunk || typeof chunk !== 'object') continue;
        if (chunk.type === 'text-delta') text += chunk.text || '';
        if (chunk.type === 'finish') {
          const reason = chunk.reason || {};
          finishKind = reason.kind || '';
          if (reason.kind === 'error') {
            throw new Error(reason.failure?.message || '模型返回错误');
          }
          if (reason.kind === 'aborted') {
            throw new Error(reason.failure?.message || '模型请求已取消');
          }
          break;
        }
      }
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    return { text, finishKind };
  }

  async complete({
    system,
    prompt,
    maxTokens = 600,
    timeoutMs = 45000,
    selection,
    imageRef,
    minimalReasoning = false,
    retryEmpty = true,
  }) {
    const selected = selection && selection.provider ? selection : this.selection();
    if (!selected) throw new Error('当前没有可用的对话模型');
    let effort = selected.reasoningEffort;
    if (minimalReasoning) {
      const low = await this.lowestReasoningEffort(selected);
      if (low) effort = low;
    }
    let budget = maxTokens;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.streamOnce({
        system,
        prompt,
        maxTokens: budget,
        timeoutMs,
        selection: selected,
        imageRef,
        reasoningEffort: effort,
      });
      const text = stripWrappingQuotes(result.text);
      if (text) return text;
      if (result.finishKind === 'max-tokens' && retryEmpty && attempt === 0) {
        budget = Math.min(8192, Math.max(1600, budget * 3));
        const low = await this.lowestReasoningEffort(selected);
        if (low) effort = low;
        continue;
      }
      if (result.finishKind === 'max-tokens') {
        throw new Error(
          '模型输出达到上限但只有思考、没有可见正文。截图/长图任务已消耗完 maxTokens；请换用非思考或低思考模型，或提高输出上限。',
        );
      }
      throw new Error('模型没有返回可见正文');
    }
    throw new Error('模型没有返回可见正文');
  }

  async completeForSession(session, options) {
    const preferred = this.sessionSelection(session);
    if (preferred) {
      try {
        return await this.complete({ ...options, selection: preferred });
      } catch (error) {
        if (this.config.translationDebug) {
          console.warn(`[live-caption] session model failed, retry default: ${error.message}`);
        }
      }
    }
    return this.complete(options);
  }

  async answerInterview({ background, question, transcript, conversation, session, instruction, language }) {
    const prompt = buildAnswerPrompt({ background, question, transcript, conversation, instruction, language });
    return this.completeForSession(session, {
      system: ANSWER_SYSTEM,
      prompt,
      maxTokens: 1200,
      minimalReasoning: true,
      timeoutMs: 45000,
    });
  }

  async draftSelfIntro({ background, conversation, session, language }) {
    const prompt = buildSelfIntroPrompt({ background, conversation, language });
    return this.completeForSession(session, {
      system: INTRO_SYSTEM,
      prompt,
      maxTokens: 1000,
      minimalReasoning: true,
      timeoutMs: 45000,
    });
  }

  async answerScreenshot({ imageRef, background, conversation, instruction, mode, session }) {
    const prompt = buildScreenshotPrompt({ background, conversation, instruction, mode });
    return this.completeForSession(session, {
      system: SCREENSHOT_SYSTEM,
      prompt,
      imageRef,
      maxTokens: 1600,
      minimalReasoning: true,
      timeoutMs: 60000,
    });
  }

  async analyzeScreenshot({ imageRef, background, conversation, session }) {
    const prompt = buildScreenshotPrompt({ background, conversation, instruction: '', mode: 'analysis' });
    return this.completeForSession(session, {
      system: SCREENSHOT_ANALYSIS_SYSTEM,
      prompt,
      imageRef,
      maxTokens: 2000,
      minimalReasoning: true,
      timeoutMs: 60000,
    });
  }

  async longAnswer({ background, conversation, analyses, session }) {
    const prompt = buildLongAnswerPrompt({ background, conversation, analyses });
    return this.completeForSession(session, {
      system: LONG_ANSWER_SYSTEM,
      prompt,
      maxTokens: 4000,
      timeoutMs: 120000,
    });
  }

  async translateToChinese(text, language, session) {
    const value = String(text || '').trim();
    if (!value) return '';
    try {
      return await this.viaTranslator(value, language);
    } catch (error) {
      if (this.config.translationDebug) {
        console.warn(`[live-caption] answer translator failed, retry LLM: ${error.message}`);
      }
    }
    const prompt = [
      '把下面的面试回答翻译成简体中文。只输出译文，不要解释、不要加引号、不要保留语言标签。',
      '保留技术名词、数字、公司名和项目名；译文要自然、口语化。',
      '',
      value,
    ].join('\n');
    const system = '你是面试回答翻译助手。只输出简体中文译文，不要回答原文中的问题，不要添加任何说明。';
    return this.completeForSession(session, {
      system,
      prompt,
      maxTokens: 1200,
      minimalReasoning: true,
      timeoutMs: 45000,
    });
  }

  async viaTranslator(text, language) {
    const translator = service(this.ctx, 'translator');
    if (!translator || typeof translator.resolve !== 'function' || typeof translator.translate !== 'function') {
      throw new Error('没有可用的翻译服务');
    }
    const spec = translator.resolve({
      text,
      targetLanguage: 'zh-CN',
      sourceLanguage: language || undefined,
      provider: 'google',
    });
    const result = await translator.translate(spec);
    const trimmed = String(result || '').trim();
    if (!trimmed) throw new Error('翻译服务返回空结果');
    return trimmed;
  }

  async translate(text, language) {
    const prompt = `把下面的${languageName(language)}面试对话翻译成简体中文。只输出译文，不要解释、不要加引号、不要保留语言标签。\n\n${text}`;
    const system = '你是专业的面试对话翻译。翻译要准确、自然、简短，保留人名、数字和专有名词。只输出简体中文译文。';
    try {
      if (this.hasLlm()) {
        return await this.complete({ system, prompt, maxTokens: 500, timeoutMs: 25000 });
      }
    } catch (error) {
      if (this.config.translationDebug) console.warn(`[live-caption] LLM translation failed: ${error.message}`);
    }
    return await this.viaTranslator(text, language);
  }
}
