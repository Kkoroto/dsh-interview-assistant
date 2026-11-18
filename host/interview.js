const SELF_INTRO = /(自我介绍|介绍(一下)?自己|介绍一下自己|自我介绍一下)/;
const SELF_INTRO_JA = /(自己紹介|じこしょうかい)/;
const SELF_INTRO_EN = /(self[\s-]?introduction|introduce yourself|tell (me|us) about yourself|walk (me|us) through your (background|resume)|describe yourself)/i;
const STRONG_QUESTION = /(提问|请回答|回答一下|有没有|分享一下|请你|请您|请问|能不能|可不可以|如何|为什么|你怎么看|你认为|举个例子|谈谈|说说|介绍一下|可以吗|是不是|对吗|\?|？)/;
const WEAK_QUESTION = /(什么|哪些|怎么|是否|多少|多久|哪里|谁|吗|呢)/;
const KANA = /[\u3040-\u30ff]/;
const LATIN = /[A-Za-z]/;
const JA_QUESTION_END = /(ですか|ますか|でしょうか|ますでしょうか|ましたか|ませんか|いただけますか|いただけますでしょうか|いただきたい|教えてください|説明してください|話してください|聞かせてください|具体的に教えて|何ですか)/;
const JA_REQUEST = /(教えて|説明して|話して|聞かせて|紹介して|具体的に|例を挙げて|まとめて|整理して)/;
const JA_WH = /(なぜ|なんで|どのように|どうやって|何を|何が|どこで|いつ|誰が|どちら|どれ|どんな|どのくらい|いくら)/;
const JA_INTERVIEW_KEYWORDS = /(志望動機|自己PR|自己ピーアール|強み|弱み|長所|短所|経験|実績|プロジェクト|転職理由|キャリアプラン|入社後|貢献|チーム|リーダーシップ|課題|解決|なぜ当社|当社を選んだ|最後に何か質問|質問はありますか|年収|いつから|入社可能|ポートフォリオ|技術スタック)/;
const EN_QUESTION_START = /^\s*(what|why|how|when|where|who|which|whose|whom|do|does|did|are|is|was|were|can|could|would|will|should|have|has|may|might)\b/i;
const EN_REQUEST = /(tell (me|us)|walk (me|us) through|explain|describe|share|talk about|introduce|give (me )?an example|can you|could you|would you|what about|how about|have you ever|do you have|are you|is it|what'?s your|what is your|why do you|why did you|how do you|how did you|where do you|when can you|which one|any questions|questions for us|salary expectation|notice period)/i;
const EN_INTERVIEW_KEYWORDS = /(self[\s-]?introduction|introduce yourself|strengths?|weakness(es)?|why this (company|role)|why do you want|experience|experiences|project|challenge|conflict|teamwork|leadership|achievement|failure|career goal|salary|notice period|availability|start date|about yourself|your background|tell me about|questions for us)/i;

export function isSelfIntro(text) {
  const value = String(text || '');
  return SELF_INTRO.test(value) || SELF_INTRO_JA.test(value) || SELF_INTRO_EN.test(value);
}

function isJapaneseQuestion(value) {
  if (!KANA.test(value)) return false;
  if (/[?？]\s*$/.test(value)) return true;
  if (JA_QUESTION_END.test(value)) return true;
  if (JA_REQUEST.test(value)) return true;
  if (JA_WH.test(value) && /(か(?:[。.！？?\s]|$)|？|\?|教えて|説明|話して|聞かせ|具体的)/.test(value)) return true;
  if (JA_INTERVIEW_KEYWORDS.test(value) && /(は|について|を)\s*(お願いします|お願いいたします)/.test(value)) return true;
  if (JA_INTERVIEW_KEYWORDS.test(value) && /(は|について|を)\s*$/.test(value)) return true;
  return false;
}

function isEnglishQuestion(value) {
  if (!LATIN.test(value)) return false;
  if (/[?？]/.test(value)) return true;
  if (EN_QUESTION_START.test(value)) return true;
  if (EN_REQUEST.test(value)) return true;
  if (EN_INTERVIEW_KEYWORDS.test(value) && /^\s*(your|the)\b/i.test(value)
    && /(strength|weakness|experience|project|background|self[\s-]?introduction|company|role|salary|notice period)\s*$/i.test(value)) return true;
  return false;
}

export function isQuestion(text, language) {
  const value = String(text || '').trim();
  if (value.length < 4) return false;
  if (isSelfIntro(value)) return false;
  const code = String(language || '').toLowerCase();
  const japanese = code.startsWith('ja') || KANA.test(value);
  if (japanese && isJapaneseQuestion(value)) return true;
  const english = code.startsWith('en') || (!japanese && LATIN.test(value) && !/[\u4e00-\u9fff]/.test(value));
  if (english && isEnglishQuestion(value)) return true;
  if (STRONG_QUESTION.test(value)) return true;
  if (WEAK_QUESTION.test(value) && /(你|您|请|能|会|想|要|有|做过|负责|打算)/.test(value)) return true;
  return false;
}

export function normalizeQuestionKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\u3000，。！？；：、,.!?;:]/g, '')
    .slice(0, 120);
}

