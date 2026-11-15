/*
 * photoshop-document.jsx: document ps_* tools.
 * ps_status, ps_get_document_info, ps_new_document, ps_open, ps_close, ps_save,
 * ps_list_fonts, ps_undo, ps_canvas
 */

var __MAX_LAYERS_LISTED = 500;
var __ANCHORS = {
  top_left: 'TOPLEFT', top: 'TOPCENTER', top_right: 'TOPRIGHT', left: 'MIDDLELEFT', center: 'MIDDLECENTER',
  right: 'MIDDLERIGHT', bottom_left: 'BOTTOMLEFT', bottom: 'BOTTOMCENTER', bottom_right: 'BOTTOMRIGHT'
};

function __modeName(doc) {
  return String(doc.mode).replace('DocumentMode.', '').toLowerCase();
}

function __docSummary(doc) {
  return {
    name: doc.name, path: __docPath(doc), saved: doc.saved, width: __round(__px(doc.width)),
    height: __round(__px(doc.height)), resolution: doc.resolution, mode: __modeName(doc), layers: doc.layers.length
  };
}

function ps_status(a) {
  var docs = [];
  for (var i = 0; i < app.documents.length; i++) docs.push(__docSummary(app.documents[i]));
  return { app: 'Adobe Photoshop', version: app.version, documents: docs, active: app.documents.length ? app.activeDocument.name : null };
}

function ps_get_document_info(a) {
  var doc = __findDocument(a.document);
  app.activeDocument = doc;
  var all = __allLayers(doc);
  var layers = [];
  for (var i = 0; i < all.length && i < __MAX_LAYERS_LISTED; i++) layers.push(__layerInfo(all[i]));
  var out = __docSummary(doc);
  out.layers = layers;
  out.layer_count = all.length;
  if (all.length > __MAX_LAYERS_LISTED) out.note = 'Only the first ' + __MAX_LAYERS_LISTED + ' layers are listed.';
  return out;
}

function __newDocMode(mode) {
  if (mode === 'cmyk') return NewDocumentMode.CMYK;
  if (mode === 'grayscale') return NewDocumentMode.GRAYSCALE;
  return NewDocumentMode.RGB;
}

function ps_new_document(a) {
  var transparent = a.background === 'transparent';
  var doc = app.documents.add(new UnitValue(a.width, 'px'), new UnitValue(a.height, 'px'), a.resolution,
    a.name || 'Untitled', __newDocMode(a.color_mode), transparent ? DocumentFill.TRANSPARENT : DocumentFill.WHITE);
  if (!transparent && a.background.toUpperCase().replace('#', '') !== 'FFFFFF') {
    doc.selection.selectAll();
    doc.selection.fill(__solid(a.background));
    doc.selection.deselect();
  }
  return __docSummary(doc);
}

function ps_open(a) {
  if (!a.path && !a.document) __fail('Give path (a file to open) or document (the name of an open document).');
  var doc;
  if (a.document) {
    doc = __findDocument(a.document);
    app.activeDocument = doc;
  } else {
    var f = new File(a.path);
    if (!f.exists) __fail('File not found: ' + a.path);
    doc = app.open(f);
  }
  return __docSummary(doc);
}

function ps_close(a) {
  var doc = __findDocument(a.document);
  var name = doc.name;
  if (a.save && !__docPath(doc)) __fail('Document "' + name + '" has never been saved; call ps_save with a path first.');
  doc.close(a.save ? SaveOptions.SAVECHANGES : SaveOptions.DONOTSAVECHANGES);
  return { closed: name, saved: !!a.save, remaining: app.documents.length };
}

function __saveOptionsFor(path) {
  if (/\.psd$/i.test(path)) {
    var psd = new PhotoshopSaveOptions();
    psd.layers = true;
    psd.embedColorProfile = true;
    return psd;
  }
  if (/\.tiff?$/i.test(path)) {
    var tif = new TiffSaveOptions();
    tif.layers = true;
    tif.imageCompression = TIFFEncoding.TIFFLZW;
    return tif;
  }
  if (/\.pdf$/i.test(path)) {
    var pdf = new PDFSaveOptions();
    pdf.layers = false;
    return pdf;
  }
  __fail('ps_save writes .psd, .tif or .pdf. Use ps_export for .png / .jpg.');
}

