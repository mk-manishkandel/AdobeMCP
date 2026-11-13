/*
 * illustrator-items.jsx: item ai_* tools.
 * ai_add_shape, ai_place_image, ai_set_item, ai_align
 */

/* ---------- shapes ---------- */

function __makeShape(layer, doc, ab, a) {
  var p = __toAi(doc, ab, a.x, a.y);
  var r = Math.min(a.w, a.h) / 2;
  switch (a.shape) {
    case 'rectangle': return layer.pathItems.rectangle(p[1], p[0], a.w, a.h);
    case 'rounded_rectangle': return layer.pathItems.roundedRectangle(p[1], p[0], a.w, a.h, a.radius, a.radius);
    case 'ellipse': return layer.pathItems.ellipse(p[1], p[0], a.w, a.h);
    case 'polygon': return layer.pathItems.polygon(p[0] + a.w / 2, p[1] - a.h / 2, r, a.sides);
    case 'star': return layer.pathItems.star(p[0] + a.w / 2, p[1] - a.h / 2, r, r * a.inner_ratio, a.points);
    default: __fail('Unknown shape: ' + a.shape);
  }
}

function __makeLine(layer, doc, ab, a) {
  var line = layer.pathItems.add();
  line.setEntirePath([__toAi(doc, ab, a.x, a.y), __toAi(doc, ab, a.x2, a.y2)]);
  line.filled = false;
  line.stroked = true;
  line.strokeColor = __makeColor(__pick(a, 'stroke', '#000000'));
  line.strokeWidth = __pick(a, 'stroke_width', 1);
  return line;
}

function ai_add_shape(a) {
  var doc = __requireDoc();
  var ab = __abIndex(doc, a.artboard);
  var layer = __targetLayer(doc, a.layer);
  var item;
  if (a.shape === 'line') {
    if (!__has(a, 'x2') || !__has(a, 'y2')) __fail('shape "line" needs x, y (start) and x2, y2 (end).');
    item = __makeLine(layer, doc, ab, a);
  } else {
    if (!__has(a, 'w') || !__has(a, 'h')) __fail('shape "' + a.shape + '" needs w and h.');
    item = __makeShape(layer, doc, ab, a);
    if (a.shape === 'polygon' || a.shape === 'star') {
      __resizeTo(item, a.w, a.h);
      __moveTo(doc, ab, item, a.x, a.y);
    }
    __applyPaint(item, { fill: __pick(a, 'fill', '#CCCCCC'), stroke: __pick(a, 'stroke', 'none') });
    if (__has(a, 'stroke_width')) __applyPaint(item, { stroke_width: a.stroke_width });
  }
  item.opacity = a.opacity;
  if (a.name) item.name = a.name;
  return __itemInfo(doc, item, ab, 0);
}

/* ---------- images ---------- */

/* Offset of content of size (w, h) inside a box, for a focus keyword. */
function __focusOffset(boxW, boxH, w, h, focus) {
  var dx = (boxW - w) / 2;
  var dy = (boxH - h) / 2;
  if (focus === 'top') dy = 0;
  if (focus === 'bottom') dy = boxH - h;
  if (focus === 'left') dx = 0;
  if (focus === 'right') dx = boxW - w;
  return [dx, dy];
}

/* Scales the placed item for the mode and positions it in the box. */
function __fitIntoBox(doc, ab, item, a) {
  var b = item.geometricBounds;
  var iw = b[2] - b[0];
  var ih = b[1] - b[3];
  var w = iw;
  var h = ih;
  if (a.mode === 'stretch') {
    w = a.w;
    h = a.h;
  } else if (a.mode === 'fit' || a.mode === 'fill') {
    var s = a.mode === 'fit' ? Math.min(a.w / iw, a.h / ih) : Math.max(a.w / iw, a.h / ih);
    w = iw * s;
    h = ih * s;
  }
  if (w !== iw || h !== ih) __resizeTo(item, w, h);
  var off = a.mode === 'none' ? [0, 0] : __focusOffset(a.w, a.h, w, h, a.focus);
  __moveTo(doc, ab, item, a.x + off[0], a.y + off[1]);
  return { w: iw, h: ih };
}