export function backgroundBlock(background) {
  const bg = background && typeof background === 'object' ? background : {};
  const lines = [
    `简历 / 个人背景：${bg.resume || '（未填写）'}`,
    `行业：${bg.industry || '（未填写）'}`,
    `公司：${bg.company || '（未填写）'}`,
    `岗位：${bg.position || '（未填写）'}`,
    `可能涉及的行业知识与问题：${bg.knowledge || '（未填写）'}`,
  ];
  return lines.join('\n');
}

export function transcriptBlock(items, limit = 14) {
  const list = Array.isArray(items) ? items.slice(-limit) : [];
  return list.map((item) => {
    const time = item.time || '';
    const speaker = item.speakerLabel || '说话人';
    return `[${time}] ${speaker}：${item.text || ''}`;
  }).join('\n');
}

export function buildAnswerPrompt({ background, question, transcript, conversation, instruction, language }) {
  const extra = String(instruction || '').trim();
  const languageLine = language === 'ja'
    ? '面试官用日语提问。请用日语作答，使用简单、常用的词。'
    : language === 'en'
      ? '面试官用英语提问。请用英语作答，使用简单、常用的词。'
      : language === 'zh'
        ? '面试官用中文提问。请用中文作答。'
        : '使用与面试官提问相同的语言作答；如果提问不是中文，就用对应语言回答，并使用简单、常用的词。';
  return [
    '【面试背景】',
    backgroundBlock(background),
    '',
    '【本对话上下文】',
    conversation || '（无额外对话上下文）',
    '',
    '【最近面试对话】',
    transcript || '（暂无）',
    '',
    '【面试官当前问题】',
    question || '（没有明确的单句问题，请针对最近对话中被问到的事情作答）',
    '',
    '【作答语言】',
    languageLine,
    extra ? `\n【用户补充要求】\n${extra}` : '',
    '',
    '请快速思考，直接给出面试者可以照着说出口的回答。',
  ].join('\n');
}

export function buildSelfIntroPrompt({ background, conversation, language }) {
  const languageLine = language === 'ja'
    ? '请用日语写，使用简单、常用的词。'
    : '请用中文写。';
  return [
    '【面试背景】',
    backgroundBlock(background),
    '',
    '【本对话上下文】',
    conversation || '（无额外对话上下文）',
    '',
    '请根据以上背景，以面试者本人的口吻写一份 60–90 秒的自我介绍稿。',
    `要求：第一人称、口语化、结构清楚（我是谁 → 核心经历/能力 → 为什么适合这个岗位），不要编造背景中没有的学历、公司或项目，控制在 300 字以内。${languageLine}`,
  ].join('\n');
}

export const ANSWER_SYSTEM = [
  '你是面试者的实时面试助手。',
  '你要以面试者本人的口吻，给出可以直接说出口的回答。',
  '如果面试官用非中文提问，就用对应语言作答；非中文回答尽量使用简单、常用的词。',
  '快速思考：直接给出结论和要点，不要展开思考过程。',
  '要求：先给结论，再给 2–3 个要点；口语化、简短，控制在 180 字以内；',
  '只使用背景信息和对话上下文中可靠的信息；不确定时诚实说明，并给出可展开的方向；',
  '不要编造学历、公司、项目或数据；不要输出括号说明或“以下是回答”之类的引导语。',
].join('');

