import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadApps } from '../src/apps/index.mjs';
import { PHOTOSHOP_JSX_FILES, PHOTOSHOP_TOOLS, photoshopApp } from '../src/apps/photoshop/index.mjs';
import { indexTools } from '../src/tools.mjs';
import { applyDefaults, validate } from '../src/validate.mjs';
import { loadJsx } from './helpers.mjs';

const REQUIRED_TOOLS = [
  'ps_status', 'ps_get_document_info', 'ps_new_document', 'ps_open', 'ps_close', 'ps_save', 'ps_canvas', 'ps_undo',
  'ps_list_fonts', 'ps_add_text', 'ps_set_text', 'ps_add_shape', 'ps_place_image', 'ps_set_layer', 'ps_group',
  'ps_align', 'ps_layer_style', 'ps_adjust', 'ps_filter', 'ps_cutout', 'ps_export', 'ps_preview', 'ps_run_script',
];

function walkSchemas(schema, visit, path = '') {
  visit(schema, path);
  for (const [k, sub] of Object.entries(schema.properties || {})) walkSchemas(sub, visit, `${path}.${k}`);
  if (schema.items) walkSchemas(schema.items, visit, `${path}[]`);
}

test('every Photoshop tool exists, once, with the ps_ prefix', () => {
  const names = PHOTOSHOP_TOOLS.map((t) => t.name);
  assert.deepEqual([...names].sort(), [...REQUIRED_TOOLS].sort());
});

test('every ps_ tool has a JSX implementation of the same name', () => {
  const ctx = loadJsx(['common.jsx', ...PHOTOSHOP_JSX_FILES]);
  for (const { name } of PHOTOSHOP_TOOLS) assert.equal(typeof ctx[name], 'function', `${name} missing in jsx`);
});

test('ps_ schemas are strict objects whose required keys exist and whose defaults validate', () => {
  for (const tool of PHOTOSHOP_TOOLS) {
    const s = tool.inputSchema;
    assert.equal(s.additionalProperties, false, `${tool.name} should reject unknown keys`);
    for (const key of s.required || []) assert.ok(s.properties[key], `${tool.name}.${key} required but undefined`);
    walkSchemas(s, (sub, path) => {
      if (sub.default !== undefined) assert.deepEqual(validate(sub, sub.default), [], `${tool.name}${path} default invalid`);
      if (sub.pattern) assert.doesNotThrow(() => new RegExp(sub.pattern, 'u'), `${tool.name}${path} pattern`);
    });
    assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
  }
});

test('typical ps_ calls validate and nested effect defaults are filled in', () => {
  const byName = Object.fromEntries(PHOTOSHOP_TOOLS.map((t) => [t.name, t]));
  const samples = {
    ps_new_document: { width: 1080, height: 1350, background: 'transparent' },
    ps_add_text: { text: 'भर्ना खुला', x: 540, y: 120, align: 'center', font: 'KohinoorDevanagari-Semibold', size: 72 },
    ps_add_shape: { shape: 'rounded_rectangle', x: 60, y: 1100, w: 960, h: 140, fill: '#FFC20E' },
    ps_place_image: { path: '~/Pictures/campus.jpg', x: 0, y: 0, w: 1080, h: 700 },
    ps_set_layer: { layer: 12, x: 40, opacity: 80, blend_mode: 'multiply', delete: false },
    ps_layer_style: { layer: 'Headline', drop_shadow: {}, gradient_overlay: { stops: [{ color: '#000000' }, { color: '#FFFFFF' }] } },
    ps_adjust: { type: 'hue_saturation', layer: 'Photo', saturation: -30 },
    ps_filter: { layer: 'Photo', filter: 'gaussian_blur', radius: 8 },
    ps_export: { path: '/tmp/post.jpg', width: 1080, quality: 90 },
  };
  for (const [name, args] of Object.entries(samples)) {
    assert.deepEqual(validate(byName[name].inputSchema, args), [], name);
  }
  const style = applyDefaults(byName.ps_layer_style.inputSchema, samples.ps_layer_style);
  assert.deepEqual(style.drop_shadow, { color: '#000000', opacity: 50, angle: 120, distance: 10, spread: 0, size: 20 });
  assert.equal(style.gradient_overlay.type, 'linear');
  assert.equal(style.gradient_overlay.stops[0].opacity, 100);
  assert.equal(style.outer_glow, undefined);
});

test('bad ps_ arguments are rejected before reaching Photoshop', () => {
  const byName = Object.fromEntries(PHOTOSHOP_TOOLS.map((t) => [t.name, t]));
  assert.notDeepEqual(validate(byName.ps_new_document.inputSchema, { width: 100, height: 100, background: 'blue' }), []);
  assert.notDeepEqual(validate(byName.ps_set_layer.inputSchema, { layer: 1, blend_mode: 'glow' }), []);
  assert.notDeepEqual(validate(byName.ps_export.inputSchema, { path: 'relative.png' }), []);
  assert.notDeepEqual(validate(byName.ps_adjust.inputSchema, { type: 'curves' }), []);
});

test('Photoshop app targets PS_APP and can hide ps_run_script', () => {
  assert.equal(photoshopApp({}).target, 'com.adobe.Photoshop');
  assert.equal(photoshopApp({ PS_APP: 'com.adobe.Photoshop.beta' }).target, 'com.adobe.Photoshop.beta');
  const names = photoshopApp({ ADOBE_MCP_ALLOW_RUN_SCRIPT: 'false' }).tools.map((t) => t.name);
  assert.ok(!names.includes('ps_run_script'));
  assert.ok(names.includes('ps_status'));
});

test('both apps load together and every tool routes to its own app', () => {
  const apps = loadApps({});
  assert.deepEqual(apps.map((a) => a.id), ['illustrator', 'photoshop']);
  const index = indexTools(apps);
  assert.equal(index.get('ps_add_text').app.id, 'photoshop');
  assert.equal(index.get('ai_add_text').app.id, 'illustrator');
});
