import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { ILLUSTRATOR_JSX_FILES, ILLUSTRATOR_TOOLS } from '../src/apps/illustrator/index.mjs';
import { QR_MAX_TEXT_LENGTH } from '../src/apps/illustrator/qr-tools.mjs';
import { applyDefaults, validate } from '../src/validate.mjs';
import { QR_PLUGIN_PATH, buildQrPlugin } from '../scripts/build-qr-plugin.mjs';
import { ROOT, readJsx } from './helpers.mjs';

const qr = vm.createContext({});
vm.runInContext(readJsx('qr-encoder.jsx'), qr);
const call = (expr, vars = {}) => {
  Object.assign(qr, vars);
  return vm.runInContext(expr, qr);
};
const encode = (text, ecc = 'M', min = 0) => call('__qrEncode(T, E, V)', { T: text, E: ecc, V: min });
const bitsOf = (modules) => modules.map((r) => r.map((b) => (b ? 1 : 0)).join('')).join('\n');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/* Reads the 15 format bits beside the top-left finder and removes the 0x5412 mask: {ecc, mask}. */
function readFormat(modules) {
  const bits = [];
  for (let i = 0; i <= 5; i++) bits.push(modules[i][8]);
  bits.push(modules[7][8], modules[8][8], modules[8][7]);
  for (let i = 9; i < 15; i++) bits.push(modules[8][14 - i]);
  const value = bits.reduce((acc, b, i) => acc | ((b ? 1 : 0) << i), 0) ^ 0x5412;
  return { ecc: { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[value >>> 13], mask: (value >>> 10) & 7 };
}

const shoelace = (loop) => loop.reduce((s, [x, y], i) => {
  const [nx, ny] = loop[(i + 1) % loop.length];
  return s + (x * ny - nx * y);
}, 0) / 2;

const loopsArea = (loops) => loops.reduce((s, l) => s + shoelace(l), 0);

test('golden matrices for codes verified with a real decoder stay byte-identical', () => {
  // Arrange: rendered by this encoder and decoded by macOS CoreImage (and live in Illustrator) when written.
  const golden = [
    ['HELLO WORLD', 'Q', 1, 0, '7cb519f187a1f6d6'],
    ['https://github.com/mk-manishkandel/AdobeMCP', 'M', 4, 4, 'e3ed1bfc0d7ce656'],
    ['बोस्टन इन्टरनेशनल कलेज 🎓', 'H', 8, 7, '234d2f1fee8d0b5e'],
  ];
  for (const [text, ecc, version, mask, hash] of golden) {
    // Act
    const q = encode(text, ecc);
    // Assert
    assert.equal(q.version, version, text);
    assert.equal(q.mask, mask, text);
    assert.equal(sha(bitsOf(q.modules)), hash, text);
  }
});

test('data capacity matches the ISO 18004 tables at the extremes', () => {
  const dcw = (v, ecc) => call('__qrDataCodewords(V, O)', { V: v, O: { L: 0, M: 1, Q: 2, H: 3 }[ecc] });
  assert.deepEqual([dcw(1, 'L'), dcw(1, 'M'), dcw(1, 'Q'), dcw(1, 'H')], [19, 16, 13, 9]);
  assert.deepEqual([dcw(40, 'L'), dcw(40, 'M'), dcw(40, 'Q'), dcw(40, 'H')], [2956, 2334, 1666, 1276]);
  assert.equal(dcw(10, 'M'), 216);
});

test('picks the most compact mode and the smallest version that fits', () => {
  assert.equal(encode('0123456789').mode, 'numeric');
  assert.equal(encode('HELLO WORLD $%*+-./:').mode, 'alphanumeric');
  assert.equal(encode('hello').mode, 'byte');
  assert.equal(encode('A', 'L').version, 1);
  assert.equal(encode('Hello', 'M', 7).version, 7, 'min_version is honoured');
});

test('the character-count field widens at versions 10 and 27', () => {
  // Regression: a chained ternary picked the v27+ width for v1-9 inside ExtendScript.
  const seg = call("__qrSegment('hello')");
  assert.deepEqual([1, 9, 10, 26, 27, 40].map((v) => call('__qrCcBits(S, V)', { S: seg, V: v })), [8, 8, 16, 16, 16, 16]);
  const num = call("__qrSegment('123')");
  assert.deepEqual([9, 10, 26, 27].map((v) => call('__qrCcBits(S, V)', { S: num, V: v })), [10, 12, 12, 14]);
});

test('maximum lengths fit version 40 and one more character is rejected', () => {
  assert.equal(encode('y'.repeat(2953), 'L').version, 40);
  assert.equal(encode('9'.repeat(7089), 'L').version, 40);
  assert.equal(encode('A'.repeat(4296), 'L').version, 40);
  assert.throws(() => encode('y'.repeat(2954), 'L'), /too long/);
  assert.throws(() => encode('y'.repeat(1274), 'H'), /too long/);
  assert.equal(QR_MAX_TEXT_LENGTH, 2953);
});

test('rejects empty text, unknown error correction levels and bad versions', () => {
  assert.throws(() => encode(''), /empty/);
  assert.throws(() => encode('x', 'Z'), /Unknown error correction/);
  assert.throws(() => encode('x', 'M', 41), /Version must be 1-40/);
});

test('UTF-8 encoding matches Node for BMP, Devanagari and astral characters', () => {
  for (const s of ['abc', 'ñandú', 'भर्ना खुला', '🎓👍', 'a\u0000b']) {
    assert.deepEqual([...call('__qrUtf8(S)', { S: s })], [...Buffer.from(s, 'utf8')], s);
  }
  assert.deepEqual([...call('__qrUtf8(S)', { S: '\uD800x' })], [0xef, 0xbf, 0xbd, 0x78], 'lone surrogate -> U+FFFD');
});

test('function patterns: finders, timing, dark module and readable format bits', () => {
  for (const [text, ecc] of [['HELLO', 'L'], ['https://example.com/a/long/path', 'Q'], ['x'.repeat(300), 'H']]) {
    const q = encode(text, ecc);
    const m = q.modules;
    const n = q.size;
    assert.equal(n, q.version * 4 + 17);
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        assert.ok(m[oy][ox + i] && m[oy + 6][ox + i] && m[oy + i][ox] && m[oy + i][ox + 6], 'finder border');
      }
      assert.ok(m[oy + 3][ox + 3] && !m[oy + 1][ox + 1], 'finder core and ring');
    }
    for (let i = 8; i < n - 8; i++) assert.equal(m[6][i], i % 2 === 0, 'timing row');
    assert.ok(m[n - 8][8], 'dark module');
    assert.deepEqual(readFormat(m), { ecc, mask: q.mask });
  }
});

