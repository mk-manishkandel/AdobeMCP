/*
 * photoshop-text.jsx: ps_add_text, ps_set_text.
 *
 * Point text: (x, y) is the TOP of the text; x is its left edge, centre or right
 * edge depending on align (same contract as ai_add_text). Paragraph text: give
 * width (and height) and (x, y) is the box's top-left corner.
 */

var __FIT_ITERATIONS = 12;
var __MIN_BOX_LINES = 2;

function __psJustify(align) {
  if (align === 'center') return Justification.CENTER;
  if (align === 'right') return Justification.RIGHT;
  if (align === 'justify') return Justification.LEFTJUSTIFIED;
  return Justification.LEFT;
}

function __psFont(name) {
  for (var i = 0; i < app.fonts.length; i++) if (app.fonts[i].postScriptName === name) return name;
  __fail('Font not found: "' + name + '". Use ps_list_fonts to find the PostScript name (e.g. "AvenirNext-Bold").');
}

/* Photoshop paragraphs are separated by \r. */
function __psText(s) {
  return String(s).replace(/\r\n|\n/g, '\r');
}

function __styleTextItem(t, a) {
  if (__has(a, 'font')) t.font = __psFont(a.font);
  if (__has(a, 'size')) t.size = new UnitValue(a.size, 'px');
  if (__has(a, 'color')) t.color = __solid(a.color);
  if (__has(a, 'tracking')) t.tracking = a.tracking;
  if (__has(a, 'leading')) {
    t.useAutoLeading = false;
    t.leading = new UnitValue(a.leading, 'px');
  }
  if (__has(a, 'all_caps')) t.capitalization = a.all_caps ? TextCase.ALLCAPS : TextCase.NORMAL;
  if (__has(a, 'align')) t.justification = __psJustify(a.align);
}

function __anchorX(box, align) {
  if (align === 'center') return box.x + box.w / 2;
  if (align === 'right') return box.x + box.w;
  return box.x;
}

/* Point text: puts the visible top at y and the left/centre/right edge at x. */
function __placePointText(layer, x, y, align) {
  var b = __box(layer);
  layer.translate(new UnitValue(x - __anchorX(b, align), 'px'), new UnitValue(y - b.y, 'px'));
}

function ps_add_text(a) {
  var doc = __requireDoc();
  return __step('Add text', function () {
    var layer = doc.artLayers.add();
    layer.kind = LayerKind.TEXT;
    var t = layer.textItem;
    if (__has(a, 'width')) {
      t.kind = TextType.PARAGRAPHTEXT;
      t.width = new UnitValue(a.width, 'px');
      t.height = new UnitValue(__pick(a, 'height', Math.max(a.size * __MIN_BOX_LINES, __px(doc.height) - a.y)), 'px');
      t.position = [new UnitValue(a.x, 'px'), new UnitValue(a.y, 'px')];
    } else {
      t.position = [new UnitValue(a.x, 'px'), new UnitValue(a.y + a.size, 'px')];
    }
    t.contents = __psText(a.text);
    __styleTextItem(t, a);
    if (!__has(a, 'width')) __placePointText(layer, a.x, a.y, a.align);
    if (a.name) layer.name = a.name;
    __putInGroup(doc, layer, a.group);
    return __layerInfo(layer);
  });
}

function __shrinkToWidth(layer, maxWidth, minSize) {
  var t = layer.textItem;
  for (var i = 0; i < __FIT_ITERATIONS; i++) {
    var b = __box(layer);
    var size = __px(t.size);
    if (b.w <= maxWidth || size <= minSize) return;
    t.size = new UnitValue(Math.max(minSize, Math.floor(size * (maxWidth / b.w) * 99.5) / 100), 'px');
  }
}

function ps_set_text(a) {
  var doc = __requireDoc();
  return __step('Edit text', function () {
    var layer = __findLayer(doc, a.layer);
    if (__kindOf(layer) !== 'text') __fail('Layer "' + a.layer + '" is ' + __kindOf(layer) + ', not text.');
    var t = layer.textItem;
    var point = t.kind === TextType.POINTTEXT;
    var align = __has(a, 'align') ? a.align : 'left';
    if (!__has(a, 'align')) {
      try {
        var j = t.justification;
        align = j === Justification.CENTER ? 'center' : (j === Justification.RIGHT ? 'right' : 'left');
      } catch (e) { align = 'left'; }
    }
    var before = __box(layer);
    var name = layer.name;
    if (__has(a, 'text')) t.contents = __psText(a.text);
    /* A layer named like its text counts as auto-named and would follow the new text. */
    if (layer.name !== name) layer.name = name;
    __styleTextItem(t, a);
    if (point && __has(a, 'max_width')) __shrinkToWidth(layer, a.max_width, a.min_size);
    if (point) {
      var after = __box(layer);
      if (a.keep_center) {
        layer.translate(new UnitValue(before.x + before.w / 2 - (after.x + after.w / 2), 'px'),
          new UnitValue(before.y + before.h / 2 - (after.y + after.h / 2), 'px'));
      } else {
        layer.translate(new UnitValue(__anchorX(before, align) - __anchorX(after, align), 'px'), new UnitValue(before.y - after.y, 'px'));
      }
    }
    return __layerInfo(layer);
  });
}
