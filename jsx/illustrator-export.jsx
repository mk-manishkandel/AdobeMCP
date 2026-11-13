/*
 * illustrator-export.jsx: export ai_* tools.
 * ai_export, ai_preview (the Node side turns the preview PNG into image content)
 *
 * Uses Export for Screens, which scales by target width natively and exports a
 * single artboard. It writes into <folder>/<scale>/<prefix><artboard>.<ext>,
 * so we export into a private temp folder and move the one file into place.
 */

function __exportType(format, quality) {
  if (format === 'png') return ExportForScreensType.SE_PNG24;
  if (format === 'svg') return ExportForScreensType.SE_SVG;
  if (format === 'webp') return ExportForScreensType.SE_WEBP;
  if (format === 'jpg') {
    if (quality >= 90) return ExportForScreensType.SE_JPEG100;
    if (quality >= 65) return ExportForScreensType.SE_JPEG80;
    if (quality >= 35) return ExportForScreensType.SE_JPEG50;
    return ExportForScreensType.SE_JPEG20;
  }
  __fail('Unsupported export format: ' + format + ' (use png, jpg, svg or webp).');
}

function __applyScale(opts, a) {
  if (__has(a, 'width')) {
    opts.scaleType = ExportForScreensScaleType.SCALEBYWIDTH;
    opts.scaleTypeValue = a.width;
  } else if (__has(a, 'height')) {
    opts.scaleType = ExportForScreensScaleType.SCALEBYHEIGHT;
    opts.scaleTypeValue = a.height;
  } else {
    opts.scaleType = ExportForScreensScaleType.SCALEBYFACTOR;
    opts.scaleTypeValue = __pick(a, 'scale', 1);
  }
}

function __exportOptions(format, a) {
  var opts;
  if (format === 'png') {
    opts = new ExportForScreensOptionsPNG24();
    opts.transparency = !!a.transparent;
    opts.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
  } else if (format === 'jpg') {
    opts = new ExportForScreensOptionsJPEG();
    opts.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
  } else if (format === 'webp') {
    /* WebP options have no defaults: every property must be set or export fails. */
    opts = new ExportForScreensOptionsWebP();
    opts.imageQuality = __pick(a, 'quality', 85);
    opts.losslessCompression = false;
    opts.isTransparent = !!a.transparent;
    opts.embedICCProfile = false;
    opts.includeMetadata = false;
    opts.PPI = 72;
    opts.matteColor = __makeColor('#FFFFFF');
    opts.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
  } else {
    return new ExportForScreensOptionsWebOptimizedSVG();
  }
  __applyScale(opts, a);
  return opts;
}

function __findFiles(folder, out) {
  var entries = folder.getFiles();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i] instanceof Folder) __findFiles(entries[i], out);
    else out.push(entries[i]);
  }
  return out;
}

function __removeTree(folder) {
  var entries = folder.getFiles();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i] instanceof Folder) __removeTree(entries[i]);
    else entries[i].remove();
  }
  folder.remove();
}

function __formatOf(path, explicit) {
  if (explicit) return explicit === 'jpeg' ? 'jpg' : explicit;
  var m = /\.([A-Za-z0-9]+)$/.exec(path);
  var ext = m ? m[1].toLowerCase() : '';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'png' || ext === 'jpg' || ext === 'svg' || ext === 'webp') return ext;
  __fail('Cannot tell the export format from "' + path + '"; end it in .png, .jpg, .svg or .webp, or pass format.');
}

/* Exports one artboard to path and returns {path, format, artboard, width, height}. */
function __exportArtboard(doc, ab, path, a) {
  var format = __formatOf(path, a.format);
  var tmp = new Folder(Folder.temp.fsName + '/adobe-mcp-export-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6));
  if (!tmp.create()) __fail('Cannot create temp folder ' + tmp.fsName);
  try {
    var what = new ExportForScreensItemToExport();
    what.artboards = String(ab + 1);
    what.document = false;
    doc.exportForScreens(tmp, __exportType(format, a.quality), __exportOptions(format, a), what, 'x_');
    var files = __findFiles(tmp, []);
    if (files.length !== 1) __fail('Export produced ' + files.length + ' files instead of 1.');
    var target = new File(path);
    __ensureParentFolder(target);
    if (target.exists && !target.remove()) __fail('Cannot overwrite ' + target.fsName);
    if (!files[0].copy(target)) __fail('Cannot write ' + target.fsName);
  } finally {
    __removeTree(tmp);
  }
  return __exportResult(doc, ab, target, format, a);
}

function __exportResult(doc, ab, file, format, a) {
  var info = __artboardInfo(doc, ab);
  var factor = __has(a, 'width') ? a.width / info.w : (__has(a, 'height') ? a.height / info.h : __pick(a, 'scale', 1));
  var out = { path: file.fsName, format: format, artboard: ab, artboard_name: info.name };
  if (format !== 'svg') {
    out.width = Math.round(info.w * factor);
    out.height = Math.round(info.h * factor);
  }
  return out;
}

function ai_export(a) {
  var doc = __requireDoc();
  return __exportArtboard(doc, __abIndex(doc, a.artboard), a.path, a);
}

/* PNG preview whose longest side is max_size px. */
function ai_preview(a) {
  var doc = __requireDoc();
  var ab = __abIndex(doc, a.artboard);
  var info = __artboardInfo(doc, ab);
  var opts = { format: 'png', transparent: false };
  if (info.w >= info.h) opts.width = Math.min(a.max_size, Math.round(info.w * 4));
  else opts.height = Math.min(a.max_size, Math.round(info.h * 4));
  return __exportArtboard(doc, ab, a.path, opts);
}
