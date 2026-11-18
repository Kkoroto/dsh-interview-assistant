import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class OverlayProcess {
  constructor(options) {
    this.pluginRoot = options.pluginRoot;
    this.onEvent = options.onEvent || (() => {});
    this.onAnalyze = options.onAnalyze || (() => {});
    this.onScreenshot = options.onScreenshot || (() => {});
    this.onStderr = options.onStderr || (() => {});
    this.onExit = options.onExit || (() => {});
    this.child = null;
    this.hidden = false;
    this.closing = false;
  }

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  exePath() {
    return path.join(this.pluginRoot, 'overlay', 'LiveCaptionOverlay.exe');
  }

  ensure() {
    if (this.running) return this.child;
    const exe = this.exePath();
    if (!fs.existsSync(exe)) throw new Error('悬浮窗程序不存在，请先运行构建脚本');
    const child = spawn(exe, [], {
      cwd: this.pluginRoot,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.hidden = false;
    this.closing = false;

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
          continue;
        }
        if (message.op === 'hidden') this.hidden = true;
        if (message.op === 'window-ready') this.hidden = false;
        if (message.op === 'analyze') this.onAnalyze();
        if (message.op === 'screenshot') this.onScreenshot(message);
        this.onEvent(message);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => this.onStderr(String(chunk)));
    child.on('error', (error) => this.onExit({ error, expected: this.closing }));
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      this.onExit({ code, signal, expected: this.closing });
    });
    return child;
  }

  send(message) {
    const child = this.child;
    if (!child || !child.stdin.writable) return false;
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  show() {
    this.ensure();
    this.send({ op: 'show' });
    this.hidden = false;
  }

  hide() {
    this.send({ op: 'hide' });
    this.hidden = true;
  }

  clear() {
    this.send({ op: 'clear' });
  }

  async close(timeoutMs = 2500) {
    const child = this.child;
    if (!child) return;
    this.closing = true;
    try {
      child.stdin.write('{"op":"close"}\n');
      child.stdin.end();
    } catch {
      // ignore
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        resolve();
      }, timeoutMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.child = null;
  }

  dispose() {
    this.closing = true;
    if (this.child) {
      try { this.child.kill(); } catch { /* ignore */ }
      this.child = null;
    }
  }
}
