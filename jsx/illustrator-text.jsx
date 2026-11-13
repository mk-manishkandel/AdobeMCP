/*
 * illustrator-text.jsx: text ai_* tools.
 * ai_add_text, ai_set_text
 *
 * Point text: (x, y) is the TOP of the text frame; x is its left edge, centre
 * or right edge depending on align. Area text: (x, y, width, height) is the box.
 */

var __MIN_FONT_SIZE = 4;
var __AUTO_LEADING_RATIO = 1.2;
var __MAX_AREA_HEIGHT = 16000;
var __FIT_ITERATIONS = 12;
var __INDIC_RE = /[\u0900-\u0DFF]/;

function __font(name) {
  try {
    return app.textFonts.getByName(name);
  } catch (e) {
    __fail('Font not found: "' + name + '". Use ai_list_fonts to find the PostScript name (e.g. "Montserrat-Bold").');
  }
}

function __justification(align) {
  if (align === 'center') return Justification.CENTER;
  if (align === 'right') return Justification.RIGHT;
  if (align === 'justify') return Justification.FULLJUSTIFYLASTLINELEFT;
  return Justification.LEFT;
}

function __alignName(j) {
  if (j === Justification.CENTER || j === Justification.FULLJUSTIFYLASTLINECENTER) return 'center';
  if (j === Justification.RIGHT || j === Justification.FULLJUSTIFYLASTLINERIGHT) return 'right';
  if (j === Justification.LEFT) return 'left';
  return 'justify';
}

/* Illustrator paragraphs are separated by \r. */
function __normText(s) {
  return String(s).replace(/\r\n|\n/g, '\r');
}

function __stripBreaks(s) {
  return String(s).replace(/[\r\n\u0003]/g, '');
}

function __firstChar(tf) {
  var r = tf.textRange;
  return r.characters.length ? r.characters[0] : r;
}

/* Calls fn(); returns null instead of throwing. Some real-world frames (empty,
   threaded or legacy text) throw 'MRAP' on attribute reads. */
function __tryGet(fn) {
  try { return fn(); } catch (e) { return null; }
}

function __textInfo(tf) {
  var ca = __tryGet(function () { return __firstChar(tf).characterAttributes; });
  var out = { text: __truncate(tf.contents, 300) };
  out.kind = tf.kind === TextType.AREATEXT ? 'area' : (tf.kind === TextType.PATHTEXT ? 'path' : 'point');
  out.font = __tryGet(function () { return ca.textFont.name; });
  out.size = __tryGet(function () { return __round(ca.size); });
  out.color = __tryGet(function () { return __colorHex(ca.fillColor); });
  out.tracking = __tryGet(function () { return ca.tracking; });
  out.leading = __tryGet(function () { return ca.autoLeading ? 'auto' : __round(ca.leading); });
  out.align = __tryGet(function () { return __alignName(tf.textRange.paragraphAttributes.justification); });
  if (out.kind === 'area') out.overflow = __tryGet(function () { return __overflows(tf); });
  return out;
}

/* True when an area text frame cannot show all of its characters. */
function __overflows(tf) {
  if (tf.kind !== TextType.AREATEXT) return false;
  var visible = 0;
  for (var i = 0; i < tf.lines.length; i++) visible += __stripBreaks(tf.lines[i].contents).length;
  return visible < __stripBreaks(tf.contents).length;
}

/* Whole-frame character attributes. ALWAYS fetch fresh right before setting:
   a cached textRange.characterAttributes object is silently re-bound to the
   first character once characters[i] has been accessed (Illustrator quirk). */
function __allChars(tf) {
  return tf.textRange.characterAttributes;
}

function __allParas(tf) {
  return tf.textRange.paragraphAttributes;
}

