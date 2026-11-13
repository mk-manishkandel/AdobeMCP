/*
 * illustrator.jsx: Illustrator runtime and ai_* tool functions.
 * Loaded after common.jsx on every call. Each ai_xxx(args) receives the
 * validated arguments object and returns a plain JSON-able value.
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

function __docSummary(doc, index) {
  var artboards = [];
  for (var i = 0; i < doc.artboards.length; i++) artboards.push(__artboardInfo(doc, i));
  return {
    index: index,
    name: doc.name,
    active: index === 0,
    path: __docPath(doc),
    saved: doc.saved,
    colorSpace: __colorSpaceName(doc),
    activeArtboard: doc.artboards.getActiveArtboardIndex(),
    artboards: artboards
  };
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
