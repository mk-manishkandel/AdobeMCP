/*
 * photoshop.jsx: Photoshop runtime shared by all ps_* tools.
 * Loaded after common.jsx and before the photoshop-*.jsx tool files.
 *
 * COORDINATES: px from the TOP-LEFT of the canvas, y DOWN (Photoshop's own
 * convention). Ruler and type units are forced to pixels for every call, so
 * text sizes are px too.
 *
 * UNDO: tools that change a document run inside __step(), which makes the whole
 * call ONE history state, so ps_undo steps == tool calls.
 */

/* ---------- per-call setup / teardown (called by __run) ---------- */

function __beforeCall() {
  var state = { ru: app.preferences.rulerUnits, tu: app.preferences.typeUnits, dd: app.displayDialogs };
  app.preferences.rulerUnits = Units.PIXELS;
  app.preferences.typeUnits = TypeUnits.PIXELS;
  app.displayDialogs = DialogModes.NO;
  return state;
}

function __afterCall(state) {
  if (!state) return;
  app.preferences.rulerUnits = state.ru;
  app.preferences.typeUnits = state.tu;
  app.displayDialogs = state.dd;
}

function __cid(code) { return charIDToTypeID(code); }
function __sid(name) { return stringIDToTypeID(name); }

/* ---------- documents ---------- */

function __requireDoc() {
  if (app.documents.length === 0) __fail('No document is open. Use ps_new_document or ps_open first.');
  return app.activeDocument;
}

function __findDocument(name) {
  if (!name) return __requireDoc();
  for (var i = 0; i < app.documents.length; i++) if (app.documents[i].name === name) return app.documents[i];
  var names = [];
  for (var j = 0; j < app.documents.length; j++) names.push(app.documents[j].name);
  __fail('Document not open: "' + name + '". Open documents: ' + (names.join(', ') || 'none') + '.');
}

function __docPath(doc) {
  try { return doc.fullName.fsName; } catch (e) { return null; }
}

/* Runs fn as ONE history state named label. Errors inside are re-thrown after. */
var __STEP = { fn: null, result: null, error: null };

function __stepRun() {
  try { __STEP.result = __STEP.fn(); } catch (e) { __STEP.error = e; }
}

function __step(label, fn) {
  var doc = __requireDoc();
  __STEP = { fn: fn, result: null, error: null };
  doc.suspendHistory('MCP: ' + label, '__stepRun()');
  if (__STEP.error) throw __STEP.error;
  return __STEP.result;
}

/* ---------- colours ---------- */

function __solid(hex) {
  var c = __parseHex(hex);
  var col = new SolidColor();
  col.rgb.red = c.r;
  col.rgb.green = c.g;
  col.rgb.blue = c.b;
  return col;
}

function __amColor(hex) {
  var c = __parseHex(hex);
  var d = new ActionDescriptor();
  d.putDouble(__cid('Rd  '), c.r);
  d.putDouble(__cid('Grn '), c.g);
  d.putDouble(__cid('Bl  '), c.b);
  return d;
}

function __hexOf(solid) {
  try { return __toHex(solid.rgb.red, solid.rgb.green, solid.rgb.blue); } catch (e) { return null; }
}

/* ---------- layers ---------- */

/* Every layer in a document or group, depth-first, top to bottom. */
function __allLayers(container, out) {
  out = out || [];
  for (var i = 0; i < container.layers.length; i++) {
    var l = container.layers[i];
    out.push(l);
    if (l.typename === 'LayerSet') __allLayers(l, out);
  }
  return out;
}

function __selectLayerId(id, add) {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putIdentifier(__cid('Lyr '), id);
  d.putReference(__cid('null'), r);
  if (add) d.putEnumerated(__sid('selectionModifier'), __sid('selectionModifierType'), __sid('addToSelection'));
  d.putBoolean(__cid('MkVs'), false);
  executeAction(__cid('slct'), d, DialogModes.NO);
}

/* A layer by id (number or digit string) or unique name. Selects it. */
function __findLayer(doc, ref) {
  if (ref === undefined || ref === null || ref === '') __fail('A layer reference (id or name) is required.');
  var s = String(ref);
  if (/^\d+$/.test(s)) {
    try {
      __selectLayerId(Number(s), false);
      return doc.activeLayer;
    } catch (e) { /* not an id in this document: try it as a name */ }
  }
  var all = __allLayers(doc);
  var matches = [];
  for (var i = 0; i < all.length; i++) if (all[i].name === s) matches.push(all[i]);
  if (matches.length === 1) {
    /* Select through Action Manager: some commands (e.g. Ungroup) ignore doc.activeLayer. */
    __selectLayerId(matches[0].id, false);
    return matches[0];
  }
  if (matches.length > 1) __fail('Several layers are named "' + s + '"; use the layer id instead (from ps_get_document_info).');
  __fail('Layer not found: "' + s + '". Use ps_get_document_info to list layer ids and names.');
}

