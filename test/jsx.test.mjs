import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { toJsLiteral } from '../src/bridge.mjs';
import { ALL_JSX, JSX_DIR, SAMPLE_STATE, loadJsx, readJsx, run } from './helpers.mjs';

const JSX_FILES = readdirSync(JSX_DIR).filter((f) => f.endsWith('.jsx'));

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '');
}

const ES3_FORBIDDEN = [
  [/=>/, 'arrow function'],
  [/\blet\s/, 'let'],
  [/\bconst\s/, 'const'],
  [/`/, 'template literal'],
  [/\bclass\s+\w/, 'class'],
  [/\.\.\.\w/, 'spread'],
  [/\bJSON\./, 'JSON object (not available in ExtendScript)'],
  [/Array\.isArray/, 'Array.isArray'],
  [/\.forEach\(|\.map\(|\.filter\(|\.reduce\(|\.some\(|\.every\(/, 'ES5 array method'],
  [/\.trim\(\)|Object\.keys|Date\.now|\.bind\(/, 'ES5 built-in'],
];

for (const file of JSX_FILES) {
  test(`${file} parses`, () => {
    assert.doesNotThrow(() => new vm.Script(readJsx(file), { filename: file }));
  });

  test(`${file} uses only ES3 syntax ExtendScript understands`, () => {
    const code = stripCommentsAndStrings(readJsx(file));
    for (const [re, what] of ES3_FORBIDDEN) {
      const line = code.split('\n').findIndex((l) => re.test(l));
      assert.equal(line, -1, `${file}:${line + 1} uses ${what}`);
    }
  });
}

test('__json round-trips Devanagari, quotes, backslashes and control chars', () => {
  const ctx = loadJsx(['common.jsx']);
  const value = {
    ne: 'बोस्टन इन्टरनेशनल कलेज',
    quotes: 'say "hi" & \'bye\'',
    slash: 'C:\\path\\x',
    ctrl: 'a\nb\tc\r\u0001\u2028\u2029',
    nums: [0, -1.5, 1e21],
    nested: { ok: true, nil: null, deep: [[{ x: 'ẋ' }]] },
  };
  // Build the value inside the vm realm (as ARGS is in Illustrator), then serialise it.
  const text = run(ctx, `__json(${toJsLiteral(value)})`);
  assert.deepEqual(JSON.parse(text), value);
});

test('__json drops functions and undefined, nulls non-finite numbers, stringifies non-plain objects', () => {
  const ctx = loadJsx(['common.jsx']);
  const text = run(ctx, '__json({ f: function(){}, u: undefined, n: NaN, i: Infinity, e: app.userInteractionLevel })');
  assert.deepEqual(JSON.parse(text), { n: null, i: null, e: 'UserInteractionLevel.DISPLAYALERTS' });
});

test('__run wraps results and reports thrown errors', () => {
  const ctx = loadJsx(['common.jsx']);
  assert.deepEqual(JSON.parse(run(ctx, '__run(function(){ return {a:1}; })')), { ok: true, result: { a: 1 } });
  assert.deepEqual(JSON.parse(run(ctx, '__run(function(){ })')), { ok: true, result: null });
  const err = JSON.parse(run(ctx, '__run(function(){ null.x; })'));
  assert.equal(err.ok, false);
  assert.equal(err.user, false);
  assert.match(err.message, /null/);
});

test('__fail produces a user error without line noise', () => {
  const ctx = loadJsx(['common.jsx']);
  const err = JSON.parse(run(ctx, '__run(function(){ __fail("Font not found: Foo"); })'));
  assert.deepEqual(err, { ok: false, error: 'Font not found: Foo', message: 'Font not found: Foo', line: null, user: true });
});

test('illustrator hooks suppress dialogs during a call and restore afterwards', () => {
  const ctx = loadJsx(ALL_JSX);
  const during = JSON.parse(run(ctx, '__run(function(){ return [String(app.userInteractionLevel), String(app.coordinateSystem)]; })'));
  assert.deepEqual(during.result, ['UserInteractionLevel.DONTDISPLAYALERTS', 'CoordinateSystem.DOCUMENTCOORDINATESYSTEM']);
  assert.equal(String(run(ctx, 'app.userInteractionLevel')), 'UserInteractionLevel.DISPLAYALERTS');
  assert.equal(String(run(ctx, 'app.coordinateSystem')), 'CoordinateSystem.ARTBOARDCOORDINATESYSTEM');
});

test('hooks restore settings even when the tool throws', () => {
  const ctx = loadJsx(ALL_JSX);
  run(ctx, '__run(function(){ throw new Error("boom"); })');
  assert.equal(String(run(ctx, 'app.userInteractionLevel')), 'UserInteractionLevel.DISPLAYALERTS');
});

test('coordinate helpers flip y relative to the chosen artboard', () => {
  const ctx = loadJsx(ALL_JSX, SAMPLE_STATE);
  // Artboard 1 rect [1200, 1080, 2280, -840]: top-left is (1200, 1080) in AI space.
  assert.deepEqual([...run(ctx, '__toAi(app.activeDocument, 1, 10, 20)')], [1210, 1060]);
  assert.deepEqual({ ...run(ctx, '__fromAi(app.activeDocument, 1, 1210, 1060)') }, { x: 10, y: 20 });
  assert.deepEqual({ ...run(ctx, '__boxOf(app.activeDocument, 0, [100, 980, 300, 900])') }, { x: 100, y: 100, w: 200, h: 80 });
  // Default artboard is the active one (index 1).
  assert.deepEqual([...run(ctx, '__toAi(app.activeDocument, null, 0, 0)')], [1200, 1080]);
});

test('artboard index out of range is a clear user error', () => {
  const ctx = loadJsx(ALL_JSX, SAMPLE_STATE);
  const err = JSON.parse(run(ctx, '__run(function(){ return __abRect(app.activeDocument, 5); })'));
  assert.equal(err.user, true);
  assert.match(err.message, /Artboard 5 does not exist \(document has 2, indices 0-1\)/);
});

test('ai_status summarises documents and artboards', () => {
  const ctx = loadJsx(ALL_JSX, SAMPLE_STATE);
  const res = JSON.parse(run(ctx, '__run(function(){ return ai_status({}); })'));
  assert.equal(res.ok, true);
  assert.equal(res.result.version, '30.1.0');
  const [first, second] = res.result.documents;
  assert.deepEqual(first, {
    index: 0,
    name: 'Admission.ai',
    active: true,
    path: '/Users/test/Admission.ai',
    saved: true,
    colorSpace: 'rgb',
    activeArtboard: 1,
    artboards: [
      { index: 0, name: 'Post', w: 1080, h: 1080 },
      { index: 1, name: 'Story', w: 1080, h: 1920 },
    ],
  });
  assert.equal(second.path, null);
  assert.equal(second.colorSpace, 'cmyk');
  assert.equal(second.active, false);
});

test('ai_run_script returns the last expression and reports errors against the caller code', () => {
  const ctx = loadJsx(ALL_JSX, SAMPLE_STATE);
  const ok = JSON.parse(run(ctx, '__run(function(){ return ai_run_script({ code: "var a = 2; ({ v: a * 21 })" }); })'));
  assert.deepEqual(ok, { ok: true, result: { v: 42 } });
  const err = JSON.parse(run(ctx, '__run(function(){ return ai_run_script({ code: "null.x" }); })'));
  assert.equal(err.user, true);
  assert.match(err.message, /^Script error: /);
});

test('__parseHex accepts #RRGGBB and #RGB, rejects junk', () => {
  const ctx = loadJsx(['common.jsx']);
  assert.deepEqual({ ...run(ctx, '__parseHex("#1a2B3c")') }, { r: 26, g: 43, b: 60 });
  assert.deepEqual({ ...run(ctx, '__parseHex("fff")') }, { r: 255, g: 255, b: 255 });
  assert.equal(run(ctx, '__toHex(26, 43, 60)'), '#1a2b3c');
  const err = JSON.parse(run(ctx, '__run(function(){ return __parseHex("blue"); })'));
  assert.match(err.message, /Invalid colour "blue"/);
});
