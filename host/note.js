import fs from 'node:fs';
import path from 'node:path';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatFileStamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function clean(text) {
  return String(text || '').replace(/\r?\n/g, ' ').trim();
}

function cleanBlock(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function groupItems(items) {
  const speakers = [];
  const bySpeaker = new Map();
  for (const item of items) {
    const speaker = item.speakerLabel || '说话人';
    if (!bySpeaker.has(speaker)) {
      bySpeaker.set(speaker, { speaker, languages: [], byLanguage: new Map() });
      speakers.push(speaker);
    }
    const group = bySpeaker.get(speaker);
    const language = item.languageName || item.language || '未知';
    if (!group.byLanguage.has(language)) {
      group.byLanguage.set(language, []);
      group.languages.push(language);
    }
    group.byLanguage.get(language).push(item);
  }
  return { speakers, bySpeaker };
}

export function buildNote({ items, analyses, startedAt, endedAt, sessionId }) {
  const start = startedAt ? new Date(startedAt) : new Date();
  const end = endedAt ? new Date(endedAt) : new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  const { speakers, bySpeaker } = groupItems(items);
  const languages = new Set(items.map((item) => item.languageName || item.language).filter(Boolean));

  const lines = [];
  lines.push(`# 面试助手笔记 · ${formatDateTime(start)} – ${formatClock(end)}`);
  lines.push('');
  lines.push(`- 会话：\`${sessionId || '未提供'}\``);
  lines.push(`- 时长：${minutes} 分 ${remain} 秒`);
  lines.push(`- 识别段数：${items.length}`);
  lines.push(`- 说话人：${speakers.length}`);
  lines.push(`- 语言：${languages.size > 0 ? [...languages].join(' / ') : '无'}`);
  lines.push('');

  if (items.length === 0) {
    lines.push('> 本次没有识别到可用的文字内容。');
    lines.push('');
  }

  for (const speaker of speakers) {
    const group = bySpeaker.get(speaker);
    lines.push(`## ${speaker}`);
    lines.push('');
    for (const language of group.languages) {
      lines.push(`### ${language}`);
      lines.push('');
      for (const item of group.byLanguage.get(language)) {
        const time = item.time || '';
        lines.push(`- **${time}** ${clean(item.text)}`);
        if (item.translation) {
          lines.push(`  - 译文：${clean(item.translation)}`);
        }
        for (const extra of item.extras || []) {
          if (extra && extra.content) {
            lines.push(`  - ${extra.label || '扩展'}：${clean(extra.content)}`);
          }
        }
      }
      lines.push('');
    }
  }

  if (analyses.length > 0) {
    lines.push('## AI 面试助手记录');
    lines.push('');
    for (const analysis of analyses) {
      lines.push(`### ${analysis.time || ''} · ${analysis.label || 'AI 面试作答'}`);
      lines.push('');
      lines.push(cleanBlock(analysis.content));
      if (analysis.translation) {
        lines.push('');
        lines.push(`**中文翻译**`);
        lines.push('');
        lines.push(cleanBlock(analysis.translation));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function writeNote({ directory, note }) {
  if (!directory) throw new Error('没有可用的工作目录');
  if (!fs.existsSync(directory)) throw new Error(`工作目录不存在：${directory}`);
  const stamp = formatFileStamp(new Date());
  let file = path.join(directory, `面试助手-${stamp}.md`);
  let counter = 2;
  while (fs.existsSync(file)) {
    file = path.join(directory, `面试助手-${stamp}-${counter}.md`);
    counter += 1;
  }
  await fs.promises.writeFile(file, `${note}\n`, 'utf8');
  return file;
}
