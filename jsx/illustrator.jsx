/*
 * illustrator.jsx: Illustrator runtime shared by all ai_* tools.
 * Loaded after common.jsx and before the illustrator-*.jsx tool files.
 *
 * COORDINATES (public contract): px from the TOP-LEFT of an artboard, y DOWN.
 * Illustrator's document space has y UP. The only conversions live in
 * __toAi / __fromAi / __boxOf below. Nothing else may flip y.
 * In Illustrator 1 px == 1 pt.
 */

/* ---------- per-call setup / teardown (called by __run) ---------- */

function __beforeCall() {
  var state = { uil: app.userInteractionLevel, cs: app.coordinateSystem };
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  return state;
}

function __afterCall(state) {
  if (!state) return;
  app.coordinateSystem = state.cs;
  app.userInteractionLevel = state.uil;
}

/* ---------- documents & artboards ---------- */

function __requireDoc() {
  if (app.documents.length === 0) __fail('No document is open. Use ai_new_document or ai_open first.');
  return app.activeDocument;
}

/* Resolves an artboard index (0-based). Defaults to the active artboard. */
function __abIndex(doc, index) {
  var count = doc.artboards.length;
  if (index === undefined || index === null) return doc.artboards.getActiveArtboardIndex();
  if (index < 0 || index >= count) __fail('Artboard ' + index + ' does not exist (document has ' + count + ', indices 0-' + (count - 1) + ').');
  return index;
}

/* [left, top, right, bottom] of an artboard in Illustrator document space (y up). */
function __abRect(doc, index) {
  return doc.artboards[__abIndex(doc, index)].artboardRect;
}

/* Public (x right, y down from artboard top-left) -> Illustrator [x, y]. */
function __toAi(doc, abIndex, x, y) {
  var r = __abRect(doc, abIndex);
  return [r[0] + x, r[1] - y];
}

/* Illustrator [x, y] -> public {x, y} relative to the artboard. */
function __fromAi(doc, abIndex, ax, ay) {
  var r = __abRect(doc, abIndex);
  return { x: __round(ax - r[0]), y: __round(r[1] - ay) };
}

/* Illustrator bounds [l, t, r, b] -> public {x, y, w, h}. */
function __boxOf(doc, abIndex, bounds) {
  var p = __fromAi(doc, abIndex, bounds[0], bounds[1]);
  return { x: p.x, y: p.y, w: __round(bounds[2] - bounds[0]), h: __round(bounds[1] - bounds[3]) };
}

/* Index of the artboard containing the centre of bounds, or -1. */
function __artboardAt(doc, bounds) {
  var cx = (bounds[0] + bounds[2]) / 2;
  var cy = (bounds[1] + bounds[3]) / 2;
  for (var i = 0; i < doc.artboards.length; i++) {
    var r = doc.artboards[i].artboardRect;
    if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) return i;
  }
  return -1;
}

/* Artboard used for an existing item: explicit index, else the item's own artboard, else active. */
function __itemArtboard(doc, item, explicit) {
  if (explicit !== undefined && explicit !== null) return __abIndex(doc, explicit);
  var found = __artboardAt(doc, __bounds(item));
  return found >= 0 ? found : doc.artboards.getActiveArtboardIndex();
}

function __artboardInfo(doc, i) {
  var ab = doc.artboards[i];
  var r = ab.artboardRect;
  return { index: i, name: ab.name, w: __round(r[2] - r[0]), h: __round(r[1] - r[3]) };
}

function __colorSpaceName(doc) {
  return doc.documentColorSpace === DocumentColorSpace.CMYK ? 'cmyk' : 'rgb';
}

function __docPath(doc) {
  try {
    return doc.fullName.fsName;
  } catch (e) {
    return null; /* never saved */
  }
}

/* Illustrator quirk: artboards of an INACTIVE document read back as the active
   document's artboards, so they are only reported for the active one. */
function __docSummary(doc, index) {
  var active = index === 0;
  var out = {
    index: index,
    name: doc.name,
    active: active,
    path: __docPath(doc),
    saved: doc.saved,
    colorSpace: __colorSpaceName(doc),
    activeArtboard: null,
    artboards: null
  };
  if (!active) {
    out.note = 'Artboards are only readable for the active document; activate it (ai_open its path) to inspect.';
    return out;
  }
  var artboards = [];
  for (var i = 0; i < doc.artboards.length; i++) artboards.push(__artboardInfo(doc, i));
  out.activeArtboard = doc.artboards.getActiveArtboardIndex();
  out.artboards = artboards;
  return out;
}