test('outlines are axis-aligned closed loops whose signed area equals the dark module count', () => {
  for (const [text, ecc] of [['HELLO WORLD', 'Q'], ['x'.repeat(500), 'L']]) {
    const q = encode(text, ecc);
    const loops = call('__qrOutlines(M)', { M: q.modules });
    assert.equal(loopsArea(loops), q.modules.flat().filter(Boolean).length, 'outer loops add, holes subtract');
    for (const loop of loops) {
      assert.ok(loop.length >= 4);
      loop.forEach(([x, y], i) => {
        const [nx, ny] = loop[(i + 1) % loop.length];
        assert.ok((x === nx) !== (y === ny), 'every edge is horizontal or vertical, never zero-length');
      });
    }
  }
});

test('outline tracing keeps diagonal neighbours separate, winds holes backwards and honours skip', () => {
  const diagonal = call('__qrOutlines(M)', { M: [[true, false], [false, true]] });
  assert.equal(diagonal.length, 2);
  assert.ok(diagonal.every((l) => shoelace(l) === 1));

  const ring = call('__qrOutlines(M)', { M: [[true, true, true], [true, false, true], [true, true, true]] });
  assert.deepEqual([...ring].map(shoelace).sort((a, b) => a - b), [-1, 9], 'outer clockwise (+9), hole counter-clockwise (-1)');

  const q = encode('HELLO', 'L');
  const finderOnly = call('__qrOutlines(M, function (x, y) { return !__qrIsFinder(N, x, y); })', { M: q.modules, N: q.size });
  assert.equal(loopsArea(finderOnly), 3 * (24 + 9), 'three 7x7 finders: dark ring of 24 + 3x3 core each');
});

