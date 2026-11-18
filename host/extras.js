function keywordMatches(text, keyword) {
  if (!keyword) return false;
  const needle = String(keyword).trim();
  if (!needle) return false;
  if (/^[a-z0-9 _-]+$/i.test(needle)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    return pattern.test(text);
  }
  return text.includes(needle);
}

export function normalizePreparedAnswers(value) {
  if (!Array.isArray(value)) return [];
  const answers = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    const answer = typeof entry.answer === 'string' ? entry.answer.trim() : '';
    if (!answer || keywords.length === 0) continue;
    answers.push({ keywords: keywords.map(String), answer, label: entry.label || '预置答案' });
  }
  return answers;
}

export function matchPreparedAnswers(text, answers) {
  const source = String(text || '');
  if (!source) return [];
  const matches = [];
  for (const entry of answers) {
    if (entry.keywords.some((keyword) => keywordMatches(source, keyword))) {
      matches.push({
        label: entry.label || '预置答案',
        content: entry.answer,
        tone: 'info',
      });
    }
    if (matches.length >= 3) break;
  }
  return matches;
}