function __clipToBox(doc, ab, layer, item, a) {
  var group = layer.groupItems.add();
  item.move(group, ElementPlacement.PLACEATBEGINNING);
  var p = __toAi(doc, ab, a.x, a.y);
  var clip = group.pathItems.rectangle(p[1], p[0], a.w, a.h);
  clip.clipping = true;
  group.clipped = true;
  return group;
}

/* Embeds a placed image and returns the raster item that replaced it. */
function __embed(container, placed) {
  placed.embed();
  var top = container.pageItems[0];
  if (top.typename === 'RasterItem') return top;
  for (var i = 0; i < container.pageItems.length; i++) {
    if (container.pageItems[i].typename === 'RasterItem') return container.pageItems[i];
  }
  __fail('Embedding succeeded but the embedded image could not be located.');
}

/* Linked placement (raster, PSD, PDF, AI). SVG cannot be linked: see ai_place_image. */
function __placeLinked(layer, file, path) {
  var placed = layer.placedItems.add();
  try {
    placed.file = file;
  } catch (e) {
    placed.remove();
    __fail('Illustrator cannot place "' + path + '" (' + e.message + '). Use jpg, png, psd, tif, pdf, ai or svg.');
  }
  return placed;
}

function ai_place_image(a) {
  var doc = __requireDoc();
  var ab = __abIndex(doc, a.artboard);
  var layer = __targetLayer(doc, a.layer);
  var file = __requireFile(a.path, 'Image');
  if (a.mode !== 'none' && (!__has(a, 'w') || !__has(a, 'h'))) __fail('mode "' + a.mode + '" needs a box: x, y, w, h.');

  var isSvg = /\.svgz?$/i.test(a.path);
  var placed = isSvg ? layer.groupItems.createFromFile(file) : __placeLinked(layer, file, a.path);
  var source = __fitIntoBox(doc, ab, placed, a);
  var result = placed;
  var embed = a.embed && !isSvg; /* SVG is imported as editable vector art, always embedded */
  if (a.mode === 'fill') {
    result = __clipToBox(doc, ab, layer, placed, a);
    if (embed) __embed(result, placed);
  } else if (embed) {
    result = __embed(layer, placed);
  }
  if (a.name) result.name = a.name;
  var info = __itemInfo(doc, result, ab, 0);
  info.source_size = { w: __round(source.w), h: __round(source.h) };
  return info;
}

/* ---------- editing ---------- */

var __ARRANGE = {
  bring_to_front: 'BRINGTOFRONT', bring_forward: 'BRINGFORWARD',
  send_backward: 'SENDBACKWARD', send_to_back: 'SENDTOBACK'
};

/* Duplicates item, optionally onto another artboard at the same relative position. */
function __duplicate(doc, item, fromAb, toAb) {
  var copy = item.duplicate();
  if (toAb !== null && toAb !== undefined) {
    var box = __boxOf(doc, fromAb, __bounds(item));
    __moveTo(doc, __abIndex(doc, toAb), copy, box.x, box.y);
  }
  return copy;
}

function __applyResize(item, a) {
  if (!__has(a, 'w') && !__has(a, 'h')) return;
  var b = __bounds(item);
  var cw = b[2] - b[0];
  var ch = b[1] - b[3];
  var w = __pick(a, 'w', null);
  var h = __pick(a, 'h', null);
  if (w === null) w = a.keep_aspect ? cw * (h / ch) : cw;
  if (h === null) h = a.keep_aspect ? ch * (w / cw) : ch;
  __resizeTo(item, w, h);
}

function __applyBasics(item, a) {
  if (__has(a, 'name')) item.name = a.name;
  if (__has(a, 'opacity')) item.opacity = a.opacity;
  if (__has(a, 'hidden')) item.hidden = a.hidden;
  if (__has(a, 'fill') || __has(a, 'stroke') || __has(a, 'stroke_width')) {
    if (item.typename === 'TextFrame') {
      if (__has(a, 'fill')) item.textRange.characterAttributes.fillColor = __makeColor(a.fill);
    } else if (item.typename === 'PathItem') {
      __applyPaint(item, a);
    } else if (item.typename === 'CompoundPathItem') {
      for (var i = 0; i < item.pathItems.length; i++) __applyPaint(item.pathItems[i], a);
    } else {
      __fail('fill/stroke can only be set on text, paths and compound paths (item is ' + __typeOf(item) + ').');
    }
  }
}

