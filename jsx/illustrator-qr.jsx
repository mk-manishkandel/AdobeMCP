/*
 * illustrator-qr.jsx: ai_qr_code, a native vector QR code.
 * Encoding/outlines: qr-encoder.jsx. Drawing primitives: qr-draw.jsx. This file maps
 * the public top-left/y-down coordinates and applies MCP paints (hex, swatch, gradient).
 *
 * Output: a group "QR Code" holding an optional background square (quiet zone
 * included) and one compound path "QR modules".
 */

/* Maps module-grid coordinates to Illustrator points without re-reading the artboard for every point. */
function __qrMapper(doc, ab, a, moduleSize) {
  var origin = __toAi(doc, ab, a.x, a.y);
  var unit = __toAi(doc, ab, a.x + 1, a.y + 1);
  var sx = (unit[0] - origin[0]) * moduleSize;
  var sy = (unit[1] - origin[1]) * moduleSize;
  var q = a.quiet_zone;
  return function (mx, my) {
    return [origin[0] + (mx + q) * sx, origin[1] + (my + q) * sy];
  };
}

function __qrBackground(group, doc, ab, a) {
  var tl = __toAi(doc, ab, a.x, a.y);
  var bg = group.pathItems.rectangle(tl[1], tl[0], a.size, a.size);
  bg.name = 'QR background';
  __applyPaint(bg, { fill: a.background, stroke: 'none' });
  __gradientAngle(bg, a.background);
  return bg;
}

/* Defaults x/y to centre the code on the artboard. */
function __qrPlacement(doc, ab, a) {
  var r = __abRect(doc, ab);
  if (!__has(a, 'x')) a.x = ((r[2] - r[0]) - a.size) / 2;
  if (!__has(a, 'y')) a.y = ((r[1] - r[3]) - a.size) / 2;
}

function ai_qr_code(a) {
  var doc = __requireDoc();
  var ab = __abIndex(doc, a.artboard);
  var qr = __qrEncode(a.text, a.ecc, a.min_version);
  __qrPlacement(doc, ab, a);
  var moduleSize = a.size / (qr.size + 2 * a.quiet_zone);
  var layer = __targetLayer(doc, a.layer);
  var group = layer.groupItems.add();
  group.name = a.name || 'QR Code';
  if (!__isNone(a.background)) __qrBackground(group, doc, ab, a);
  var compound = __qrDrawModules(group, qr, __qrMapper(doc, ab, a, moduleSize), moduleSize, a.style);
  __qrFillCompound(compound, __makePaint(a.fill));
  __gradientAngle(compound, a.fill);
  compound.move(group, ElementPlacement.PLACEATBEGINNING);
  var info = __itemInfo(doc, group, ab, 1);
  info.qr = {
    version: qr.version, ecc: qr.ecc, mode: qr.mode, mask: qr.mask, modules: qr.size,
    quiet_zone: a.quiet_zone, module_size: __round(moduleSize), style: a.style, paths: compound.pathItems.length
  };
  return info;
}
