/*
 * illustrator-document.jsx: document-level ai_* tools.
 * ai_get_document_info, ai_new_document, ai_open, ai_close, ai_save,
 * ai_add_artboard, ai_undo, ai_list_fonts
 */

var __MAX_LIST_ITEMS = 300;
var __BACKGROUND_LAYER = 'Background';

function __collectLayerItems(doc, layer, path, abFilter, out) {
  for (var i = 0; i < layer.pageItems.length; i++) {
    if (out.items.length >= __MAX_LIST_ITEMS) {
      out.truncated = true;
      return;
    }
    var item = layer.pageItems[i];
    var own = __artboardAt(doc, __bounds(item));
    if (abFilter !== null && own !== abFilter) continue;
    var info = __itemInfo(doc, item, abFilter, 0);
    info.layer = path;
    info.index = i;
    out.items.push(info);
  }
  for (var j = 0; j < layer.layers.length; j++) {
    __collectLayerItems(doc, layer.layers[j], path + '/' + layer.layers[j].name, abFilter, out);
  }
}

function __layerList(doc) {
  var layers = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    layers.push({ index: i, name: l.name, visible: l.visible, locked: l.locked, items: l.pageItems.length, sublayers: l.layers.length });
  }
  return layers;
}

function ai_get_document_info(a) {
  var doc = __requireDoc();
  var abFilter = __has(a, 'artboard') ? __abIndex(doc, a.artboard) : null;
  var out = { items: [], truncated: false };
  for (var i = 0; i < doc.layers.length; i++) __collectLayerItems(doc, doc.layers[i], doc.layers[i].name, abFilter, out);
  return {
    document: __docSummary(doc, 0),
    layers: __layerList(doc),
    items: out.items,
    truncated: out.truncated,
    note: abFilter === null
      ? 'x/y of each item are relative to the top-left of its own artboard (field "artboard"); index is z-order within its layer, 0 = front.'
      : 'Only items whose centre is on artboard ' + abFilter + '; x/y relative to its top-left.'
  };
}

/* Adds a locked full-artboard background rectangle on the bottom "Background" layer. */
function __addBackground(doc, abIndex, hex) {
  var layer = __findLayer(doc, __BACKGROUND_LAYER);
  if (!layer) {
    layer = doc.layers.add();
    layer.name = __BACKGROUND_LAYER;
    layer.zOrder(ZOrderMethod.SENDTOBACK);
  }
  layer.locked = false;
  var r = __abRect(doc, abIndex);
  var rect = layer.pathItems.rectangle(r[1], r[0], r[2] - r[0], r[1] - r[3]);
  rect.stroked = false;
  rect.filled = true;
  rect.fillColor = __makeColor(hex);
  rect.name = 'Background ' + abIndex;
  layer.locked = true;
  return rect.uuid;
}

function __activateContentLayer(doc) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (__usableLayer(doc.layers[i])) {
      doc.activeLayer = doc.layers[i];
      return;
    }
  }
}

function ai_new_document(a) {
  var preset = new DocumentPreset();
  preset.width = a.width;
  preset.height = a.height;
  preset.units = RulerUnits.Pixels;
  preset.colorMode = a.color_mode === 'cmyk' ? DocumentColorSpace.CMYK : DocumentColorSpace.RGB;
  preset.numArtboards = 1;
  if (a.name) preset.title = a.name;
  var mode = a.color_mode === 'cmyk' ? DocumentColorSpace.CMYK : DocumentColorSpace.RGB;
  var doc = app.documents.addDocument(a.color_mode === 'cmyk' ? 'Print' : 'Web', preset);
  if (doc.documentColorSpace !== mode) __fail('Illustrator created the document in the wrong colour mode.');
  if (a.artboard_name) doc.artboards[0].name = a.artboard_name;
  doc.layers[0].name = 'Content';
  var bg = a.background ? __addBackground(doc, 0, a.background) : null;
  __activateContentLayer(doc);
  var summary = __docSummary(doc, 0);
  summary.background_id = bg;
  return summary;
}

