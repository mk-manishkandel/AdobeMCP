/**
 * Offline checks for the tools added from real poster work: gradient paint,
 * free-form paths, glow/shadow/blur arguments, text runs and ai_copy_items.
 * The Illustrator DOM side of these is verified by `npm run test:live`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ILLUSTRATOR_TOOLS } from '../src/apps/illustrator/index.mjs';
import { applyDefaults, validate } from '../src/validate.mjs';
import { loadJsx } from './helpers.mjs';

const schemaOf = (name) => ILLUSTRATOR_TOOLS.find((t) => t.name === name).inputSchema;
const GRADIENT = { type: 'linear', angle: -90, stops: [{ color: '#FF00AA', position: 0 }, { color: '#00E5FF', position: 100 }] };

test('fill accepts a hex colour, "none" or a gradient object', () => {
  const s = schemaOf('ai_add_shape');
  for (const fill of ['#112233', 'none', GRADIENT]) {
    assert.deepEqual(validate(s, { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, fill }), [], JSON.stringify(fill));
  }
});

test('gradient objects are checked: stops required, at least two, valid colours', () => {
  const s = schemaOf('ai_set_item');
  const one = validate(s, { item: 'a', fill: { stops: [{ color: '#000000', position: 0 }] } });
  assert.ok(one.some((e) => /stops/.test(e)), one.join('; '));
  const bad = validate(s, { item: 'a', fill: { stops: [{ color: 'red', position: 0 }, { color: '#FFFFFF', position: 100 }] } });
  assert.ok(bad.length > 0);
  assert.ok(validate(s, { item: 'a', fill: { type: 'conic', stops: GRADIENT.stops } }).length > 0);
  assert.ok(validate(s, { item: 'a', fill: 'blue' }).length > 0);
});

test('gradient defaults fill type, angle and stop opacity', () => {
  const out = applyDefaults(schemaOf('ai_set_item'), { item: 'a', fill: { stops: GRADIENT.stops } });
  assert.equal(out.fill.type, 'linear');
  assert.equal(out.fill.angle, 0);
  assert.equal(out.fill.stops[0].opacity, 100);
});

test('path shapes take vertices; malformed vertices are rejected', () => {
  const s = schemaOf('ai_add_shape');
  assert.deepEqual(validate(s, { shape: 'path', vertices: [[0, 0], [10, 0], [5, 8]], closed: true }), []);
  assert.ok(validate(s, { shape: 'path', vertices: [[0, 0]] }).length > 0, 'one point is not a path');
  assert.ok(validate(s, { shape: 'path', vertices: [[0, 0, 1], [1, 1]] }).length > 0, 'points are pairs');
});

test('glow and shadow get sensible defaults; unknown effect keys are rejected', () => {
  const s = schemaOf('ai_set_item');
  const out = applyDefaults(s, { item: 'a', glow: {}, shadow: {} });
  assert.deepEqual(out.glow, { radius: 12, opacity: 70 });
  assert.deepEqual(out.shadow, { x: 0, y: 8, blur: 12, opacity: 40, color: '#000000' });
  assert.ok(validate(s, { item: 'a', glow: { spread: 3 } }).length > 0);
  assert.ok(validate(s, { item: 'a', blur: -1 }).length > 0);
});

test('text runs validate on ai_add_text and ai_set_text', () => {
  const runs = [{ match: 'V5', color: '#FFC20E', size: 40 }, { start: 0, length: 3, font: 'Menlo-Bold' }];
  assert.deepEqual(validate(schemaOf('ai_add_text'), { text: 'BIC V5', x: 0, y: 0, runs }), []);
  assert.deepEqual(validate(schemaOf('ai_set_text'), { item: 't', runs }), []);
  assert.ok(validate(schemaOf('ai_set_text'), { item: 't', runs: [{ match: '' }] }).length > 0);
});

test('ai_copy_items needs a source document and at least one item', () => {
  const s = schemaOf('ai_copy_items');
  assert.deepEqual(validate(s, { from_document: 'Old.ai', items: ['Logo'], x: 40, y: 40 }), []);
  assert.ok(validate(s, { items: ['Logo'] }).length > 0);
  assert.ok(validate(s, { from_document: 'Old.ai', items: [] }).length > 0);
});

test('__runRanges finds every match, the first only, or an explicit range', () => {
  const ctx = loadJsx();
  const all = ctx.__runRanges('ab ab ab', { match: 'ab' });
  assert.deepEqual(JSON.parse(JSON.stringify(all)), [[0, 2], [3, 2], [6, 2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.__runRanges('ab ab', { match: 'ab', occurrence: 'first' }))), [[0, 2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.__runRanges('hello', { start: 1, length: 3 }))), [[1, 3]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.__runRanges('hello', { start: 2 }))), [[2, 3]]);
});

test('__runRanges fails clearly on a missing match or an out-of-range run', () => {
  const ctx = loadJsx();
  assert.throws(() => ctx.__runRanges('hello', { match: 'xyz' }), { message: /not found/ });
  assert.throws(() => ctx.__runRanges('hello', { start: 3, length: 9 }), { message: /past the end/ });
  assert.throws(() => ctx.__runRanges('hello', {}), { message: /needs match/ });
});

test('__unionBox spans all boxes', () => {
  const ctx = loadJsx();
  const box = ctx.__unionBox([{ box: { x: 10, y: 20, w: 30, h: 5 } }, { box: { x: 0, y: 40, w: 5, h: 10 } }]);
  assert.deepEqual(JSON.parse(JSON.stringify(box)), { x: 0, y: 20, w: 40, h: 30 });
});

test('__isGradientSpec only accepts objects with stops', () => {
  const ctx = loadJsx();
  assert.equal(ctx.__isGradientSpec(GRADIENT), true);
  assert.equal(ctx.__isGradientSpec('#000000'), false);
  assert.equal(ctx.__isGradientSpec(null), false);
  assert.equal(ctx.__isGradientSpec(undefined), false);
});
