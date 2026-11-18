window.__ModuleLoader__.load({
  id: 'dsh-live-caption',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'liveCaption';
    const TYPE_ID = 'dsh-live-caption';
    const TYPE_KIND = 'live-caption';

    const zh = {
      tabTitle: '面试助手',
      guideDescription: '识别面试官提问 · AI 结合背景实时作答',
      start: '开始',
      stop: '结束',
      starting: '启动中…',
      stopping: '收尾中…',
      listening: '正在聆听面试',
      idle: '准备就绪',
      device: '输出设备',
      defaultDevice: '默认扬声器',
      autoAnswer: '识别到提问自动 AI 作答',
      translateAnswers: 'AI 回答自动翻译成中文',
      translateAnswersHint: '开启后，非中文的 AI 回答会在下方显示中文译文；译文与原文一起隐藏。',
      analyzePlaceholder: '可选：补充问题或作答要求（例如“用 STAR 展开”）',
      analyze: 'AI 作答',
      showOverlay: '显示悬浮窗',
      refresh: '刷新',
      recent: '最近对话',
      analyses: 'AI 面试作答',
      empty: '还没有识别内容。面试官提问后会自动生成作答。',
      idleHint: '展开右侧栏，填写「面试背景」后点「开始」；面试官提问时会自动生成可照读的作答。',
      listeningHint: '正在聆听面试；识别到“有没有 / 请回答 / 分享一下”等提问会自动作答。',
      note: '本次面试笔记',
      copy: '复制路径',
      copied: '已复制',
      noSession: '请先打开一个会话，再开始面试。',
      loadDevicesFailed: '读取音频设备失败：',
      overlayHidden: '悬浮窗已隐藏，可点「显示悬浮窗」重新打开。',
      retry: '重试',
      requestFailed: '请求失败',
      backgroundTitle: '面试背景（开始前填写）',
      backgroundHint: '至少填写简历、岗位或行业知识中的一项；AI 作答会结合这些信息与当前对话上下文。',
      sessionBoundHint: '背景与当前对话绑定；新的面试请新开一个对话，避免沿用上一场的背景。',
      resumeLabel: '简历 / 个人背景',
      resumePlaceholder: '教育、工作经历、项目、技能、亮点数据……',
      industryLabel: '行业',
      companyLabel: '公司',
      positionLabel: '岗位',
      knowledgeLabel: '可能涉及的行业知识与问题',
      knowledgePlaceholder: '岗位 JD、常考问题、业务知识、项目细节……',
      selfIntroLabel: '自我介绍稿（识别到“自我介绍”时直接调出）',
      selfIntroPlaceholder: '留空则 AI 根据背景自动起草一份。',
      saveBackground: '保存背景',
      backgroundSaved: '背景已保存',
      backgroundRequired: '请先填写面试背景（简历 / 岗位 / 行业知识至少一项）',
      interviewer: '面试官说话人',
      auto: '自动识别',
      speakerOption: '说话人',
      manualAnswer: 'AI 作答',
      waitingQuestion: '等待面试官提问…',
    };
    const en = {
      tabTitle: 'Interview assistant',
      guideDescription: 'Recognises interviewer questions · AI answers with your background',
      start: 'Start',
      stop: 'Stop',
      starting: 'Starting…',
      stopping: 'Finishing…',
      listening: 'Listening to the interview',
      idle: 'Ready',
      device: 'Output device',
      defaultDevice: 'Default speaker',
      autoAnswer: 'Answer automatically when a question is recognised',
      translateAnswers: 'Translate AI answers into Chinese',
      translateAnswersHint: 'When enabled, non-Chinese AI answers show a Chinese translation below; both hide together.',
      analyzePlaceholder: 'Optional question or answer instruction (for example: use STAR)',
      analyze: 'AI answer',
      showOverlay: 'Show overlay',
      refresh: 'Refresh',
      recent: 'Recent conversation',
      analyses: 'AI interview answers',
      empty: 'No content yet. Answers appear automatically when the interviewer asks a question.',
      idleHint: 'Open the right sidebar, fill in the interview background, then press Start.',
      listeningHint: 'Listening to the interview. Questions such as “do you have…” trigger an answer automatically.',
      note: 'Interview note',
      copy: 'Copy path',
      copied: 'Copied',
      noSession: 'Open a session before starting the interview assistant.',
      loadDevicesFailed: 'Could not read audio devices: ',
      overlayHidden: 'The overlay is hidden. Use “Show overlay” to bring it back.',
      retry: 'Retry',
      requestFailed: 'Request failed',
      backgroundTitle: 'Interview background (fill before starting)',
      backgroundHint: 'Fill at least your resume, position or industry knowledge. Answers combine this with the current conversation.',
      sessionBoundHint: 'Background is bound to this conversation. Start a new conversation for a new interview.',
      resumeLabel: 'Resume / background',
      resumePlaceholder: 'Education, experience, projects, skills, highlights…',
      industryLabel: 'Industry',
      companyLabel: 'Company',
      positionLabel: 'Position',
      knowledgeLabel: 'Likely industry knowledge and questions',
      knowledgePlaceholder: 'Job description, common questions, domain knowledge, project details…',
      selfIntroLabel: 'Self-introduction script (shown when “introduce yourself” is heard)',
      selfIntroPlaceholder: 'Leave empty and the AI will draft one from your background.',
      saveBackground: 'Save background',
      backgroundSaved: 'Background saved',
      backgroundRequired: 'Please fill the interview background (resume / position / knowledge).',
      interviewer: 'Interviewer speaker',
      auto: 'Auto',
      speakerOption: 'Speaker',
      manualAnswer: 'AI answer',
      waitingQuestion: 'Waiting for the interviewer…',
    };

    function makeT(ctx) {
      let bound = null;
      try {
        bound = ctx.locale && typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null;
      } catch {
        bound = null;
      }
      return (key, fallback) => {
        if (!bound) return fallback || key;
        try {
          const value = bound(key);
          return value === key ? (fallback || key) : value;
        } catch {
          return fallback || key;
        }
      };
    }

    async function request(path, options) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data;
    }

    function phaseLabel(t, phase) {
      if (phase === 'starting') return t('starting');
      if (phase === 'listening') return t('listening');
      if (phase === 'stopping') return t('stopping');
      return t('idle');
    }

    function ExtraCards(props) {
      const extras = props.extras || [];
      if (!Array.isArray(extras) || extras.length === 0) return null;
      return h(
        'div',
        { className: 'lc-extras' },
        extras.map((extra, index) =>
          h(
            'div',
            { className: 'lc-extra', key: `${index}-${extra.label || 'extra'}` },
            h('div', { className: 'lc-extra-label' }, `✦ ${extra.label || '扩展'}`),
            h('div', { className: 'lc-extra-text' }, extra.content || ''),
          ),
        ),
      );
    }

    function RubyText(props) {
      const tokens = Array.isArray(props.tokens) ? props.tokens : [];
      if (tokens.length === 0) return null;
      return h(
        'span',
        { className: 'lc-ruby' },
        tokens.map((token, index) =>
          h(
            'ruby',
            { key: `${index}-${token.t || ''}` },
            token.t || '',
            token.r ? h('rt', null, token.r) : null,
          ),
        ),
      );
    }

    function ItemCard(props) {
      const item = props.item;
      const translation = item.translation
        ? h('div', { className: 'lc-tr' }, `译 ${item.translation}`)
        : item.translationState === 'pending'
          ? h('div', { className: 'lc-tr lc-muted' }, '翻译中…')
          : item.translationState === 'failed'
            ? h('div', { className: 'lc-tr lc-failed' }, '翻译暂不可用')
            : null;
      return h(
        'article',
        { className: 'lc-card', style: { borderLeftColor: item.color || 'var(--dsw-alias-brand-primary)' } },
        h(
          'div',
          { className: 'lc-meta' },
          h('span', { className: 'lc-time' }, item.time || ''),
          h('span', { className: 'lc-speaker', style: { color: item.color } }, item.speakerLabel || ''),
          h('span', { className: 'lc-lang' }, item.languageName || item.language || ''),
        ),
        h(
          'div',
          { className: 'lc-text' },
          item.ruby && item.ruby.length > 0 ? h(RubyText, { tokens: item.ruby }) : (item.text || ''),
        ),
        translation,
        h(ExtraCards, { extras: item.extras }),
      );
    }

    function TabBody(props) {
      const t = props.t;
      const sessionId = props.sessionId;
      const [snapshot, setSnapshot] = React.useState(null);
      const [devices, setDevices] = React.useState([]);
      const [deviceId, setDeviceId] = React.useState('');
      const [deviceError, setDeviceError] = React.useState('');
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      const [question, setQuestion] = React.useState('');
      const [copied, setCopied] = React.useState(false);
      const [background, setBackground] = React.useState({
        resume: '', industry: '', company: '', position: '', knowledge: '', selfIntro: '',
      });
      const [interviewerSpeaker, setInterviewerSpeaker] = React.useState('auto');
      const [backgroundOpen, setBackgroundOpen] = React.useState(true);
      const [backgroundSaved, setBackgroundSaved] = React.useState(false);
      const [autoAnswer, setAutoAnswer] = React.useState(true);
      const [translateAnswers, setTranslateAnswers] = React.useState(false);
      const mounted = React.useRef(true);

      const refresh = React.useCallback(async () => {
        const data = await request('/dsh-live-caption/api/status');
        if (mounted.current) setSnapshot(data);
        return data;
      }, []);

      React.useEffect(() => {
        mounted.current = true;
        let cancelled = false;
        let timer = null;
        setBackground({ resume: '', industry: '', company: '', position: '', knowledge: '', selfIntro: '' });
        setAutoAnswer(true);
        setTranslateAnswers(false);
        setInterviewerSpeaker('auto');
        const load = async () => {
          try {
            await refresh();
          } catch (cause) {
            if (!cancelled && mounted.current) setError(cause.message);
          } finally {
            if (!cancelled && mounted.current) timer = setTimeout(load, 1500);
          }
        };
        void load();
        request('/dsh-live-caption/api/devices')
          .then((data) => {
            if (cancelled || !mounted.current) return;
            setDevices(Array.isArray(data.devices) ? data.devices : []);
            const current = data.defaultId || '';
            setDeviceId((previous) => previous || current);
          })
          .catch((cause) => {
            if (!cancelled && mounted.current) setDeviceError(cause.message);
          });
        request(`/dsh-live-caption/api/config?sessionId=${encodeURIComponent(sessionId || '')}`)
          .then((data) => {
            if (cancelled || !mounted.current) return;
            if (data.background && typeof data.background === 'object') {
              setBackground((previous) => ({
                ...previous,
                ...data.background,
              }));
              const filled = ['resume', 'position', 'knowledge']
                .some((key) => String(data.background[key] || '').trim().length > 0);
              if (filled) setBackgroundOpen(false);
            }
            if (typeof data.autoAnswer === 'boolean') setAutoAnswer(data.autoAnswer);
            if (typeof data.translateAnswers === 'boolean') setTranslateAnswers(data.translateAnswers);
            if (typeof data.interviewerSpeaker === 'number') setInterviewerSpeaker(String(data.interviewerSpeaker));
            else if (data.interviewerSpeaker === null) setInterviewerSpeaker('auto');
          })
          .catch(() => { /* optional */ });
        return () => {
          cancelled = true;
          mounted.current = false;
          if (timer) clearTimeout(timer);
        };
      }, [refresh, sessionId]);

      React.useEffect(() => {
        const state = snapshot && snapshot.state;
        if (!state) return;
        if (state.deviceId) setDeviceId((previous) => previous || state.deviceId);
      }, [snapshot]);

      const state = (snapshot && snapshot.state) || {};
      const phase = state.phase || 'idle';
      const running = phase === 'starting' || phase === 'listening' || phase === 'stopping';
      const items = (snapshot && snapshot.items) || [];
      const analyses = (snapshot && snapshot.analyses) || [];
      const notePath = (snapshot && snapshot.notePath) || state.notePath || '';
      const overlayHidden = Boolean(state.overlayHidden);
      const selectedName = (devices.find((device) => device.id === deviceId) || {}).name || '';
      const hasBackground = ['resume', 'position', 'knowledge']
        .some((key) => String(background[key] || '').trim().length > 0);

      const start = async () => {
        if (!sessionId) {
          setError(t('noSession', '请先打开一个会话，再开始面试。'));
          return;
        }
        if (!hasBackground) {
          setError(t('backgroundRequired', '请先填写面试背景（简历 / 岗位 / 行业知识至少一项）'));
          setBackgroundOpen(true);
          return;
        }
        setBusy('start');
        setError('');
        try {
          await request('/dsh-live-caption/api/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              deviceId: deviceId || undefined,
              deviceName: selectedName || undefined,
              background,
              interviewerSpeaker: interviewerSpeaker === 'auto' ? null : Number(interviewerSpeaker),
              autoAnswer,
              translateAnswers,
            }),
          });
          await refresh();
        } catch (cause) {
          setError(cause.message);
        } finally {
          if (mounted.current) setBusy('');
        }
      };

      const stop = async () => {
        setBusy('stop');
        setError('');
        try {
          await request('/dsh-live-caption/api/stop', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          await refresh();
        } catch (cause) {
          setError(cause.message);
        } finally {
          if (mounted.current) setBusy('');
        }
      };

      const analyze = async () => {
        setBusy('analyze');
        setError('');
        try {
          await request('/dsh-live-caption/api/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              question: question.trim() || undefined,
              background,
              interviewerSpeaker: interviewerSpeaker === 'auto' ? null : Number(interviewerSpeaker),
            }),
          });
          await refresh();
          setQuestion('');
        } catch (cause) {
          setError(cause.message);
        } finally {
          if (mounted.current) setBusy('');
        }
      };

      const toggleAuto = async (event) => {
        const next = event.target.checked;
        setAutoAnswer(next);
        try {
          await request('/dsh-live-caption/api/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ autoAnswer: next, sessionId }),
          });
          await refresh();
        } catch (cause) {
          setError(cause.message);
          setAutoAnswer(!next);
        }
      };

      const toggleTranslate = async (event) => {
        const next = event.target.checked;
        setTranslateAnswers(next);
        try {
          await request('/dsh-live-caption/api/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ translateAnswers: next, sessionId }),
          });
          await refresh();
        } catch (cause) {
          setError(cause.message);
          setTranslateAnswers(!next);
        }
      };

      const setField = (key) => (event) => {
        const value = event.target.value;
        setBackground((previous) => ({ ...previous, [key]: value }));
        setBackgroundSaved(false);
      };

      const saveBackground = async () => {
        setBusy('background');
        setError('');
        try {
          await request('/dsh-live-caption/api/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              background,
              interviewerSpeaker: interviewerSpeaker === 'auto' ? null : Number(interviewerSpeaker),
              autoAnswer,
              translateAnswers,
            }),
          });
          setBackgroundSaved(true);
          setTimeout(() => {
            if (mounted.current) setBackgroundSaved(false);
          }, 1800);
        } catch (cause) {
          setError(cause.message);
        } finally {
          if (mounted.current) setBusy('');
        }
      };

      const showOverlay = async () => {
        try {
          await request('/dsh-live-caption/api/overlay/show', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          await refresh();
        } catch (cause) {
          setError(cause.message);
        }
      };

      const copyPath = async () => {
        if (!notePath) return;
        try {
          await navigator.clipboard.writeText(notePath);
          setCopied(true);
          setTimeout(() => {
            if (mounted.current) setCopied(false);
          }, 1600);
        } catch {
          setError('复制失败，请手动选择路径');
        }
      };

      const primaryLabel = phase === 'starting'
        ? t('starting')
        : phase === 'stopping'
          ? t('stopping')
          : phase === 'listening'
            ? t('stop')
            : t('start');
      const primaryDisabled = busy === 'start' || busy === 'stop' || phase === 'starting' || phase === 'stopping';
      const hint = error
        ? ''
        : phase === 'listening'
          ? t('listeningHint')
          : t('idleHint');

      const textField = (label, key, placeholder, rows) => h(
        'div',
        { className: 'lc-field' },
        h('div', { className: 'lc-label' }, label),
        h('textarea', {
          className: 'lc-textarea',
          rows: rows || 2,
          value: background[key] || '',
          placeholder: placeholder || '',
          onChange: setField(key),
        }),
      );
      const inputField = (label, key, placeholder) => h(
        'div',
        { className: 'lc-field' },
        h('div', { className: 'lc-label' }, label),
        h('input', {
          className: 'lc-textarea lc-textarea-one',
          value: background[key] || '',
          placeholder: placeholder || '',
          onChange: setField(key),
        }),
      );

      return h(
        'div',
        { className: 'lc-root' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'lc-head' },
          h('span', { className: `lc-dot${running ? ' lc-dot-on' : ''}` }),
          h(
            'div',
            { className: 'lc-heading' },
            h('div', { className: 'lc-title' }, t('tabTitle')),
            h('div', { className: 'lc-sub' }, phaseLabel(t, phase)),
          ),
          overlayHidden && running
            ? h('button', { className: 'lc-link', type: 'button', onClick: showOverlay }, t('showOverlay'))
            : null,
        ),
        h(
          'button',
          {
            type: 'button',
            className: `lc-primary${phase === 'listening' ? ' lc-primary-stop' : ''}`,
            onClick: phase === 'listening' ? stop : start,
            disabled: primaryDisabled,
          },
          primaryLabel,
        ),
        error ? h('div', { className: 'lc-error' }, error) : null,
        h(
          'details',
          {
            className: 'lc-bg',
            open: backgroundOpen,
            onToggle: (event) => setBackgroundOpen(event.target.open),
          },
          h('summary', { className: 'lc-bg-summary' }, t('backgroundTitle')),
          h('div', { className: 'lc-bg-hint' }, t('backgroundHint')),
          h('div', { className: 'lc-bg-hint' }, t('sessionBoundHint')),
          textField(t('resumeLabel'), 'resume', t('resumePlaceholder'), 3),
          h(
            'div',
            { className: 'lc-grid3' },
            inputField(t('industryLabel'), 'industry', ''),
            inputField(t('companyLabel'), 'company', ''),
            inputField(t('positionLabel'), 'position', ''),
          ),
          textField(t('knowledgeLabel'), 'knowledge', t('knowledgePlaceholder'), 3),
          textField(t('selfIntroLabel'), 'selfIntro', t('selfIntroPlaceholder'), 3),
          h(
            'div',
            { className: 'lc-bg-actions' },
            h(
              'label',
              { className: 'lc-check lc-check-inline' },
              h('span', { className: 'lc-label' }, t('interviewer')),
              h(
                'select',
                {
                  className: 'lc-select lc-select-compact',
                  value: interviewerSpeaker,
                  onChange: (event) => {
                    setInterviewerSpeaker(event.target.value);
                    setBackgroundSaved(false);
                  },
                },
                h('option', { value: 'auto' }, t('auto')),
                [1, 2, 3, 4, 5, 6].map((n) => h('option', { key: n, value: String(n) }, `${t('speakerOption')} ${n}`)),
              ),
            ),
            h(
              'button',
              { type: 'button', className: 'lc-button', onClick: saveBackground, disabled: busy === 'background' },
              busy === 'background' ? '…' : t('saveBackground'),
            ),
            backgroundSaved ? h('span', { className: 'lc-saved' }, t('backgroundSaved')) : null,
          ),
        ),
        h(
          'label',
          { className: 'lc-row' },
          h('span', { className: 'lc-label' }, t('device')),
          h(
            'select',
            {
              className: 'lc-select',
              value: deviceId,
              disabled: running,
              onChange: (event) => setDeviceId(event.target.value),
            },
            h('option', { value: '' }, t('defaultDevice')),
            devices.map((device) => h('option', { key: device.id, value: device.id }, device.name || device.id)),
            deviceId && !devices.some((device) => device.id === deviceId)
              ? h('option', { value: deviceId }, state.device || deviceId)
              : null,
          ),
        ),
        deviceError
          ? h('div', { className: 'lc-hint lc-warn' }, `${t('loadDevicesFailed')}${deviceError}`)
          : null,
        h(
          'label',
          { className: 'lc-check' },
          h('input', {
            type: 'checkbox',
            checked: autoAnswer,
            onChange: toggleAuto,
            disabled: phase === 'starting' || phase === 'stopping',
          }),
          h('span', null, t('autoAnswer')),
        ),
        h(
          'label',
          { className: 'lc-check', title: t('translateAnswersHint') },
          h('input', {
            type: 'checkbox',
            checked: translateAnswers,
            onChange: toggleTranslate,
            disabled: phase === 'starting' || phase === 'stopping',
          }),
          h('span', null, t('translateAnswers')),
        ),
        h(
          'div',
          { className: 'lc-analyze' },
          h('input', {
            className: 'lc-input',
            value: question,
            placeholder: t('analyzePlaceholder'),
            onChange: (event) => setQuestion(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !busy && phase === 'listening') {
                event.preventDefault();
                void analyze();
              }
            },
            disabled: phase !== 'listening' || busy === 'analyze',
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'lc-button',
              onClick: analyze,
              disabled: phase !== 'listening' || busy === 'analyze' || items.length === 0,
            },
            busy === 'analyze' ? '…' : t('analyze'),
          ),
        ),
        h(
          'div',
          { className: 'lc-actions' },
          h('button', { type: 'button', className: 'lc-button', onClick: showOverlay }, t('showOverlay')),
          h('button', { type: 'button', className: 'lc-button', onClick: () => void refresh() }, t('refresh')),
        ),
        hint ? h('div', { className: 'lc-hint' }, hint) : null,
        h('div', { className: 'lc-section-title' }, t('recent')),
        items.length === 0
          ? h('div', { className: 'lc-empty' }, t('empty'))
          : h('div', { className: 'lc-list' }, items.slice().reverse().map((item) => h(ItemCard, { key: item.id, item }))),
        analyses.length > 0
          ? h(
            'div',
            { className: 'lc-analyses' },
            h('div', { className: 'lc-section-title' }, t('analyses')),
            analyses.map((analysis) =>
              h(
                'div',
                { className: 'lc-analysis', key: analysis.id || analysis.time },
                h('div', { className: 'lc-analysis-label' }, `✦ ${analysis.label || 'AI 面试作答'} · ${analysis.time || ''}`),
                analysis.rubyLines && analysis.rubyLines.length > 0
                  ? h(
                    'div',
                    { className: 'lc-analysis-text lc-ruby-lines' },
                    analysis.rubyLines.map((line, lineIndex) =>
                      h(
                        'div',
                        { className: 'lc-ruby-line', key: lineIndex },
                        line && line.length > 0 ? h(RubyText, { tokens: line }) : '\u00a0',
                      ),
                    ),
                  )
                  : h('div', { className: 'lc-analysis-text' }, analysis.content || ''),
                analysis.translation
                  ? h('div', { className: 'lc-analysis-translation' }, `译 ${analysis.translation}`)
                  : null,
              ),
            ),
          )
          : null,
        notePath
          ? h(
            'div',
            { className: 'lc-note' },
            h('div', { className: 'lc-note-label' }, t('note')),
            h('code', { className: 'lc-note-path' }, notePath),
            h('button', { type: 'button', className: 'lc-link', onClick: copyPath }, copied ? t('copied') : t('copy')),
          )
          : null,
        state.error && phase === 'error'
          ? h('div', { className: 'lc-error' }, state.error)
          : null,
      );
    }

    const CSS = `
      .lc-root { display:flex; flex-direction:column; gap:10px; padding:12px 12px 18px; box-sizing:border-box; min-height:100%; color:var(--dsw-alias-label-primary); font-size:13px; }
      .lc-head { display:flex; align-items:center; gap:8px; }
      .lc-heading { min-width:0; }
      .lc-dot { width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); flex:none; }
      .lc-dot-on { background:var(--dsw-alias-state-success-primary); }
      .lc-title { font-size:14px; font-weight:600; line-height:1.3; }
      .lc-sub { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.4; }
      .lc-primary { width:100%; height:36px; border-radius:9px; border:1px solid var(--dsw-alias-brand-primary); background:var(--dsw-alias-brand-primary); color:#fff !important; font-size:14px; font-weight:600; cursor:pointer; }
      .lc-primary:hover:not(:disabled) { filter:brightness(1.05); }
      .lc-primary:disabled { opacity:.55; cursor:default; }
      .lc-primary-stop { border-color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-state-error-primary); }
      .lc-row { display:flex; align-items:center; gap:8px; }
      .lc-label { color:var(--dsw-alias-label-secondary); font-size:12px; flex:none; }
      .lc-select { flex:1; min-width:0; height:30px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); padding:0 8px; font-size:12px; }
      .lc-check { display:flex; align-items:center; gap:7px; font-size:12px; color:var(--dsw-alias-label-secondary); cursor:pointer; }
      .lc-check input { accent-color:var(--dsw-alias-brand-primary); }
      .lc-check-inline { justify-content:space-between; gap:8px; }
      .lc-bg { border:1px solid var(--dsw-alias-border-l1); border-radius:9px; background:var(--dsw-alias-bg-layer-1); padding:8px 9px; }
      .lc-bg-summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--dsw-alias-label-primary); }
      .lc-bg-hint { margin-top:5px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.45; }
      .lc-field { display:flex; flex-direction:column; gap:3px; margin-top:7px; }
      .lc-field > .lc-label { font-size:11px; }
      .lc-textarea { width:100%; box-sizing:border-box; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); padding:6px 7px; font-size:12px; line-height:1.45; resize:vertical; font-family:inherit; }
      .lc-textarea-one { height:30px; resize:none; }
      .lc-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
      .lc-bg-actions { display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
      .lc-select-compact { width:auto; min-width:96px; height:26px; }
      .lc-saved { color:var(--dsw-alias-state-success-primary); font-size:11px; }
      .lc-analyze { display:flex; gap:6px; }
      .lc-input { flex:1; min-width:0; height:30px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); padding:0 8px; font-size:12px; }
      .lc-button { height:30px; padding:0 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font-size:12px; cursor:pointer; white-space:nowrap; }
      .lc-button:disabled { opacity:.5; cursor:default; }
      .lc-actions { display:flex; gap:6px; }
      .lc-actions .lc-button { flex:1; }
      .lc-hint { color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.5; }
      .lc-warn { color:var(--dsw-alias-state-warn-primary); }
      .lc-error { padding:7px 9px; border-radius:8px; border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-bg-layer-1); font-size:12px; white-space:pre-wrap; }
      .lc-section-title { font-size:11px; font-weight:600; color:var(--dsw-alias-label-secondary); margin-top:4px; letter-spacing:.02em; }
      .lc-empty { padding:14px 10px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:12px; border:1px dashed var(--dsw-alias-border-l1); border-radius:9px; }
      .lc-list { display:flex; flex-direction:column; gap:7px; max-height:420px; overflow:auto; }
      .lc-card { border:1px solid var(--dsw-alias-border-l1); border-left:3px solid var(--dsw-alias-brand-primary); border-radius:9px; padding:8px 9px; background:var(--dsw-alias-bg-layer-1); }
      .lc-meta { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--dsw-alias-label-secondary); flex-wrap:wrap; }
      .lc-time { color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
      .lc-speaker { font-weight:600; }
      .lc-lang { padding:0 5px; border-radius:4px; background:var(--dsw-alias-bg-layer-2); font-size:10px; }
      .lc-text { margin-top:4px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
      .lc-tr { margin-top:3px; color:var(--dsw-alias-label-secondary); line-height:1.5; white-space:pre-wrap; word-break:break-word; }
      .lc-muted { opacity:.65; }
      .lc-failed { color:var(--dsw-alias-state-warn-primary); }
      .lc-extras { display:flex; flex-direction:column; gap:4px; }
      .lc-extra { margin-top:5px; padding:5px 7px; border-radius:7px; background:var(--dsw-alias-bg-layer-2); font-size:12px; }
      .lc-extra-label { font-size:10px; font-weight:600; color:var(--dsw-alias-brand-primary); }
      .lc-extra-text { margin-top:2px; line-height:1.5; white-space:pre-wrap; }
      .lc-analyses { display:flex; flex-direction:column; gap:6px; }
      .lc-analysis { border:1px solid var(--dsw-alias-border-l1); border-radius:9px; padding:8px 9px; background:var(--dsw-alias-bg-layer-1); }
      .lc-analysis-label { font-size:10px; font-weight:600; color:var(--dsw-alias-brand-primary); }
      .lc-analysis-text { margin-top:3px; line-height:1.5; white-space:pre-wrap; }
      .lc-analysis-translation { margin-top:6px; line-height:1.5; white-space:pre-wrap; color:var(--dsw-alias-label-secondary); border-top:1px dashed var(--dsw-alias-border-l1); padding-top:5px; }
      .lc-ruby { ruby-position: over; }
      .lc-ruby rt { font-size:0.55em; color:var(--dsw-alias-label-secondary); font-weight:400; letter-spacing:0; }
      .lc-ruby-line { line-height:2; white-space:normal; }
      .lc-note { display:flex; flex-direction:column; gap:4px; padding:8px 9px; border-radius:9px; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); }
      .lc-note-label { font-size:10px; font-weight:600; color:var(--dsw-alias-label-secondary); }
      .lc-note-path { font-size:11px; word-break:break-all; color:var(--dsw-alias-label-primary); }
      .lc-link { border:none; background:transparent; color:var(--dsw-alias-brand-primary); font-size:11px; cursor:pointer; padding:0; text-align:left; }
      .lc-link:hover { text-decoration:underline; }
    `;

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'locale'],
      apply(ctx) {
        const t = makeT(ctx);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'live-caption: locale');
        ctx.effect(() => {
          const disposeType = ctx.sidebarRightTabs.register({
            id: TYPE_ID,
            kind: TYPE_KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => t('tabTitle', '面试助手'),
            guide: [
              {
                id: 'main',
                order: 10,
                title: () => t('tabTitle', '面试助手'),
                description: () => t('guideDescription', '识别面试官提问 · AI 结合背景实时作答'),
              },
            ],
          });
          const disposeBody = ctx.slots.register(
            { name: 'sidebar.right.pane.tab', key: TYPE_ID },
            (props) => h(TabBody, Object.assign({}, props, { t })),
          );
          return () => {
            disposeBody();
            disposeType();
          };
        }, 'live-caption: tab');
      },
    };
  },
});