function __applyLayer(doc, item, layerName) {
  var layer = __targetLayer(doc, layerName);
  item.move(layer, ElementPlacement.PLACEATBEGINNING);
}

function __applyEdits(doc, item, ab, a) {
  __applyBasics(item, a);
  __applyResize(item, a);
  if (__has(a, 'rotate') && a.rotate !== 0) item.rotate(a.rotate);
  if (__has(a, 'x') || __has(a, 'y')) {
    var box = __boxOf(doc, ab, __bounds(item));
    __moveTo(doc, ab, item, __pick(a, 'x', box.x), __pick(a, 'y', box.y));
  }
  if (__has(a, 'layer')) __applyLayer(doc, item, a.layer);
  if (__has(a, 'arrange')) item.zOrder(ZOrderMethod[__ARRANGE[a.arrange]]);
}

/* Locked items and items on locked layers are unlocked for the edit, then re-locked
   (unless `locked` says otherwise). */
function ai_set_item(a) {
  var doc = __requireDoc();
  var item = __findItem(doc, a.item);
  var ab = __itemArtboard(doc, item, a.artboard);
  var layer = item.layer;
  var layerWasLocked = layer.locked;
  layer.locked = false;
  try {
    if (a['delete']) {
      var gone = { deleted: item.uuid, name: item.name };
      item.locked = false;
      item.remove();
      return gone;
    }
    var wasLocked = item.locked;
    item.locked = false;
    if (a.duplicate) {
      item = __duplicate(doc, item, ab, __pick(a, 'to_artboard', null));
      if (__has(a, 'to_artboard')) ab = a.to_artboard;
    }
    __applyEdits(doc, item, ab, a);
    item.locked = __has(a, 'locked') ? a.locked : wasLocked;
    return __itemInfo(doc, item, ab, 0);
  } finally {
    layer.locked = layerWasLocked;
  }
}

/* ---------- alignment ---------- */

function __alignedPosition(box, target, a) {
  var x = box.x;
  var y = box.y;
  var m = a.margin;
  if (a.horizontal === 'left') x = target.x + m;
  if (a.horizontal === 'center') x = target.x + (target.w - box.w) / 2;
  if (a.horizontal === 'right') x = target.x + target.w - box.w - m;
  if (a.vertical === 'top') y = target.y + m;
  if (a.vertical === 'center') y = target.y + (target.h - box.h) / 2;
  if (a.vertical === 'bottom') y = target.y + target.h - box.h - m;
  return { x: x, y: y };
}

function __unionBounds(items) {
  var u = __bounds(items[0]);
  var out = [u[0], u[1], u[2], u[3]];
  for (var i = 1; i < items.length; i++) {
    var b = __bounds(items[i]);
    out = [Math.min(out[0], b[0]), Math.max(out[1], b[1]), Math.max(out[2], b[2]), Math.min(out[3], b[3])];
  }
  return out;
}

function ai_align(a) {
  var doc = __requireDoc();
  if (!a.horizontal && !a.vertical) __fail('Give horizontal and/or vertical alignment.');
  var items = [];
  for (var i = 0; i < a.items.length; i++) items.push(__findItem(doc, a.items[i]));
  var ab = __itemArtboard(doc, items[0], a.artboard);
  var r = __abRect(doc, ab);
  var target = { x: 0, y: 0, w: r[2] - r[0], h: r[1] - r[3] };

  if (a.as_group) {
    var gbox = __boxOf(doc, ab, __unionBounds(items));
    var gpos = __alignedPosition(gbox, target, a);
    for (var g = 0; g < items.length; g++) items[g].translate(gpos.x - gbox.x, -(gpos.y - gbox.y));
  } else {
    for (var j = 0; j < items.length; j++) {
      var box = __boxOf(doc, ab, __bounds(items[j]));
      var pos = __alignedPosition(box, target, a);
      __moveTo(doc, ab, items[j], pos.x, pos.y);
    }
  }
  var out = [];
  for (var k = 0; k < items.length; k++) out.push(__itemInfo(doc, items[k], ab, 0));
  return { artboard: ab, items: out };
}
