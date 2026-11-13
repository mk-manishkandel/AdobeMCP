/**
 * Production hardening: cancellation, per-tool timeouts, size limits, temp-file
 * hygiene, output errors and graceful shutdown.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { after, test } from 'node:test';
import { createBridge, sweepStaleTmp } from '../src/bridge.mjs';
import { ErrorCodes } from '../src/errors.mjs';
import { createMcpHandler, serveStdio } from '../src/mcp.mjs';
import { createToolRunner } from '../src/tools.mjs';
import { ILLUSTRATOR_TOOLS, illustratorApp } from '../src/apps/illustrator/index.mjs';
import { FAKE_OSASCRIPT, JSX_DIR, SAMPLE_STATE } from './helpers.mjs';
import { startServer } from './server-harness.mjs';

const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-hard-'));
after(() => rmSync(work, { recursive: true, force: true }));
const app = illustratorApp({});

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

const bridge = (opts = {}) => createBridge({ jsxDir: JSX_DIR, osascript: FAKE_OSASCRIPT, tmpDir: join(work, 'tmp'), ...opts });

/* ---------- MCP layer ---------- */

test('tools/call receives an AbortSignal that notifications/cancelled aborts, and the reply is dropped', async () => {
  let seen;
  let release;
  const handler = createMcpHandler({
    serverInfo: { name: 's', version: '1' },
    tools: [],
    callTool: (name, args, { signal }) => {
      seen = signal;
      return new Promise((resolve) => { release = () => resolve({ content: [] }); });
    },
  });
  const pending = handler({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'x', arguments: {} } });
  await new Promise((r) => setImmediate(r));
  assert.equal(seen.aborted, false);
  assert.equal(await handler({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 11, reason: 'user' } }), null);
  assert.equal(seen.aborted, true);
  release();
  assert.equal(await pending, null);
});

test('cancelling an unknown request id is harmless', async () => {
  const handler = createMcpHandler({ serverInfo: { name: 's', version: '1' }, tools: [], callTool: async () => ({ content: [] }) });
  assert.equal(await handler({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'nope' } }), null);
});

