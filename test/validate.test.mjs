import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDefaults, validate } from '../src/validate.mjs';

const schema = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1 },
    size: { type: 'number', minimum: 1, maximum: 1000, default: 48 },
    count: { type: 'integer' },
    align: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
    box: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, fit: { type: 'string', default: 'fill' } },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    color: { type: ['string', 'null'] },
  },
  required: ['text'],
  additionalProperties: false,
};

test('accepts a valid object', () => {
  assert.deepEqual(validate(schema, { text: 'Hi', size: 12, box: { x: 0, y: 0 }, tags: ['a'], color: null }), []);
});

test('reports missing required, wrong types, ranges, enums, unknown keys', () => {
  const errors = validate(schema, { size: 0, count: 1.5, align: 'middle', box: { x: 'a' }, zz: 1, tags: ['a', 'b', 'c'] });
  assert.deepEqual(errors, [
    'arguments.text is required',
    'arguments.size must be >= 1',
    'arguments.count must be integer (got number)',
    'arguments.align must be one of: "left", "center", "right"',
    'arguments.box.y is required',
    'arguments.box.x must be number (got string)',
    'arguments.tags must have at most 2 items',
    'arguments.zz is not a known property (allowed: text, size, count, align, box, tags, color)',
  ]);
});

test('rejects non-object arguments and NaN', () => {
  assert.deepEqual(validate(schema, []), ['arguments must be object (got array)']);
  assert.deepEqual(validate({ type: 'number' }, NaN), ['arguments must be number (got number)']);
});

test('applyDefaults fills nested defaults without mutating input', () => {
  const input = Object.freeze({ text: 'x', box: Object.freeze({ x: 1, y: 2 }) });
  const out = applyDefaults(schema, input);
  assert.deepEqual(out, { text: 'x', size: 48, align: 'left', box: { x: 1, y: 2, fit: 'fill' } });
  assert.notEqual(out, input);
  assert.deepEqual(input, { text: 'x', box: { x: 1, y: 2 } });
});

test('applyDefaults keeps explicit values and clones default objects', () => {
  const s = { type: 'object', properties: { list: { type: 'array', default: [1] } } };
  const a = applyDefaults(s, {});
  const b = applyDefaults(s, {});
  assert.notEqual(a.list, b.list);
  assert.deepEqual(applyDefaults(schema, { text: 'x', size: 10 }).size, 10);
});
