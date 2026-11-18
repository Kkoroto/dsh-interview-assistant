import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolvePython } from './engine.js';

const run = promisify(execFile);
const KANA = /[\u3040-\u30ff]/;
const cache = new Map();

export function hasJapaneseKana(text) {
  return KANA.test(String(text || ''));
}

export async function annotateJapanese(text, options = {}) {
  const value = String(text || '');
  if (!value || !KANA.test(value)) return null;
  if (cache.has(value)) return cache.get(value);
  try {
    const pluginRoot = options.pluginRoot;
    const python = resolvePython(pluginRoot, options.soundPluginDir);
    const libs = path.join(pluginRoot, 'libs');
    const cli = path.join(pluginRoot, 'engine', 'furigana_cli.py');
    const encoded = Buffer.from(value, 'utf8').toString('base64');
    const env = {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH ? `${libs}${path.delimiter}${process.env.PYTHONPATH}` : libs,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    };
    const { stdout } = await run(python, ['-B', cli, '--text-base64', encoded], {
      cwd: pluginRoot,
      env,
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout);
    const lines = Array.isArray(parsed.lines) ? parsed.lines : null;
    if (lines) {
      cache.set(value, lines);
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    }
    return lines;
  } catch (error) {
    if (options.debug) console.warn(`[live-caption] furigana failed: ${error.message}`);
    return null;
  }
}
