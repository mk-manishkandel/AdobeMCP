/*
 * photoshop-export.jsx: ps_export, ps_preview (the Node side turns the preview
 * PNG into image content).
 *
 * Exports work on a duplicate of the document (merged, resized, saved as a
 * copy, closed), so the user's document and its history are never touched.
 */

var __JPG_QUALITY_STEPS = 12;

function __exportFormatOf(path, explicit) {
  if (explicit) return explicit;
  var m = /\.([A-Za-z0-9]+)$/.exec(path);
  var ext = m ? m[1].toLowerCase() : '';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'png' || ext === 'jpg') return ext;
  __fail('Cannot tell the export format from "' + path + '"; end it in .png or .jpg, or pass format. Use ps_save for .psd/.tif/.pdf.');
}

/* Target pixel size from width / height / scale, keeping the aspect ratio. */
function __exportSize(w, h, a) {
  if (__has(a, 'width') && __has(a, 'height')) return { w: a.width, h: a.height };
  if (__has(a, 'width')) return { w: a.width, h: Math.max(1, Math.round(h * a.width / w)) };
  if (__has(a, 'height')) return { w: Math.max(1, Math.round(w * a.height / h)), h: a.height };
  var s = __pick(a, 'scale', 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function __mergeForExport(dup, format, transparent) {
  if (format === 'jpg' || !transparent) {
    dup.flatten();
    return;
  }
  try { dup.mergeVisibleLayers(); } catch (e) { /* a single layer has nothing to merge */ }
}

function __saveCopy(dup, file, format, a) {
  if (format === 'png') {
    var png = new PNGSaveOptions();
    png.compression = 6;
    png.interlaced = false;
    dup.saveAs(file, png, true, Extension.LOWERCASE);
    return;
  }
  if (dup.mode !== DocumentMode.RGB) dup.changeMode(ChangeMode.RGB);
  var jpg = new JPEGSaveOptions();
  jpg.quality = Math.max(0, Math.min(__JPG_QUALITY_STEPS, Math.round(__pick(a, 'quality', 85) * __JPG_QUALITY_STEPS / 100)));
  jpg.embedColorProfile = true;
  jpg.formatOptions = FormatOptions.STANDARDBASELINE;
  jpg.matte = MatteType.WHITE;
  dup.saveAs(file, jpg, true, Extension.LOWERCASE);
}

/* Renders the active document to path; returns {path, format, width, height}. */
function __exportDocument(doc, path, a) {
  var format = __exportFormatOf(path, a.format);
  var file = new File(path);
  if (!file.parent.exists && !file.parent.create()) __fail('Cannot create folder: ' + file.parent.fsName);
  var size = __exportSize(__px(doc.width), __px(doc.height), a);
  var dup = doc.duplicate('mcp-export-' + new Date().getTime(), false);
  try {
    __mergeForExport(dup, format, !!a.transparent);
    if (dup.bitsPerChannel !== BitsPerChannelType.EIGHT) dup.bitsPerChannel = BitsPerChannelType.EIGHT;
    if (size.w !== __px(dup.width) || size.h !== __px(dup.height)) {
      dup.resizeImage(new UnitValue(size.w, 'px'), new UnitValue(size.h, 'px'), dup.resolution, ResampleMethod.BICUBICAUTOMATIC);
    }
    __saveCopy(dup, file, format, a);
  } finally {
    dup.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
  }
  return { path: file.fsName, format: format, document: doc.name, width: size.w, height: size.h };
}

function ps_export(a) {
  var doc = __findDocument(a.document);
  app.activeDocument = doc;
  return __exportDocument(doc, a.path, a);
}

/* PNG preview whose longest side is max_size px (never upscaled). */
function ps_preview(a) {
  var doc = __findDocument(a.document);
  app.activeDocument = doc;
  var w = __px(doc.width), h = __px(doc.height);
  var opts = { format: 'png', transparent: false };
  var longest = Math.max(w, h);
  if (longest > a.max_size) {
    if (w >= h) opts.width = a.max_size;
    else opts.height = a.max_size;
  }
  var out = __exportDocument(doc, a.path, opts);
  out.canvas = { w: __round(w), h: __round(h) };
  return out;
}

/* Raw escape hatch: evaluates code and returns the value of the last expression.
   Line numbers of errors refer to the caller's code, not to the composed script. */
function ps_run_script(args) {
  try {
    return eval(args.code);
  } catch (e) {
    if (e && e.__userError) throw e;
    var where = (e && e.line) ? ' (line ' + e.line + ' of your code)' : '';
    __fail('Script error: ' + ((e && e.message) ? e.message : String(e)) + where);
  }
}