function __requireFile(path, what) {
  var f = new File(path);
  if (!f.exists) __fail(what + ' not found: ' + path);
  return f;
}

/* Opens a file, or with `document` switches to an already open document. */
function ai_open(a) {
  if (!a.path && !a.document) __fail('Give path (a file to open) or document (the name of an open document).');
  var doc;
  if (a.document) {
    doc = __findDocument(a.document);
    doc.activate();
  } else {
    doc = app.open(__requireFile(a.path, 'File'));
  }
  return __docSummary(app.activeDocument, 0);
}

function __findDocument(name) {
  if (!name) return __requireDoc();
  for (var i = 0; i < app.documents.length; i++) if (app.documents[i].name === name) return app.documents[i];
  __fail('No open document named "' + name + '". Use ai_status to list open documents.');
}

function ai_close(a) {
  var doc = __findDocument(a.document);
  var name = doc.name;
  if (a.save && !__docPath(doc)) __fail('Document "' + name + '" has never been saved; call ai_save with a path first.');
  doc.close(a.save ? SaveOptions.SAVECHANGES : SaveOptions.DONOTSAVECHANGES);
  return { closed: name, saved: !!a.save, remaining: app.documents.length };
}

function __ensureParentFolder(file) {
  var parent = file.parent;
  if (!parent.exists && !parent.create()) __fail('Cannot create folder: ' + parent.fsName);
}

function __saveOptions(format, a) {
  if (format === 'pdf') {
    var pdf = new PDFSaveOptions();
    if (a.pdf_preset) pdf.pDFPreset = a.pdf_preset;
    pdf.preserveEditability = a.preserve_editability !== false;
    return pdf;
  }
  var ai = new IllustratorSaveOptions();
  ai.pdfCompatible = true;
  ai.embedLinkedFiles = !!a.embed_linked_files;
  return ai;
}

function ai_save(a) {
  var doc = __findDocument(a.document);
  if (!a.path) {
    if (!__docPath(doc)) __fail('Document has never been saved; pass a path ending in .ai or .pdf.');
    doc.save();
    return { path: __docPath(doc), format: 'existing' };
  }
  var format = /\.pdf$/i.test(a.path) ? 'pdf' : 'ai';
  var file = new File(a.path);
  __ensureParentFolder(file);
  doc.saveAs(file, __saveOptions(format, a));
  return { path: __docPath(doc) || a.path, format: format };
}

/* Places a new artboard to the right of all existing ones, top-aligned with artboard 0. */
function ai_add_artboard(a) {
  var doc = __requireDoc();
  var right = -Infinity;
  for (var i = 0; i < doc.artboards.length; i++) right = Math.max(right, doc.artboards[i].artboardRect[2]);
  var top = doc.artboards[0].artboardRect[1];
  var left = right + a.gap;
  var ab = doc.artboards.add([left, top, left + a.width, top - a.height]);
  var index = doc.artboards.length - 1;
  if (a.name) ab.name = a.name;
  var bg = a.background ? __addBackground(doc, index, a.background) : null;
  if (a.activate) doc.artboards.setActiveArtboardIndex(index);
  var info = __artboardInfo(doc, index);
  info.background_id = bg;
  info.active = doc.artboards.getActiveArtboardIndex() === index;
  return info;
}

function ai_undo(a) {
  __requireDoc();
  for (var i = 0; i < a.steps; i++) app.undo();
  return { undone: a.steps };
}

function __fontMatches(f, words) {
  var hay = (f.name + ' ' + f.family + ' ' + f.style).toLowerCase();
  for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
  return true;
}

function ai_list_fonts(a) {
  var words = a.query ? String(a.query).toLowerCase().split(/\s+/) : [];
  var fonts = [];
  var matches = 0;
  for (var i = 0; i < app.textFonts.length; i++) {
    var f = app.textFonts[i];
    if (!__fontMatches(f, words)) continue;
    matches++;
    if (fonts.length < a.limit) fonts.push({ name: f.name, family: f.family, style: f.style });
  }
  return { total_installed: app.textFonts.length, matches: matches, fonts: fonts };
}