/* ---------- layers ---------- */

function __findLayer(doc, name) {
  for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === name) return doc.layers[i];
  return null;
}

function __usableLayer(layer) {
  return layer && !layer.locked && layer.visible;
}

/* Layer to create items in: named (created if missing), else the active or first usable layer. */
function __targetLayer(doc, name) {
  if (name) {
    var named = __findLayer(doc, name);
    if (!named) {
      named = doc.layers.add();
      named.name = name;
    }
    if (named.locked || !named.visible) __fail('Layer "' + name + '" is locked or hidden. Unlock/show it or pick another layer.');
    return named;
  }
  if (__usableLayer(doc.activeLayer)) return doc.activeLayer;
  for (var i = 0; i < doc.layers.length; i++) if (__usableLayer(doc.layers[i])) return doc.layers[i];
  var created = doc.layers.add();
  created.name = 'Content';
  return created;
}

/* ---------- items ---------- */

var __ITEM_TYPES = {
  TextFrame: 'text', PathItem: 'path', CompoundPathItem: 'compound_path', GroupItem: 'group',
  PlacedItem: 'image', RasterItem: 'image', SymbolItem: 'symbol', MeshItem: 'mesh',
  PluginItem: 'plugin', GraphItem: 'graph', LegacyTextItem: 'legacy_text'
};

function __typeOf(item) {
  return __ITEM_TYPES[item.typename] || String(item.typename).toLowerCase();
}

/* getPageItemFromUuid returns a phantom empty GroupItem for linked PlacedItems
   (Illustrator 30 quirk), so suspicious hits are confirmed by scanning. */
function __findByUuid(doc, uuid) {
  var hit = null;
  try {
    hit = doc.getPageItemFromUuid(uuid);
  } catch (e) {
    hit = null;
  }
  if (hit && !(hit.typename === 'GroupItem' && hit.pageItems.length === 0)) return hit;
  var all = doc.pageItems;
  for (var i = 0; i < all.length; i++) if (all[i].uuid === uuid) return all[i];
  return hit;
}

/* Finds an item by uuid (all digits) or by unique name. */
function __findItem(doc, ref) {
  if (ref === undefined || ref === null || ref === '') __fail('An item reference (id or name) is required.');
  var s = String(ref);
  if (/^\d+$/.test(s)) {
    var byId = __findByUuid(doc, s);
    if (byId) return byId;
  }
  var matches = [];
  var all = doc.pageItems;
  for (var i = 0; i < all.length; i++) if (all[i].name === s) matches.push(all[i]);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    var ids = [];
    for (var j = 0; j < matches.length && j < 10; j++) ids.push(matches[j].uuid);
    __fail('Name "' + s + '" matches ' + matches.length + ' items; use an id instead (' + ids.join(', ') + ').');
  }
  __fail('Item not found: "' + s + '". Use ai_get_document_info to list item ids and names.');
}

function __clipPath(group) {
  for (var i = 0; i < group.pageItems.length; i++) {
    var it = group.pageItems[i];
    if (it.typename === 'PathItem' && it.clipping) return it;
    if (it.typename === 'CompoundPathItem' && it.pathItems.length && it.pathItems[0].clipping) return it;
  }
  return null;
}

/* Visible geometric bounds: a clipping group is only as big as its clipping path. */
function __bounds(item) {
  if (item.typename === 'GroupItem' && item.clipped) {
    var clip = __clipPath(item);
    if (clip) return clip.geometricBounds;
  }
  return item.geometricBounds;
}

/* Moves item so its visible top-left is at public (x, y) on artboard ab. */
function __moveTo(doc, ab, item, x, y) {
  var b = __bounds(item);
  var target = __toAi(doc, ab, x, y);
  item.translate(target[0] - b[0], target[1] - b[1]);
}

/* Resizes item's visible bounds to w x h (px), keeping its top-left. */
function __resizeTo(item, w, h) {
  var b = __bounds(item);
  var cw = b[2] - b[0];
  var ch = b[1] - b[3];
  if (cw <= 0 || ch <= 0) __fail('Item has zero width or height and cannot be resized.');
  var sx = (w / cw) * 100;
  var sy = (h / ch) * 100;
  item.resize(sx, sy, true, true, true, true, Math.sqrt(sx * sy), Transformation.TOPLEFT);
  item.translate(b[0] - __bounds(item)[0], b[1] - __bounds(item)[1]);
}