test('ai_qr_code is registered with its JSX files and validates arguments with defaults', () => {
  const tool = ILLUSTRATOR_TOOLS.find((t) => t.name === 'ai_qr_code');
  assert.ok(tool);
  for (const f of ['qr-encoder.jsx', 'qr-draw.jsx', 'illustrator-qr.jsx']) assert.ok(ILLUSTRATOR_JSX_FILES.includes(f), f);
  assert.ok(ILLUSTRATOR_JSX_FILES.indexOf('qr-draw.jsx') < ILLUSTRATOR_JSX_FILES.indexOf('illustrator-qr.jsx'));

  const args = applyDefaults(tool.inputSchema, { text: 'https://example.com' });
  assert.deepEqual(validate(tool.inputSchema, args), []);
  assert.deepEqual(
    [args.size, args.ecc, args.quiet_zone, args.style, args.fill, args.background],
    [200, 'M', 4, 'square', '#000000', '#FFFFFF'],
  );
  const gradient = { type: 'linear', angle: -90, stops: [{ color: '#6A11CB' }, { color: '#2575FC' }] };
  assert.deepEqual(validate(tool.inputSchema, { text: 'x', fill: gradient, background: 'none' }), []);
  assert.notDeepEqual(validate(tool.inputSchema, { text: '' }), []);
  assert.notDeepEqual(validate(tool.inputSchema, { text: 'x', ecc: 'X' }), []);
  assert.notDeepEqual(validate(tool.inputSchema, { text: 'x', style: 'hearts' }), []);
  assert.notDeepEqual(validate(tool.inputSchema, { text: 'x'.repeat(QR_MAX_TEXT_LENGTH + 1) }), []);
});

test('the standalone Illustrator script is rebuilt from the current sources and parses', () => {
  const current = readFileSync(QR_PLUGIN_PATH, 'utf8');
  assert.equal(current, buildQrPlugin(), 'run: npm run build:qr-plugin');
  assert.doesNotThrow(() => new vm.Script(current.replace(/^#target.*$/m, ''), { filename: 'QR Code.jsx' }));
});

test('plugin payload builders escape Wi-Fi fields and validate input', () => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(join(ROOT, 'plugins', 'illustrator', 'src', 'qr-dialog.jsx'), 'utf8'), ctx);
  ctx.SSID = 'Lab; "5G"';
  ctx.PW = 'p:w\\';
  const run = (expr) => vm.runInContext(expr, ctx);
  assert.equal(run('qrpWifiPayload(SSID, PW, 0, true)'), 'WIFI:T:WPA;S:Lab\\; \\"5G\\";P:p\\:w\\\\;H:true;;');
  assert.equal(run("qrpWifiPayload('Cafe', '', 2, false)"), 'WIFI:T:nopass;S:Cafe;;');
  assert.throws(() => run("qrpWifiPayload('Cafe', '', 0, false)"), /password/);
  assert.equal(run("qrpEmailPayload('a@b.co', 'Hi there', '')"), 'mailto:a@b.co?subject=Hi%20there');
  assert.equal(run("qrpPhonePayload('+977 980-000 0000')"), 'tel:+9779800000000');
  assert.throws(() => run("qrpPhonePayload('+')"), /phone/);
  assert.throws(() => run("qrpTextPayload('https://')"), /Enter the text/);
  assert.deepEqual({ ...run("qrpHex('#0a0', 'C')") }, { r: 0, g: 170, b: 0 });
  assert.throws(() => run("qrpHex('red', 'Colour')"), /hex colour/);
  assert.throws(() => run("qrpNumber('5', 'Size', 10, 100)"), /from 10 to 100/);
});