test('serveStdio rejects oversized messages without dying', async () => {
  const input = new PassThrough();
  const out = [];
  const output = new Writable({ write(chunk, _e, cb) { out.push(String(chunk)); cb(); } });
  const done = serveStdio(async (msg) => ({ jsonrpc: '2.0', id: msg.id, result: {} }), { input, output, maxMessageBytes: 100 });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(200) } })}\n`);
  input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
  input.end();
  await done;
  const replies = out.join('').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(replies[0].error.code, -32600);
  assert.match(replies[0].error.message, /too large/);
  assert.deepEqual(replies[1], { jsonrpc: '2.0', id: 2, result: {} });
});

test('serveStdio survives a broken output stream (client went away)', async () => {
  const input = new PassThrough();
  const output = new Writable({ write(_c, _e, cb) { cb(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })); } });
  const logs = [];
  const done = serveStdio(async (msg) => ({ jsonrpc: '2.0', id: msg.id, result: {} }), { input, output, log: (...a) => logs.push(a.join(' ')) });
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  input.end();
  await done;
  assert.ok(logs.some((l) => /EPIPE/.test(l)), logs.join('\n'));
});

/* ---------- tool runner ---------- */

test('tool runner forwards the signal and the tool timeout to the bridge, and logs each call', async () => {
  const calls = [];
  const logs = [];
  const fakeBridge = { tmpDir: work, call: async (a, fn, args, opts) => { calls.push({ fn, opts }); return { ok: 1 }; } };
  const tool = { name: 'ai_quick', description: 'quick tool for the test', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, timeoutSec: 30 };
  const runner = createToolRunner({ apps: [{ ...app, tools: [tool] }], bridge: fakeBridge, log: (...a) => logs.push(a.join(' ')) });
  const signal = new AbortController().signal;
  await runner.callTool('ai_quick', {}, { signal });
  assert.equal(calls[0].opts.signal, signal);
  assert.equal(calls[0].opts.timeoutSec, 30);
  assert.ok(logs.some((l) => /^info ai_quick ok \d+ ms$/.test(l)), logs.join('\n'));
});

test('read-only and quick tools declare short timeouts', () => {
  for (const name of ['ai_status', 'ai_get_document_info', 'ai_list_fonts', 'ai_undo']) {
    const tool = ILLUSTRATOR_TOOLS.find((t) => t.name === name);
    assert.ok(tool.timeoutSec > 0 && tool.timeoutSec <= 60, `${name} timeoutSec=${tool.timeoutSec}`);
  }
});

/* ---------- bridge ---------- */

test('bridge refuses to start a call whose signal is already aborted', async () => {
  const capture = join(work, 'never.json');
  const ac = new AbortController();
  ac.abort();
  await withEnv({ FAKE_OSA_CAPTURE: capture }, () =>
    assert.rejects(bridge().call(app, 'ai_status', {}, { signal: ac.signal }), (e) => e.code === ErrorCodes.CANCELLED),
  );
  assert.equal(existsSync(capture), false);
});

test('bridge applies the per-call timeout, capped by the global one', async () => {
  const capture = join(work, 'argv-timeout.json');
  await withEnv({ FAKE_OSA_CAPTURE: capture, FAKE_AI_STATE: JSON.stringify(SAMPLE_STATE) }, async () => {
    await bridge({ timeoutSec: 300 }).call(app, 'ai_status', {}, { timeoutSec: 45 });
    assert.match(readFileSync(capture, 'utf8'), /with timeout of 45 seconds/);
    await bridge({ timeoutSec: 20 }).call(app, 'ai_status', {}, { timeoutSec: 45 });
    assert.match(readFileSync(capture, 'utf8'), /with timeout of 20 seconds/);
  });
});

test('bridge writes temp scripts readable by the owner only', async () => {
  const capture = join(work, 'argv-mode.json');
  await withEnv({ FAKE_OSA_CAPTURE: capture, FAKE_AI_STATE: JSON.stringify(SAMPLE_STATE) }, () =>
    bridge({ tmpDir: join(work, 'tmp-mode'), keepTmp: true }).call(app, 'ai_status', {}),
  );
  const file = JSON.parse(readFileSync(capture, 'utf8')).at(-1);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('sweepStaleTmp removes old leftover scripts and keeps recent ones', async () => {
  const dir = join(work, 'sweep');
  mkdirSync(dir, { recursive: true });
  const old = join(dir, 'ai_status-old.jsx');
  const fresh = join(dir, 'ai_status-new.jsx');
  const other = join(dir, 'notes.txt');
  for (const f of [old, fresh, other]) writeFileSync(f, 'x');
  const dayAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  utimesSync(old, dayAgo, dayAgo);
  utimesSync(other, dayAgo, dayAgo);
  assert.equal(await sweepStaleTmp(dir, 24 * 3600 * 1000), 1);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(other), true);
  assert.equal(await sweepStaleTmp(join(work, 'missing-dir')), 0);
});

/* ---------- whole server ---------- */

test('a cancelled call that has not started never reaches Illustrator', async () => {
  const log = join(work, 'cancel-order.log');
  const srv = startServer({ FAKE_OSA_LOG: log, FAKE_OSA_DELAY_MS: '400' });
  await srv.request(1, 'initialize', { protocolVersion: '2025-06-18' });
  const first = srv.request(2, 'tools/call', { name: 'ai_status', arguments: {} });
  const second = srv.request(3, 'tools/call', { name: 'ai_status', arguments: {} });
  second.catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
  srv.notify('notifications/cancelled', { requestId: 3, reason: 'test' });
  const res = await first;
  assert.equal(res.result.isError, undefined);
  assert.equal(await srv.close(), 0);
  const starts = readFileSync(log, 'utf8').trim().split('\n').filter((l) => l.startsWith('start'));
  assert.equal(starts.length, 1);
  assert.ok(!srv.stdoutLines.some((l) => JSON.parse(l).id === 3));
});

test('server exits cleanly on SIGTERM', async () => {
  const srv = startServer();
  await srv.request(1, 'initialize', { protocolVersion: '2025-06-18' });
  srv.child.kill('SIGTERM');
  const { code } = await srv.exited;
  assert.equal(code, 0);
  assert.match(srv.getStderr(), /SIGTERM/);
});