/* Applies the style arguments that are present. */
function __styleText(tf, a) {
  if (__has(a, 'font')) __allChars(tf).textFont = __font(a.font);
  if (__has(a, 'size')) __allChars(tf).size = a.size;
  if (__has(a, 'color')) __allChars(tf).fillColor = __makeColor(a.color);
  if (__has(a, 'tracking')) __allChars(tf).tracking = a.tracking;
  if (__has(a, 'leading')) {
    __allChars(tf).autoLeading = false;
    __allChars(tf).leading = a.leading;
  }
  if (__has(a, 'all_caps')) __allChars(tf).capitalization = a.all_caps ? FontCapsOption.ALLCAPS : FontCapsOption.NORMALCAPS;
  if (__has(a, 'align')) __allParas(tf).justification = __justification(a.align);
  if (a.runs && a.runs.length) __applyRuns(tf, a.runs);
  if (__INDIC_RE.test(tf.contents)) {
    /* Devanagari and other Indic scripts need the World-Ready composer to shape correctly. */
    __allParas(tf).composerEngine = ComposerEngineType.optycaComposer;
  }
}

/* Character ranges [start, length] a run refers to, in tf.contents (line breaks count as one). */
function __runRanges(text, run) {
  var out = [];
  if (__has(run, 'match')) {
    var from = 0;
    var idx = text.indexOf(run.match, from);
    while (idx >= 0) {
      out.push([idx, run.match.length]);
      if (run.occurrence === 'first') break;
      from = idx + run.match.length;
      idx = text.indexOf(run.match, from);
    }
    if (!out.length) __fail('Text run "' + run.match + '" was not found in the text.');
    return out;
  }
  if (!__has(run, 'start')) __fail('Each run needs match, or start (and optionally length).');
  var len = __pick(run, 'length', text.length - run.start);
  if (run.start + len > text.length) __fail('Run ' + run.start + '+' + len + ' is past the end of the text (' + text.length + ' characters).');
  out.push([run.start, len]);
  return out;
}

/* Styles parts of a text frame (colour, font, size, tracking). Attributes are fetched fresh per character. */
function __applyRuns(tf, runs) {
  var text = tf.contents;
  for (var r = 0; r < runs.length; r++) {
    var run = runs[r];
    var font = __has(run, 'font') ? __font(run.font) : null;
    var color = __has(run, 'color') ? __makeColor(run.color) : null;
    var ranges = __runRanges(text, run);
    for (var k = 0; k < ranges.length; k++) {
      for (var i = ranges[k][0]; i < ranges[k][0] + ranges[k][1]; i++) {
        var ca = tf.characters[i].characterAttributes;
        if (font) ca.textFont = font;
        if (color) ca.fillColor = color;
        if (__has(run, 'size')) ca.size = run.size;
        if (__has(run, 'tracking')) ca.tracking = run.tracking;
      }
    }
  }
}

/* Anchor point of bounds for an alignment: top-left, top-centre or top-right. */
function __anchorOf(bounds, align) {
  var x = bounds[0];
  if (align === 'center') x = (bounds[0] + bounds[2]) / 2;
  if (align === 'right') x = bounds[2];
  return [x, bounds[1]];
}

