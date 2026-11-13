/*
 * illustrator-distort.jsx: ai_distort (warp, twirl, roughen, pucker/bloat,
 * extrude) and ai_trace_image.
 *
 * warp, twirl and roughen are Illustrator live effects (editable later in the
 * Appearance panel). Illustrator ignores scripted settings for Pucker & Bloat
 * and 3D, so pucker_bloat reshapes the curve handles directly and extrude
 * builds a solid side from stacked copies.
 */

var __WARP_STYLES = [
  'arc', 'arc_lower', 'arc_upper', 'arch', 'bulge', 'shell_lower', 'shell_upper', 'flag', 'wave', 'fish', 'rise',
  'fisheye', 'inflate', 'squeeze', 'twist'
];
var __MAX_EXTRUDE_STEPS = 100;
var __SIDE_SHADE = 0.55;
var __DEFAULT_SIDE = '#333333';

function __effectXml(name, data) {
  return '<LiveEffect name="' + name + '"><Dict data="' + data + '"/></LiveEffect>';
}

function __warpXml(a) {
  var style = 1;
  for (var i = 0; i < __WARP_STYLES.length; i++) if (__WARP_STYLES[i] === a.style) style = i + 1;
  var bend = Math.max(-100, Math.min(100, a.amount));
  return __effectXml('Adobe Deform',
    'R DeformValue ' + (bend / 100) + ' R DeformVert ' + (a.vertical / 100) + ' B Rotate ' + (a.direction === 'vertical' ? 1 : 0) +
    ' I DeformStyle ' + style + ' R DeformHoriz ' + (a.horizontal / 100) + ' ');
}

function __twirlXml(a) {
  return __effectXml('Adobe Twirl', 'R angle ' + a.angle + ' ');
}

function __roughenXml(a) {
  return __effectXml('Adobe Roughen',
    'R size ' + a.size + ' B absoluteness 0 R segments ' + a.detail + ' I roughness ' + (a.smooth ? 1 : 0) + ' ');
}

/* ---------- pucker & bloat ---------- */

/* Control point of a segment's bulge: k > 0 pushes the middle away from the centre, k < 0 pulls it in. */
function __bulgePoint(p0, p1, c, k) {
  var mx = (p0[0] + p1[0]) / 2;
  var my = (p0[1] + p1[1]) / 2;
  return [mx + (mx - c[0]) * k, my + (my - c[1]) * k];
}

function __towards(p, q, t) {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/* Quadratic-to-cubic: each segment curves through its bulge point; anchors stay put. */
function __puckerPath(path, c, k) {
  var pts = path.pathPoints;
  var n = pts.length;
  var segments = path.closed ? n : n - 1;
  var anchors = [];
  for (var i = 0; i < n; i++) anchors.push(pts[i].anchor);
  for (var s = 0; s < segments; s++) {
    var j = (s + 1) % n;
    var b = __bulgePoint(anchors[s], anchors[j], c, k);
    pts[s].rightDirection = __towards(anchors[s], b, 2 / 3);
    pts[j].leftDirection = __towards(anchors[j], b, 2 / 3);
    pts[s].pointType = PointType.CORNER;
    pts[j].pointType = PointType.CORNER;
  }
}

function __puckerBloat(item, amount) {
  var b = __bounds(item);
  var c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  __eachPath(item, function (p) { __puckerPath(p, c, amount / 100); });
}

/* ---------- extrude ---------- */

function __shade(hex, factor) {
  var c = __parseHex(hex);
  return __toHex(c.r * factor, c.g * factor, c.b * factor);
}

/* Side colour: explicit, else a darker version of the item's own solid fill. */
function __sideColor(item, color) {
  if (color) return color;
  try {
    var src = item.typename === 'TextFrame' ? __allChars(item).fillColor : __firstPath(item).fillColor;
    var hex = __colorHex(src);
    if (/^#[0-9a-f]{6}$/i.test(hex)) return __shade(hex, __SIDE_SHADE);
  } catch (e) { /* gradient, pattern or unreadable: fall back */ }
  return __DEFAULT_SIDE;
}

function __firstPath(item) {
  var found = null;
  __eachPath(item, function (p) { if (!found) found = p; });
  return found;
}

/* Stacked copies behind the item, shifted step by step along angle (0 = right, 90 = down). */
function __extrude(doc, item, a) {
  var steps = Math.min(__MAX_EXTRUDE_STEPS, Math.max(1, Math.round(a.depth)));
  var rad = a.angle * Math.PI / 180;
  var dx = Math.cos(rad) * a.depth / steps;
  var dy = -Math.sin(rad) * a.depth / steps;
  var side = __sideColor(item, __pick(a, 'color', null));
  var group = item.parent.groupItems.add();
  group.move(item, ElementPlacement.PLACEAFTER);
  for (var s = 1; s <= steps; s++) {
    var copy = item.duplicate(group, ElementPlacement.PLACEATEND);
    __paintItem(copy, { fill: side });
    if (copy.typename !== 'TextFrame') __eachPath(copy, function (p) { if (p.stroked) p.strokeColor = __makeColor(side); });
    copy.translate(dx * s, dy * s);
  }
  group.name = (item.name || __typeOf(item)) + ' extrude';
  return group;
}

/* ---------- ai_distort ---------- */

function __expandAppearance(doc, item) {
  doc.selection = null;
  item.selected = true;
  app.executeMenuCommand('expandStyle');
  var result = doc.selection.length === 1 ? doc.selection[0] : item;
  doc.selection = null;
  return result;
}

function ai_distort(a) {
  var doc = __requireDoc();
  var item = __findItem(doc, a.item);
  var name = item.name;
  var extra = {};
  if (a.effect === 'extrude') {
    extra.extrude_id = __extrude(doc, item, a).uuid;
  } else if (a.effect === 'pucker_bloat') {
    __puckerBloat(item, a.amount);
  } else {
    if (a.effect === 'warp') item.applyEffect(__warpXml(a));
    if (a.effect === 'twirl') item.applyEffect(__twirlXml(a));
    if (a.effect === 'roughen') item.applyEffect(__roughenXml(a));
    if (a.expand) {
      item = __expandAppearance(doc, item);
      if (name) item.name = name;
    }
  }
  var info = __itemInfo(doc, item, null, 0);
  for (var k in extra) if (extra.hasOwnProperty(k)) info[k] = extra[k];
  return info;
}

/* ---------- image trace ---------- */

function __tracingPresets() {
  var out = [];
  var list = app.tracingPresetsList;
  for (var i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}

function ai_trace_image(a) {
  if (a.list_presets) return { presets: __tracingPresets() };
  var doc = __requireDoc();
  if (!__has(a, 'item')) __fail('item is required (a placed or embedded image).');
  var item = __findItem(doc, a.item);
  if (item.typename !== 'PlacedItem' && item.typename !== 'RasterItem') {
    __fail('Image Trace works on images (item is ' + __typeOf(item) + ').');
  }
  var presets = __tracingPresets();
  var known = false;
  for (var i = 0; i < presets.length; i++) if (presets[i] === a.preset) known = true;
  if (!known) __fail('Unknown tracing preset "' + a.preset + '". Available: ' + presets.join(', '));
  var traced = item.trace();
  traced.tracing.tracingOptions.loadFromPreset(a.preset);
  app.redraw();
  var result = a.expand ? traced.tracing.expandTracing() : traced;
  if (a.name) result.name = a.name;
  return __itemInfo(doc, result, null, 0);
}