function ps_save(a) {
  var doc = __findDocument(a.document);
  if (!a.path) {
    if (!__docPath(doc)) __fail('Document has never been saved; pass a path ending in .psd, .tif or .pdf.');
    doc.save();
    return { path: __docPath(doc), format: 'existing' };
  }
  var file = new File(a.path);
  if (!file.parent.exists && !file.parent.create()) __fail('Cannot create folder: ' + file.parent.fsName);
  doc.saveAs(file, __saveOptionsFor(a.path), false, Extension.LOWERCASE);
  return { path: __docPath(doc) || file.fsName };
}

function ps_list_fonts(a) {
  var q = (a.query || '').toLowerCase();
  var out = [];
  var total = 0;
  for (var i = 0; i < app.fonts.length; i++) {
    var f = app.fonts[i];
    var hay = (f.name + ' ' + f.postScriptName + ' ' + f.family + ' ' + f.style).toLowerCase();
    if (q && hay.indexOf(q) < 0) continue;
    total++;
    if (out.length < a.limit) out.push({ postscript: f.postScriptName, name: f.name, family: f.family, style: f.style });
  }
  return { total: total, fonts: out };
}

/* 0-based index of the current history state (the Action Manager lookup is not
   always available, e.g. after a smart filter, so this uses the DOM). */
function __historyIndex(doc) {
  var current = doc.activeHistoryState;
  for (var i = doc.historyStates.length - 1; i >= 0; i--) if (doc.historyStates[i] == current) return i;
  __fail('Cannot find the current history state.');
}

function ps_undo(a) {
  var doc = __requireDoc();
  var current = __historyIndex(doc);
  var target = Math.max(0, current - a.steps);
  doc.activeHistoryState = doc.historyStates[target];
  return { undone: current - target, now_at: doc.activeHistoryState.name };
}

/* ---------- canvas ---------- */

function __resizeImage(doc, a) {
  var w = __px(doc.width), h = __px(doc.height);
  if (!__has(a, 'width') && !__has(a, 'height')) __fail('resize_image needs width and/or height.');
  var nw = __pick(a, 'width', w * a.height / h);
  var nh = __pick(a, 'height', h * nw / w);
  doc.resizeImage(new UnitValue(nw, 'px'), new UnitValue(nh, 'px'), doc.resolution, ResampleMethod.BICUBICAUTOMATIC);
}

function __resizeCanvas(doc, a) {
  if (!__has(a, 'width') && !__has(a, 'height')) __fail('resize_canvas needs width and/or height.');
  doc.resizeCanvas(new UnitValue(__pick(a, 'width', __px(doc.width)), 'px'),
    new UnitValue(__pick(a, 'height', __px(doc.height)), 'px'), AnchorPosition[__ANCHORS[a.anchor]]);
}

function __crop(doc, a) {
  if (!__has(a, 'x') || !__has(a, 'y') || !__has(a, 'w') || !__has(a, 'h')) __fail('crop needs x, y, w and h.');
  doc.crop([new UnitValue(a.x, 'px'), new UnitValue(a.y, 'px'), new UnitValue(a.x + a.w, 'px'), new UnitValue(a.y + a.h, 'px')]);
}

/* Each action is a single native operation, so it is already one history step.
   It is NOT wrapped in __step: a grouped canvas change in a document with smart
   filters is not reverted when an earlier history state is selected. */
function ps_canvas(a) {
  var doc = __requireDoc();
  if (a.action === 'resize_image') __resizeImage(doc, a);
  if (a.action === 'resize_canvas') __resizeCanvas(doc, a);
  if (a.action === 'crop') __crop(doc, a);
  if (a.action === 'rotate') doc.rotateCanvas(a.angle);
  if (a.action === 'trim') doc.trim(TrimType.TRANSPARENT, true, true, true, true);
  if (a.action === 'flatten') doc.flatten();
  return __docSummary(doc);
}
