/** Test harness: spawns the real server against the fake osascript and talks JSON-RPC to it. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { FAKE_OSASCRIPT, ROOT, SAMPLE_STATE } from './helpers.mjs';

/** Spawns the real server against the fake osascript and talks JSON-RPC to it. */
export function startServer(env = {}) {
  const child = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    env: { ...process.env, ADOBE_MCP_OSASCRIPT: FAKE_OSASCRIPT, FAKE_AI_STATE: JSON.stringify(SAMPLE_STATE), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiting = new Map();
  const stdoutLines = [];
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    stdoutLines.push(line);
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.resolve(msg);
    waiting.delete(msg.id);
  });
  // If the server dies, fail pending requests with its stderr instead of hanging.
  child.on('exit', (code) => {
    for (const { reject } of waiting.values()) reject(new Error(`server exited (${code}):\n${stderr}`));
    waiting.clear();
  });
  const request = (id, method, params) =>
    new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const close = () =>
    new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      child.stdin.end();
    });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  return { child, request, notify, close, exited, stdoutLines, getStderr: () => stderr };
}