function __findLayers(doc, refs) {
  var out = [];
  for (var i = 0; i < refs.length; i++) out.push(__findLayer(doc, refs[i]));
  return out;
}

/* Layer set to create new layers in (by name), else the document root. */
function __targetGroup(doc, name) {
  if (!name) return doc;
  var all = __allLayers(doc);
  for (var i = 0; i < all.length; i++) if (all[i].typename === 'LayerSet' && all[i].name === name) return all[i];
  var g = doc.layerSets.add();
  g.name = name;
  return g;
}

/* Moves a just-created layer into a group (created if missing), at its top. */
function __putInGroup(doc, layer, groupName) {
  if (!groupName) return layer;
  var g = __targetGroup(doc, groupName);
  layer.move(g, ElementPlacement.INSIDE);
  return layer;
}

function __px(v) {
  return typeof v === 'number' ? v : v.as('px');
}

/* {x, y, w, h} of a layer's pixels (without layer effects). */
function __box(layer) {
  var b = layer.bounds;
  var x1 = __px(b[0]), y1 = __px(b[1]), x2 = __px(b[2]), y2 = __px(b[3]);
  return { x: __round(x1), y: __round(y1), w: __round(x2 - x1), h: __round(y2 - y1) };
}

function __moveLayerTo(layer, x, y) {
  var b = __box(layer);
  layer.translate(new UnitValue(x - b.x, 'px'), new UnitValue(y - b.y, 'px'));
}

/* Background layers cannot be moved or styled: turn them into normal layers. */
function __unlockBackground(layer) {
  if (layer.typename === 'ArtLayer' && layer.isBackgroundLayer) layer.isBackgroundLayer = false;
}

var __BLEND = {
  normal: 'NORMAL', dissolve: 'DISSOLVE', darken: 'DARKEN', multiply: 'MULTIPLY', color_burn: 'COLORBURN',
  linear_burn: 'LINEARBURN', lighten: 'LIGHTEN', screen: 'SCREEN', color_dodge: 'COLORDODGE', linear_dodge: 'LINEARDODGE',
  overlay: 'OVERLAY', soft_light: 'SOFTLIGHT', hard_light: 'HARDLIGHT', vivid_light: 'VIVIDLIGHT', linear_light: 'LINEARLIGHT',
  pin_light: 'PINLIGHT', hard_mix: 'HARDMIX', difference: 'DIFFERENCE', exclusion: 'EXCLUSION', hue: 'HUE',
  saturation: 'SATURATION', color: 'COLORBLEND', luminosity: 'LUMINOSITY'
};

function __blendName(mode) {
  var s = String(mode).replace('BlendMode.', '');
  for (var k in __BLEND) if (__BLEND.hasOwnProperty(k) && __BLEND[k] === s) return k;
  return s.toLowerCase();
}

function __hasVectorMask(layer) {
  try {
    var r = new ActionReference();
    r.putIdentifier(__cid('Lyr '), layer.id);
    return executeActionGet(r).getBoolean(__sid('hasVectorMask'));
  } catch (e) { return false; }
}

function __kindOf(layer) {
  if (layer.typename === 'LayerSet') return 'group';
  var k = String(layer.kind).replace('LayerKind.', '');
  if (k === 'NORMAL') return 'pixel';
  if (k === 'TEXT') return 'text';
  if (k === 'SMARTOBJECT') return 'smart_object';
  if (k === 'SOLIDFILL') return __hasVectorMask(layer) ? 'shape' : 'fill';
  if (k === 'GRADIENTFILL' || k === 'PATTERNFILL') return 'fill';
  return 'adjustment';
}

function __truncate(s, n) {
  s = String(s);
  return s.length > n ? s.substring(0, n) + '…' : s;
}

function __textInfo(layer) {
  var t = layer.textItem;
  var out = { text: __truncate(t.contents, 300) };
  try { out.font = t.font; } catch (e1) { out.font = null; }
  try { out.size = __round(__px(t.size)); } catch (e2) { out.size = null; }
  try { out.color = __hexOf(t.color); } catch (e3) { out.color = null; }
  return out;
}

function __layerInfo(layer) {
  var box = __box(layer);
  var out = {
    id: layer.id, name: layer.name, kind: __kindOf(layer), x: box.x, y: box.y, w: box.w, h: box.h,
    visible: layer.visible, opacity: __round(layer.opacity)
  };
  if (layer.typename === 'ArtLayer') {
    out.blend_mode = __blendName(layer.blendMode);
    out.locked = layer.allLocked;
    out.clipped = layer.grouped;
    if (layer.isBackgroundLayer) out.background = true;
    if (out.kind === 'text') {
      var t = __textInfo(layer);
      for (var k in t) if (t.hasOwnProperty(k)) out[k] = t[k];
    }
  }
  if (layer.parent && layer.parent.typename === 'LayerSet') out.group = layer.parent.name;
  return out;
}