export const INTRO_SYSTEM = [
  '你是面试者的自我介绍稿撰写助手。',
  '以面试者本人第一人称写自我介绍，口语化、可直接背诵。',
  '如果要求用日语，就用简单、常用的日语词。',
  '只能使用给定背景中的信息，不要编造；控制在 300 字以内。',
].join('');

export function buildScreenshotPrompt({ background, conversation, instruction, mode }) {
  const extra = String(instruction || '').trim();
  const quick = mode !== 'analysis';
  return [
    '【面试背景】',
    backgroundBlock(background),
    '',
    '【本对话上下文】',
    conversation || '（无额外对话上下文）',
    '',
    '【截图任务】',
    quick
      ? '用户截取了一张屏幕。先读取图中的文字、题目、代码、表格或图表关键信息，再结合面试背景和上下文快速给出答案。'
      : '用户截取了一张屏幕。只做分析，不给出最终答案；提取题目、条件、代码、表格或图表的关键数据，并说明解题思路。',
    '',
    '【作答/分析要求】',
    quick
      ? '要快、要短：先给结论或答案，再给 1–2 个要点，控制在 180 字以内；不要复述整张截图。'
      : '控制在 300 字以内；只保留对后续统一作答有用的信息，不要展开完整答案。',
    extra ? `\n【用户补充要求】\n${extra}` : '',
    '',
    '语言：使用截图题目本身的语言作答；无法判断时用中文。不要编造图中没有的信息。',
  ].join('\n');
}

export function buildLongAnswerPrompt({ background, conversation, analyses }) {
  const list = Array.isArray(analyses) ? analyses : [];
  const blocks = list.map((item, index) => {
    const time = item.time || '';
    return `--- 截图 ${index + 1}${time ? `（${time}）` : ''} ---\n${item.text || ''}`;
  }).join('\n\n');
  return [
    '【面试背景】',
    backgroundBlock(background),
    '',
    '【本对话上下文】',
    conversation || '（无额外对话上下文）',
    '',
    '【长问题模式收集到的截图分析】',
    blocks || '（没有可用的截图分析）',
    '',
    '请把以上所有截图内容视为**同一道大题**，结合面试背景和历史对话，给出完整、深入、可直接说出口的回答。',
    '允许长思考、允许长篇幅（最多约 1500–2500 字）；先给总体结论，再分点展开，最后给出可落地的总结。',
    '不要编造背景或截图中没有的信息；不确定的地方要说明。',
  ].join('\n');
}

export const SCREENSHOT_SYSTEM = [
  '你是面试者的实时面试助手，现在通过截图帮助面试者。',
  '先从图片中读取文字、题目、代码、表格或图表，再结合给定的面试背景和对话上下文。',
  '快速思考，直接给结论和要点；不要输出思考过程，不要编造图中没有的内容。',
  '回答控制在 180 字以内，口语化，可以直接说出口。',
].join('');

export const SCREENSHOT_ANALYSIS_SYSTEM = [
  '你是面试者的截图分析助手，当前处于长问题分析模式。',
  '你的任务只是分析截图，不作答、不给最终答案，也不向用户展示。',
  '提取题目、条件、代码、表格或图表的关键信息，记录解题思路和需要统一回答的要点。',
  '只输出分析，控制在 300 字以内；使用截图本身的语言，无法判断时用中文。',
].join('');

export const LONG_ANSWER_SYSTEM = [
  '你是面试者的长问题作答助手。',
  '用户把长问题分析模式期间的多张截图分析视为同一道大题。',
  '请结合面试背景、历史对话和截图分析，给出完整、深入、可直接说出口的答案。',
  '允许长思考、允许长篇幅（约 1500–2500 字），结构清晰，先结论后展开。',
  '不要编造资料；不确定处明确说明。',
].join('');
