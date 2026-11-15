/*
 * qr-place.jsx: puts an encoded QR into the active Illustrator document (DOM code
 * shared by the QR script and the QR panel). Needs qr-encoder.jsx and qr-draw.jsx.
 * opts: {text, ecc, size, quiet, style, foreground: {r,g,b}, background: {r,g,b}|null, at: "artboard"|"selection"}
 */

var QRP_NEW_DOC_SIZE = 600;

/* Pure black becomes 100% K in CMYK documents (crisp single-plate print); other colours convert from RGB. */
function qrpColor(doc, rgb) {
  var isBlack = rgb.r === 0 && rgb.g === 0 && rgb.b === 0;
  if (doc.documentColorSpace === DocumentColorSpace.CMYK && isBlack) {
    var k = new CMYKColor();
    k.black = 100;
    return k;
  }
  var c = new RGBColor();
  c.red = rgb.r;
  c.green = rgb.g;
  c.blue = rgb.b;
  return c;
}

/* ---------- drawing ---------- */

function qrpTargetDocument() {
  if (app.documents.length > 0) return app.activeDocument;
  return app.documents.add(DocumentColorSpace.RGB, QRP_NEW_DOC_SIZE, QRP_NEW_DOC_SIZE);
}

function qrpTargetLayer(doc) {
  var layer = doc.activeLayer;
  if (layer.locked || !layer.visible) throw new Error('The active layer "' + layer.name + '" is locked or hidden. Pick another layer.');
  return layer;
}

function qrpBackground(group, doc, top, left, opts) {
  var bg = group.pathItems.rectangle(top, left, opts.size, opts.size);
  bg.name = 'QR background';
  bg.stroked = false;
  bg.filled = true;
  bg.fillColor = qrpColor(doc, opts.background);
}

/* [centreX, centreY] in document points: the selection's visible bounds when asked and present, else the active artboard. */
function qrpCentre(doc, at) {
  if (at === 'selection' && doc.selection && doc.selection.length > 0) {
    var b = doc.selection[0].visibleBounds;
    for (var i = 1; i < doc.selection.length; i++) {
      var s = doc.selection[i].visibleBounds;
      b = [Math.min(b[0], s[0]), Math.max(b[1], s[1]), Math.max(b[2], s[2]), Math.min(b[3], s[3])];
    }
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  var r = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}

/* Draws the QR centred on the active artboard (or the selection); returns {group, qr}. */
function qrpCreate(opts) {
  var qr = __qrEncode(opts.text, opts.ecc, 0);
  var doc = qrpTargetDocument();
  var layer = qrpTargetLayer(doc);
  var c = qrpCentre(doc, opts.at);
  var left = c[0] - opts.size / 2;
  var top = c[1] + opts.size / 2;
  var m = opts.size / (qr.size + 2 * opts.quiet);
  var q = opts.quiet;
  var map = function (mx, my) { return [left + (mx + q) * m, top - (my + q) * m]; };
  var group = layer.groupItems.add();
  group.name = 'QR Code';
  if (opts.background) qrpBackground(group, doc, top, left, opts);
  var compound = __qrDrawModules(group, qr, map, m, opts.style);
  __qrFillCompound(compound, qrpColor(doc, opts.foreground));
  compound.move(group, ElementPlacement.PLACEATBEGINNING);
  doc.selection = null;
  group.selected = true;
  return { group: group, qr: qr };
}