/* ---------- colours ---------- */

function __makeColor(hex) {
  var c = __parseHex(hex);
  var col = new RGBColor();
  col.red = c.r;
  col.green = c.g;
  col.blue = c.b;
  return col;
}

function __isNone(value) {
  return typeof value === 'string' && value.toLowerCase() === 'none';
}

/* A paint spec is "#rrggbb", "none", or a gradient object {type, angle, stops}. */
function __isGradientSpec(spec) {
  return spec !== null && typeof spec === 'object';
}

/* Builds a GradientColor in the active document from {type, stops:[{color, position, opacity}]}. */
function __makeGradient(spec) {
  var stops = spec.stops;
  if (!stops || stops.length < 2) __fail('A gradient needs at least 2 stops.');
  var g = app.activeDocument.gradients.add();
  g.type = spec.type === 'radial' ? GradientType.RADIAL : GradientType.LINEAR;
  while (g.gradientStops.length < stops.length) g.gradientStops.add();
  for (var i = 0; i < stops.length; i++) {
    var s = g.gradientStops[i];
    s.rampPoint = __pick(stops[i], 'position', (100 * i) / (stops.length - 1));
    s.midPoint = 50;
    s.color = __makeColor(stops[i].color);
    s.opacity = __pick(stops[i], 'opacity', 100);
  }
  var gc = new GradientColor();
  gc.gradient = g;
  return gc;
}

var __SWATCH_PREFIX = 'swatch:';

/* The colour of a document swatch (solid, spot, gradient or pattern) by name. */
function __swatchColor(name) {
  try {
    return app.activeDocument.swatches.getByName(name).color;
  } catch (e) {
    __fail('Swatch not found: "' + name + '". Use ai_swatch with action "list" to see the names.');
  }
}

/* "#rrggbb", "swatch:Name" or a gradient spec -> an Illustrator colour. */
function __makePaint(spec) {
  if (__isGradientSpec(spec)) return __makeGradient(spec);
  if (spec.indexOf(__SWATCH_PREFIX) === 0) return __swatchColor(spec.substring(__SWATCH_PREFIX.length));
  return __makeColor(spec);
}

var __STROKE_CAPS = { butt: 'BUTTENDCAP', round: 'ROUNDENDCAP', square: 'PROJECTINGENDCAP' };
var __STROKE_JOINS = { miter: 'MITERENDJOIN', round: 'ROUNDENDJOIN', bevel: 'BEVELENDJOIN' };

/* Dash pattern, line caps and corner joins of a path's stroke. */
function __applyStrokeStyle(path, a) {
  if (__has(a, 'dash')) path.strokeDashes = a.dash;
  if (__has(a, 'cap')) path.strokeCap = StrokeCap[__STROKE_CAPS[a.cap]];
  if (__has(a, 'join')) path.strokeJoin = StrokeJoin[__STROKE_JOINS[a.join]];
}

/* Rotates only the fill gradient of an item (0 = left->right, 90 = bottom->top, -90 = top->bottom). */
function __gradientAngle(item, spec) {
  if (__isGradientSpec(spec) && spec.type !== 'radial' && spec.angle) {
    item.rotate(spec.angle, false, false, true, false, Transformation.CENTER);
  }
}

function __cmykToHex(c) {
  var k = 1 - c.black / 100;
  return __toHex(255 * (1 - c.cyan / 100) * k, 255 * (1 - c.magenta / 100) * k, 255 * (1 - c.yellow / 100) * k);
}

/* Any Illustrator colour -> "#rrggbb", "none", or a descriptive string. */
function __colorHex(color) {
  if (!color) return null;
  switch (color.typename) {
    case 'RGBColor': return __toHex(color.red, color.green, color.blue);
    case 'CMYKColor': return __cmykToHex(color);
    case 'GrayColor': return __toHex(255 * (1 - color.gray / 100), 255 * (1 - color.gray / 100), 255 * (1 - color.gray / 100));
    case 'SpotColor': return __colorHex(color.spot.color);
    case 'NoColor': return 'none';
    case 'GradientColor': return 'gradient';
    case 'PatternColor': return 'pattern';
    default: return String(color.typename);
  }
}

