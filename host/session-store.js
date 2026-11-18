import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILE_NAME = 'interview-assistant.json';

function dshHome() {
  return process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh');
}

function validSessionId(sessionId) {
  return typeof sessionId === 'string' && /^session-[A-Za-z0-9-]+$/.test(sessionId);
}

export function resolveSessionDir(sessionId) {
  if (!validSessionId(sessionId)) return null;
  const base = path.join(dshHome(), 'sessions');
  let slugs;
  try {
    slugs = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of slugs) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(base, entry.name, sessionId);
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // try next slug
    }
  }
  return null;
}

export function readSessionProfile(sessionId) {
  const dir = resolveSessionDir(sessionId);
  if (!dir) return null;
  try {
    const raw = fs.readFileSync(path.join(dir, FILE_NAME), 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.background) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSessionProfile(sessionId, data) {
  const dir = resolveSessionDir(sessionId);
  if (!dir) throw new Error('找不到当前对话的会话目录，背景未能写入对话');
  const payload = {
    version: 1,
    sessionId,
    background: data.background || {},
    interviewerSpeaker: Number.isInteger(data.interviewerSpeaker) ? data.interviewerSpeaker : null,
    autoAnswer: data.autoAnswer !== false,
    translateAnswers: data.translateAnswers === true,
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(path.join(dir, FILE_NAME), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}
