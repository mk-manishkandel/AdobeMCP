/**
 * Minimal MCP stdio client: spawns server.mjs and calls tools over JSON-RPC,
 * exactly as Claude Code / Claude desktop would. Used by the demo and live tests.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseResult(result) {
  const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const images = result.content.filter((c) => c.type === 'image');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { isError: !!result.isError, text, json, images };
}

export async function startClient({ env = {}, log = () => {} } = {}) {
  const child = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let nextId = 1;
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
    log(String(d).trimEnd());
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    pending.get(msg.id)?.resolve(msg);
    pending.delete(msg.id);
  });
  child.on('exit', (code) => {
    for (const p of pending.values()) p.reject(new Error(`server exited (${code}): ${stderr}`));
    pending.clear();
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });

  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'adobe-mcp-script', version: '1.0' },
  });
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

  async function callTool(name, args = {}) {
    const res = await request('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`${name}: JSON-RPC error ${res.error.code} ${res.error.message}`);
    return parseResult(res.result);
  }

  /** Like callTool but throws on tool errors and returns the parsed JSON. */
  async function must(name, args = {}) {
    const r = await callTool(name, args);
    if (r.isError) throw new Error(`${name} failed: ${r.text}`);
    return r.json ?? r;
  }

  async function listTools() {
    return (await request('tools/list', {})).result.tools;
  }

  function close() {
    return new Promise((resolve) => {
      child.on('exit', () => resolve());
      child.stdin.end();
    });
  }

  return { serverInfo: init.result.serverInfo, callTool, must, listTools, close };
}

/** First installed font matching one of the queries (in order), else the fallback. */
export async function pickFont(client, queries, fallback) {
  for (const query of queries) {
    const res = await client.must('ai_list_fonts', { query, limit: 1 });
    if (res.fonts.length) return res.fonts[0].name;
  }
  return fallback;
}