/* Applies fill/stroke settings from args {fill, stroke, stroke_width} to a path item.
   Gradient angles are applied by the caller (once per item, see __gradientAngle). */
function __applyPaint(path, a) {
  if (__has(a, 'fill')) {
    if (__isNone(a.fill)) {
      path.filled = false;
    } else {
      path.filled = true;
      path.fillColor = __makePaint(a.fill);
    }
  }
  if (__has(a, 'stroke')) {
    if (__isNone(a.stroke)) {
      path.stroked = false;
    } else {
      path.stroked = true;
      path.strokeColor = __makePaint(a.stroke);
      if (!__has(a, 'stroke_width') && path.strokeWidth <= 0) path.strokeWidth = 1;
    }
  }
  if (__has(a, 'stroke_width')) {
    path.strokeWidth = a.stroke_width;
    if (a.stroke_width === 0) path.stroked = false;
  }
  __applyStrokeStyle(path, a);
}

/* Paint of a path/compound path for reporting. */
function __paintInfo(item) {
  var p = item.typename === 'CompoundPathItem' && item.pathItems.length ? item.pathItems[0] : item;
  return {
    fill: p.filled ? __colorHex(p.fillColor) : 'none',
    stroke: p.stroked ? __colorHex(p.strokeColor) : 'none',
    stroke_width: p.stroked ? __round(p.strokeWidth) : 0
  };
}

/* ---------- item reporting ---------- */

function __truncate(s, max) {
  s = String(s);
  return s.length > max ? s.substr(0, max) + '…' : s;
}

function __imageInfo(item, out) {
  out.embedded = item.typename === 'RasterItem' ? true : false;
  try {
    out.file = item.file.fsName;
  } catch (e) {
    out.file = null;
  }
}

function __groupInfo(doc, ab, item, out, depth) {
  out.clipped = item.clipped;
  out.children_count = item.pageItems.length;
  if (depth >= 2) return;
  var kids = [];
  for (var i = 0; i < item.pageItems.length && i < 50; i++) kids.push(__itemInfo(doc, item.pageItems[i], ab, depth + 1));
  out.children = kids;
}

/* Describes an item. abIndex null -> item's own artboard. */
function __itemInfo(doc, item, abIndex, depth) {
  depth = depth || 0;
  var b = __bounds(item);
  var own = __artboardAt(doc, b);
  var ab = (abIndex === null || abIndex === undefined) ? (own >= 0 ? own : doc.artboards.getActiveArtboardIndex()) : abIndex;
  var box = __boxOf(doc, ab, b);
  var out = {
    id: item.uuid, name: item.name, type: __typeOf(item), artboard: own >= 0 ? own : null,
    x: box.x, y: box.y, w: box.w, h: box.h, opacity: __round(item.opacity), hidden: item.hidden, locked: item.locked
  };
  if (depth === 0) out.layer = item.layer.name;
  var t = item.typename;
  if (t === 'TextFrame') __mergeInto(out, __textInfo(item));
  else if (t === 'PathItem' || t === 'CompoundPathItem') __mergeInto(out, __paintInfo(item));
  else if (t === 'PlacedItem' || t === 'RasterItem') __imageInfo(item, out);
  else if (t === 'GroupItem') __groupInfo(doc, ab, item, out, depth);
  if (t === 'PathItem' && item.clipping) out.clipping = true;
  return out;
}

function __mergeInto(target, src) {
  for (var k in src) if (src.hasOwnProperty(k)) target[k] = src[k];
  return target;
}

/* ---------- tools ---------- */

function ai_status(args) {
  var docs = [];
  for (var i = 0; i < app.documents.length; i++) docs.push(__docSummary(app.documents[i], i));
  return {
    app: 'Adobe Illustrator',
    version: app.version,
    build: app.buildNumber,
    scriptingVersion: app.scriptingVersion,
    locale: app.locale,
    documents: docs
  };
}

/* Raw escape hatch: evaluates code and returns the value of the last expression.
   Line numbers of errors refer to the caller's code, not to the composed script. */
function ai_run_script(args) {
  try {
    return eval(args.code);
  } catch (e) {
    if (e && e.__userError) throw e;
    var where = (e && e.line) ? ' (line ' + e.line + ' of your code)' : '';
    __fail('Script error: ' + ((e && e.message) ? e.message : String(e)) + where);
  }
}
