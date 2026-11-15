import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ILLUSTRATOR_TOOLS, illustratorApp } from '../src/apps/illustrator/index.mjs';
import { expandPaths } from '../src/apps/illustrator/schemas.mjs';
import { previewHandler } from '../src/apps/illustrator/export-tools.mjs';
import { createToolRunner } from '../src/tools.mjs';
import { applyDefaults, validate } from '../src/validate.mjs';
import { loadJsx } from './helpers.mjs';

const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-cat-'));
after(() => rmSync(work, { recursive: true, force: true }));

const REQUIRED_TOOLS = [
  'ai_status', 'ai_get_document_info', 'ai_new_document', 'ai_open', 'ai_close', 'ai_save', 'ai_add_artboard',
  'ai_add_text', 'ai_set_text', 'ai_add_shape', 'ai_place_image', 'ai_set_item', 'ai_align', 'ai_export',
  'ai_preview', 'ai_list_fonts', 'ai_undo', 'ai_run_script', 'ai_copy_items',
  'ai_group', 'ai_pathfinder', 'ai_layer', 'ai_swatch', 'ai_symbol', 'ai_graphic_style', 'ai_distort', 'ai_trace_image',
  'ai_export_pdf',
];

function walkSchemas(schema, visit, path = '') {
  visit(schema, path);
  for (const [k, sub] of Object.entries(schema.properties || {})) walkSchemas(sub, visit, `${path}.${k}`);
  if (schema.items) walkSchemas(schema.items, visit, `${path}[]`);
}

test('every tool from the spec exists, once, with the ai_ prefix', () => {
  const names = ILLUSTRATOR_TOOLS.map((t) => t.name);
  assert.deepEqual([...names].sort(), [...REQUIRED_TOOLS].sort());
});

test('every tool has a JSX implementation of the same name', () => {
  const ctx = loadJsx();
  for (const { name } of ILLUSTRATOR_TOOLS) assert.equal(typeof ctx[name], 'function', `${name} missing in jsx`);
});

test('schemas are strict objects whose required keys exist and whose defaults validate', () => {
  for (const tool of ILLUSTRATOR_TOOLS) {
    const s = tool.inputSchema;
    assert.equal(s.type, 'object', tool.name);
    assert.equal(s.additionalProperties, false, `${tool.name} should reject unknown keys`);
    for (const key of s.required || []) assert.ok(s.properties[key], `${tool.name}.${key} required but undefined`);
    walkSchemas(s, (sub, path) => {
      if (sub.default !== undefined) assert.deepEqual(validate(sub, sub.default), [], `${tool.name}${path} default invalid`);
      if (sub.pattern) assert.doesNotThrow(() => new RegExp(sub.pattern, 'u'), `${tool.name}${path} pattern`);
    });
    assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
  }
});

test('positional tools explain the coordinate convention', () => {
  const positional = ['ai_add_text', 'ai_add_shape', 'ai_place_image', 'ai_set_item'];
  for (const name of positional) {
    const tool = ILLUSTRATOR_TOOLS.find((t) => t.name === name);
    assert.match(JSON.stringify(tool), /top|left/i, name);
    assert.match(JSON.stringify(tool.inputSchema), /\(px\)/, `${name} must state px units`);
  }
});

test('sample arguments validate against the schemas', () => {
  const samples = {
    ai_new_document: { width: 1080, height: 1080, background: '#0B3D91' },
    ai_add_text: { text: 'भर्ना खुला', x: 540, y: 200, align: 'center', font: 'KohinoorDevanagari-Semibold', size: 64 },
    ai_add_shape: { shape: 'rounded_rectangle', x: 60, y: 900, w: 960, h: 120, fill: '#FFC20E', radius: 30 },
    ai_place_image: { path: '~/Pictures/campus.jpg', x: 0, y: 300, w: 1080, h: 500, mode: 'fill' },
    ai_set_item: { item: '512', duplicate: true, to_artboard: 1, delete: false },
    ai_align: { items: ['512', 'Headline'], horizontal: 'center', vertical: 'bottom', margin: 60 },
    ai_export: { path: '/tmp/post.png', width: 1080 },
  };
  for (const [name, args] of Object.entries(samples)) {
    const tool = ILLUSTRATOR_TOOLS.find((t) => t.name === name);
    assert.deepEqual(validate(tool.inputSchema, args), [], name);
  }
});

test('bad arguments are rejected with useful messages', () => {
  const shape = ILLUSTRATOR_TOOLS.find((t) => t.name === 'ai_add_shape');
  const errors = validate(shape.inputSchema, { shape: 'hexagon', x: 0, y: 0, fill: 'blue' });
  assert.ok(errors.some((e) => /shape must be one of/.test(e)));
  assert.ok(errors.some((e) => /fill must match/.test(e)));
  const exp = ILLUSTRATOR_TOOLS.find((t) => t.name === 'ai_export');
  assert.ok(validate(exp.inputSchema, { path: 'relative/out.png' }).some((e) => /path must match/.test(e)));
});

test('defaults are applied for text', () => {
  const tool = ILLUSTRATOR_TOOLS.find((t) => t.name === 'ai_add_text');
  const args = applyDefaults(tool.inputSchema, { text: 'Hi', x: 0, y: 0 });
  assert.equal(args.size, 48);
  assert.equal(args.color, '#000000');
  assert.equal(args.align, 'left');
});

test('expandPaths expands ~/ without mutating', () => {
  const input = Object.freeze({ path: '~/Desktop/a.png', other: '~/x' });
  const out = expandPaths(input, ['path']);
  assert.match(out.path, /^\/.+\/Desktop\/a\.png$/);
  assert.equal(out.other, '~/x');
  assert.equal(input.path, '~/Desktop/a.png');
});

test('preview handler returns image content and removes the temp png', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  let calledWith;
  const ctx = {
    tmpDir: work,
    call: async (fn, args) => {
      calledWith = { fn, args };
      writeFileSync(args.path, png);
      return { path: args.path, artboard: 0, artboard_name: 'Post', width: 800, height: 800 };
    },
  };
  const content = await previewHandler({ max_size: 800 }, { ...ctx, tool: { name: 'ai_preview' } });
  assert.equal(calledWith.fn, 'ai_preview');
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].mimeType, 'image/png');
  assert.equal(Buffer.from(content[0].data, 'base64').toString('hex'), png.toString('hex'));
  assert.deepEqual(JSON.parse(content[1].text), { artboard: 0, artboard_name: 'Post', width: 800, height: 800 });
  assert.ok(!existsSync(calledWith.args.path));
});

test('tool runner turns invalid args into an isError result', async () => {
  const runner = createToolRunner({ apps: [illustratorApp({})], bridge: { tmpDir: work, call: async () => ({}) } });
  const res = await runner.callTool('ai_add_shape', { x: 0, y: 0 });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /arguments\.shape is required/);
});
