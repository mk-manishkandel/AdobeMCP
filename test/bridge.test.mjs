import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { BridgeError, ErrorCodes } from '../src/errors.mjs';
import {
  LOADER,
  buildOsascriptArgs,
  buildScript,
  classifyOsascriptError,
  createBridge,
  mapLine,
  parseScriptOutput,
  tellTarget,
  toJsLiteral,
} from '../src/bridge.mjs';
import { createSerialQueue } from '../src/queue.mjs';
import { illustratorApp } from '../src/apps/illustrator/index.mjs';
import { FAKE_OSASCRIPT, JSX_DIR, SAMPLE_STATE } from './helpers.mjs';

const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-test-'));
after(() => rmSync(work, { recursive: true, force: true }));

const app = illustratorApp({});
const ctxInfo = { appLabel: 'Adobe Illustrator', target: 'com.adobe.illustrator', timeoutSec: 600 };

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

function bridge(opts = {}) {
  return createBridge({ jsxDir: JSX_DIR, osascript: FAKE_OSASCRIPT, tmpDir: join(work, 'tmp'), ...opts });
}

test('loader contains no characters that need AppleScript escaping', () => {
  assert.doesNotMatch(LOADER, /["\\]/);
});

test('tellTarget handles bundle ids, app names, and rejects injection', () => {
  assert.equal(tellTarget('com.adobe.illustrator'), 'application id "com.adobe.illustrator"');
  assert.equal(tellTarget('Adobe Illustrator'), 'application "Adobe Illustrator"');
  assert.throws(() => tellTarget('x" to do shell script "rm'), BridgeError);
  assert.throws(() => tellTarget(''), BridgeError);
});

test('osascript args pass the script path as a run argument, never inline', () => {
  const args = buildOsascriptArgs('com.adobe.illustrator', 600, '/tmp/a "b".jsx');
  assert.equal(args.at(-1), '/tmp/a "b".jsx');
  assert.ok(args.includes('with timeout of 600 seconds'));
  assert.ok(args.some((a) => a.startsWith('tell application id "com.adobe.illustrator" to do javascript "')));
  assert.ok(!args.slice(0, -1).some((a) => a.includes('/tmp/a')));
});

test('toJsLiteral escapes ES3 line terminators', () => {
  assert.equal(toJsLiteral({ s: 'a\u2028b' }), '{"s":"a\\u2028b"}');
  assert.equal(toJsLiteral(undefined), 'null');
});

test('buildScript composes sources and maps lines back to files', () => {
  const { source, segments } = buildScript({
    sources: [
      { file: 'common.jsx', src: '\uFEFFa\r\nb' },
      { file: 'illustrator.jsx', src: 'c\nd\ne' },
    ],
    fnName: 'ai_status',
    args: { n: 'न' },
  });
  const lines = source.split('\n');
  assert.deepEqual(lines, ['a', 'b', 'c', 'd', 'e', 'var ARGS = {"n":"न"};', '__run(function () { return ai_status(ARGS); });']);
  assert.deepEqual(mapLine(segments, 4), { file: 'illustrator.jsx', line: 2 });
  assert.deepEqual(mapLine(segments, 1), { file: 'common.jsx', line: 1 });
  assert.equal(mapLine(segments, 99), null);
});

test('buildScript rejects unsafe function names', () => {
  assert.throws(() => buildScript({ sources: [], fnName: 'x();evil', args: {} }), BridgeError);
});

test('parseScriptOutput returns results and formats errors with file locations', () => {
  const segments = [{ file: 'common.jsx', start: 1, end: 10 }, { file: 'illustrator.jsx', start: 11, end: 50 }];
  assert.deepEqual(parseScriptOutput('{"ok":true,"result":{"a":1}}\n', segments, 'AI'), { a: 1 });
  assert.throws(
    () => parseScriptOutput('{"ok":false,"message":"boom","line":15,"user":false}', segments, 'AI'),
    (e) => e.code === ErrorCodes.SCRIPT_ERROR && e.message === 'boom [illustrator.jsx:5]',
  );
  assert.throws(
    () => parseScriptOutput('{"ok":false,"message":"Font not found","line":null,"user":true}', segments, 'AI'),
    (e) => e.message === 'Font not found',
  );
  assert.throws(
    () => parseScriptOutput('__ADOBE_MCP_LOADER_ERROR__; does not have a value (line 3)', segments, 'AI'),
    (e) => e.code === ErrorCodes.LOADER_ERROR && /does not have a value \[common\.jsx:3\]/.test(e.message),
  );
  assert.throws(() => parseScriptOutput('garbage', segments, 'AI'), (e) => e.code === ErrorCodes.BAD_RESPONSE);
});

test('classifyOsascriptError maps the macOS error codes', () => {
  const cases = [
    ['execution error: Not authorized to send Apple events to Adobe Illustrator. (-1743)', ErrorCodes.PERMISSION_DENIED, /Privacy & Security → Automation/],
    ['execution error: Adobe Illustrator got an error: AppleEvent timed out. (-1712)', ErrorCodes.TIMEOUT, /600 s/],
    ['5:38: syntax error: Can’t get application id "com.x". (-1728)', ErrorCodes.APP_NOT_FOUND, /Could not find/],
    ['execution error: Adobe Illustrator got an error: Connection is invalid. (-609)', ErrorCodes.APP_QUIT, /quit or crashed/],
    ['something odd', ErrorCodes.OSASCRIPT_FAILED, /something odd/],
  ];
  for (const [stderr, code, re] of cases) {
    const err = classifyOsascriptError({ stderr }, ctxInfo);
    assert.equal(err.code, code, stderr);
    assert.match(err.message, re);
  }
  assert.equal(classifyOsascriptError({ killed: true }, ctxInfo).code, ErrorCodes.TIMEOUT);
});

test('bridge runs ai_status end-to-end through the fake osascript', async () => {
  await withEnv({ FAKE_AI_STATE: JSON.stringify(SAMPLE_STATE) }, async () => {
    const res = await bridge().call(app, 'ai_status', {});
    assert.equal(res.documents.length, 2);
    assert.equal(res.documents[0].artboards[1].h, 1920);
  });
});

test('bridge preserves Unicode and quotes through ARGS and back', async () => {
  const text = 'बोस्टन इन्टरनेशनल कलेज — "quotes" \\ \'single\' ✓';
  const res = await bridge().call(app, 'ai_run_script', { code: `ARGS.code.length + ':' + ${JSON.stringify(text)}` });
  assert.equal(res, `${`ARGS.code.length + ':' + ${JSON.stringify(text)}`.length}:${text}`);
});

test('bridge writes the temp script with a UTF-8 BOM and cleans it up', async () => {
  const capture = join(work, 'argv.json');
  const tmp = join(work, 'tmp-bom');
  await withEnv({ FAKE_OSA_CAPTURE: capture }, () => bridge({ tmpDir: tmp, keepTmp: true }).call(app, 'ai_status', {}));
  const file = JSON.parse(readFileSync(capture, 'utf8')).at(-1);
  assert.equal(readFileSync(file).subarray(0, 3).toString('hex'), 'efbbbf');

  await withEnv({ FAKE_OSA_CAPTURE: capture }, () => bridge({ tmpDir: tmp }).call(app, 'ai_status', {}));
  const second = JSON.parse(readFileSync(capture, 'utf8')).at(-1);
  assert.ok(!readdirSync(tmp).includes(second.split('/').at(-1)));
});

test('bridge maps script errors to the jsx line', async () => {
  await assert.rejects(bridge().call(app, 'ai_run_script', { code: 'null.x' }), (e) => {
    assert.equal(e.code, ErrorCodes.SCRIPT_ERROR);
    assert.match(e.message, /null/);
    return true;
  });
});

test('bridge surfaces permission errors with the System Settings path', async () => {
  await withEnv({ FAKE_OSA_STDERR: 'execution error: Not authorized to send Apple events to Adobe Illustrator. (-1743)' }, () =>
    assert.rejects(bridge().call(app, 'ai_status', {}), (e) => e.code === ErrorCodes.PERMISSION_DENIED),
  );
});

test('bridge serialises concurrent calls', async () => {
  const log = join(work, 'order.log');
  await withEnv({ FAKE_OSA_LOG: log, FAKE_OSA_DELAY_MS: '150' }, () => {
    const b = bridge();
    return Promise.all([b.call(app, 'ai_status', {}), b.call(app, 'ai_status', {}), b.call(app, 'ai_status', {})]);
  });
  const events = readFileSync(log, 'utf8').trim().split('\n').map((l) => l.split(' ')[0]);
  assert.deepEqual(events, ['start', 'end', 'start', 'end', 'start', 'end']);
});

test('serial queue keeps going after a failure', async () => {
  const q = createSerialQueue();
  const order = [];
  const a = q.run(async () => { order.push('a'); throw new Error('x'); });
  const b = q.run(async () => { order.push('b'); return 2; });
  await assert.rejects(a);
  assert.equal(await b, 2);
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(q.size, 0);
});
