import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMcpHandler } from '../src/mcp.mjs';
import { ILLUSTRATOR_TOOLS } from '../src/apps/illustrator/index.mjs';
import { startServer } from './server-harness.mjs';

const tools = [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }];
const handler = createMcpHandler({
  serverInfo: { name: 's', version: '1' },
  tools,
  callTool: async (name, args) => ({ content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }] }),
});

test('initialize negotiates protocol version', async () => {
  const res = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(res.result.protocolVersion, '2024-11-05');
  assert.deepEqual(res.result.capabilities, { tools: { listChanged: false } });
  const res2 = await handler({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(res2.result.protocolVersion, '2025-06-18');
});

test('ping, tools/list and tools/call', async () => {
  assert.deepEqual(await handler({ jsonrpc: '2.0', id: 'p', method: 'ping' }), { jsonrpc: '2.0', id: 'p', result: {} });
  const list = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepEqual(list.result.tools, tools);
  const call = await handler({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 't1', arguments: { a: 1 } } });
  assert.equal(call.result.content[0].text, 't1:{"a":1}');
});

test('notifications and client responses get no reply', async () => {
  assert.equal(await handler({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await handler({ jsonrpc: '2.0', id: 9, result: {} }), null);
});

test('protocol errors', async () => {
  assert.equal((await handler({ jsonrpc: '2.0', id: 5, method: 'nope' })).error.code, -32601);
  assert.equal((await handler({ id: 6, method: 'ping' })).error.code, -32600);
  assert.equal((await handler([1, 2])).error.code, -32600);
  assert.equal((await handler({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {} })).error.code, -32602);
});

test('server speaks MCP over stdio end-to-end', async () => {
  const srv = startServer();
  const init = await srv.request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'adobe-mcp');
  assert.match(init.result.instructions, /TOP-LEFT/);
  srv.child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

  const list = await srv.request(2, 'tools/list');
  const names = list.result.tools.map((t) => t.name);
  assert.ok(names.includes('ai_status') && names.includes('ai_run_script'));
  assert.ok(names.every((n) => n.startsWith('ai_')));
  assert.equal(names.length, ILLUSTRATOR_TOOLS.length);

  const status = await srv.request(3, 'tools/call', { name: 'ai_status', arguments: {} });
  assert.equal(status.result.isError, undefined);
  assert.equal(JSON.parse(status.result.content[0].text).documents[0].name, 'Admission.ai');

  const bad = await srv.request(4, 'tools/call', { name: 'ai_run_script', arguments: { code: '' } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /arguments\.code must have at least 1 characters/);

  const unknown = await srv.request(5, 'tools/call', { name: 'ai_nope', arguments: {} });
  assert.equal(unknown.error.code, -32602);

  srv.child.stdin.write('this is not json\n');
  const ping = await srv.request(6, 'ping');
  assert.deepEqual(ping.result, {});

  assert.equal(await srv.close(), 0);
  // stdout carries only JSON-RPC; logs go to stderr.
  assert.ok(srv.stdoutLines.every((l) => JSON.parse(l).jsonrpc === '2.0'));
  assert.ok(srv.stdoutLines.some((l) => JSON.parse(l).error?.code === -32700));
  assert.match(srv.getStderr(), new RegExp(`ready: ${ILLUSTRATOR_TOOLS.length} tools`));
});

test('server reports bridge failures as tool errors, not crashes', async () => {
  const srv = startServer({ FAKE_OSA_STDERR: 'execution error: Not authorized to send Apple events to Adobe Illustrator. (-1743)' });
  await srv.request(1, 'initialize', { protocolVersion: '2025-06-18' });
  const res = await srv.request(2, 'tools/call', { name: 'ai_status', arguments: {} });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /System Settings → Privacy & Security → Automation/);
  assert.equal(await srv.close(), 0);
});