function __centerOf(bounds) {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function __currentAlign(tf) {
  try { return __alignName(tf.textRange.paragraphAttributes.justification); } catch (e) { return 'left'; }
}

/* Positions point text so its frame top is at y and x is its left/centre/right edge. */
function __placePointText(doc, ab, tf, x, y, align) {
  var b = tf.geometricBounds;
  var target = __toAi(doc, ab, x, y);
  var anchor = __anchorOf(b, align);
  tf.translate(target[0] - anchor[0], target[1] - anchor[1]);
}

function __lineHeight(tf) {
  var ca = __firstChar(tf).characterAttributes;
  return ca.autoLeading ? ca.size * __AUTO_LEADING_RATIO : ca.leading;
}

function __makeAreaText(layer, doc, ab, a, height) {
  var p = __toAi(doc, ab, a.x, a.y);
  var rect = layer.pathItems.rectangle(p[1], p[0], a.width, height);
  var tf = layer.textFrames.areaText(rect);
  tf.contents = __normText(a.text);
  __styleText(tf, a);
  return tf;
}

/* Area text without an explicit height: grow until everything fits, then trim to the lines used. */
function __autoHeightAreaText(layer, doc, ab, a) {
  var tf = __makeAreaText(layer, doc, ab, a, __MAX_AREA_HEIGHT);
  if (__overflows(tf)) return tf; /* even the maximum is not enough; report overflow */
  var needed = Math.ceil(tf.lines.length * __lineHeight(tf) + __lineHeight(tf) * 0.35);
  for (var i = 0; i < __FIT_ITERATIONS; i++) {
    tf.remove();
    tf = __makeAreaText(layer, doc, ab, a, needed);
    if (!__overflows(tf)) return tf;
    needed = Math.ceil(needed + __lineHeight(tf) * 0.5);
  }
  return tf;
}

function ai_add_text(a) {
  var doc = __requireDoc();
  var ab = __abIndex(doc, a.artboard);
  var layer = __targetLayer(doc, a.layer);
  var tf;
  if (__has(a, 'width')) {
    tf = __has(a, 'height') ? __makeAreaText(layer, doc, ab, a, a.height) : __autoHeightAreaText(layer, doc, ab, a);
  } else {
    tf = layer.textFrames.pointText(__toAi(doc, ab, a.x, a.y));
    tf.contents = __normText(a.text);
    __styleText(tf, a);
    __placePointText(doc, ab, tf, a.x, a.y, a.align);
  }
  if (a.name) tf.name = a.name;
  return __itemInfo(doc, tf, ab, 0);
}

function __scaleTextSize(tf, factor, minSize) {
  var first = __firstChar(tf).characterAttributes;
  var current = first.size;
  var autoLeading = first.autoLeading;
  var leading = first.leading;
  var size = Math.max(minSize, Math.floor(current * factor * 100) / 100);
  if (!autoLeading) __allChars(tf).leading = leading * (size / current);
  __allChars(tf).size = size;
  return size;
}

function __shrinkToWidth(tf, maxWidth, minSize) {
  for (var i = 0; i < __FIT_ITERATIONS; i++) {
    var b = tf.geometricBounds;
    var w = b[2] - b[0];
    if (w <= maxWidth) return;
    if (__firstChar(tf).characterAttributes.size <= minSize) return;
    __scaleTextSize(tf, (maxWidth / w) * 0.995, minSize);
  }
}

function __shrinkToFit(tf, minSize) {
  for (var i = 0; i < __FIT_ITERATIONS * 2 && __overflows(tf); i++) {
    if (__firstChar(tf).characterAttributes.size <= minSize) return;
    __scaleTextSize(tf, 0.92, minSize);
  }
}

function ai_set_text(a) {
  var doc = __requireDoc();
  var tf = __findItem(doc, a.item);
  if (tf.typename !== 'TextFrame') __fail('Item "' + a.item + '" is a ' + __typeOf(tf) + ', not text.');
  var ab = __itemArtboard(doc, tf, a.artboard);
  var before = tf.geometricBounds;
  var align = __has(a, 'align') ? a.align : __currentAlign(tf);
  var anchor = a.keep_center ? __centerOf(before) : __anchorOf(before, align);

  if (__has(a, 'text')) tf.contents = __normText(a.text);
  __styleText(tf, a);
  var isPoint = tf.kind === TextType.POINTTEXT;
  if (isPoint && __has(a, 'max_width')) __shrinkToWidth(tf, a.max_width, a.min_size);
  if (!isPoint && a.shrink_to_fit) __shrinkToFit(tf, a.min_size);

  if (isPoint) {
    var after = tf.geometricBounds;
    var now = a.keep_center ? __centerOf(after) : __anchorOf(after, align);
    tf.translate(anchor[0] - now[0], anchor[1] - now[1]);
  }
  return __itemInfo(doc, tf, ab, 0);
}
