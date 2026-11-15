/*
 * photoshop-layers.jsx: layer ps_* tools.
 * ps_add_shape, ps_place_image, ps_set_layer, ps_group, ps_align
 */

/* ---------- shapes (vector shape layers) ---------- */

function __makeShapeLayer(a) {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putClass(__sid('contentLayer'));
  d.putReference(__cid('null'), r);
  var using = new ActionDescriptor();
  var fill = new ActionDescriptor();
  fill.putObject(__cid('Clr '), __cid('RGBC'), __amColor(a.fill));
  using.putObject(__cid('Type'), __sid('solidColorLayer'), fill);
  var shape = new ActionDescriptor();
  shape.putUnitDouble(__cid('Top '), __cid('#Pxl'), a.y);
  shape.putUnitDouble(__cid('Left'), __cid('#Pxl'), a.x);
  shape.putUnitDouble(__cid('Btom'), __cid('#Pxl'), a.y + a.h);
  shape.putUnitDouble(__cid('Rght'), __cid('#Pxl'), a.x + a.w);
  if (a.shape === 'rounded_rectangle') shape.putUnitDouble(__cid('Rds '), __cid('#Pxl'), a.radius);
  using.putObject(__cid('Shp '), a.shape === 'ellipse' ? __cid('Elps') : __cid('Rctn'), shape);
  d.putObject(__cid('Usng'), __sid('contentLayer'), using);
  executeAction(__cid('Mk  '), d, DialogModes.NO);
}

function ps_add_shape(a) {
  var doc = __requireDoc();
  return __step('Add ' + a.shape, function () {
    __makeShapeLayer(a);
    var layer = doc.activeLayer;
    if (a.name) layer.name = a.name;
    layer.opacity = a.opacity;
    __putInGroup(doc, layer, a.group);
    return __layerInfo(layer);
  });
}

/* ---------- images ---------- */

function __placeEmbedded(path) {
  var f = new File(path);
  if (!f.exists) __fail('File not found: ' + path);
  var d = new ActionDescriptor();
  d.putPath(__cid('null'), f);
  d.putEnumerated(__cid('FTcs'), __cid('QCSt'), __cid('Qcsa'));
  executeAction(__cid('Plc '), d, DialogModes.NO);
}

function __workPathFromSelection() {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putClass(__cid('Path'));
  d.putReference(__cid('null'), r);
  var from = new ActionReference();
  from.putProperty(__cid('csel'), __cid('fsel'));
  d.putReference(__cid('From'), from);
  d.putUnitDouble(__cid('Tlrn'), __cid('#Pxl'), 0.5);
  executeAction(__cid('Mk  '), d, DialogModes.NO);
}

function __vectorMaskFromWorkPath() {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putClass(__cid('Path'));
  d.putReference(__cid('null'), r);
  var at = new ActionReference();
  at.putEnumerated(__cid('Path'), __cid('Path'), __sid('vectorMask'));
  d.putReference(__cid('At  '), at);
  var using = new ActionReference();
  using.putEnumerated(__cid('Path'), __cid('Ordn'), __cid('Trgt'));
  d.putReference(__cid('Usng'), using);
  executeAction(__cid('Mk  '), d, DialogModes.NO);
}

/* Vector mask that shows only the box (x, y, w, h). A vector mask (not a pixel
   mask) keeps the layer's pixel mask free for ps_cutout. */
function __maskToBox(doc, box) {
  doc.selection.select([[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]]);
  __workPathFromSelection();
  __vectorMaskFromWorkPath();
  for (var i = doc.pathItems.length - 1; i >= 0; i--) if (doc.pathItems[i].kind === PathKind.WORKPATH) doc.pathItems[i].remove();
  doc.selection.deselect();
}

/* Scale factors (%) for a content box of cw x ch placed into box w x h. */
function __fitScale(mode, cw, ch, w, h) {
  if (mode === 'none') return [100, 100];
  if (mode === 'stretch') return [100 * w / cw, 100 * h / ch];
  var s = mode === 'fill' ? Math.max(w / cw, h / ch) : Math.min(w / cw, h / ch);
  return [100 * s, 100 * s];
}

function ps_place_image(a) {
  var doc = __requireDoc();
  return __step('Place image', function () {
    __placeEmbedded(a.path);
    var layer = doc.activeLayer;
    var box = { x: a.x, y: a.y, w: __pick(a, 'w', 0), h: __pick(a, 'h', 0) };
    if (a.mode !== 'none' && (!box.w || !box.h)) __fail('mode "' + a.mode + '" needs w and h (the box to place into).');
    var c = __box(layer);
    var scale = __fitScale(a.mode, c.w, c.h, box.w, box.h);
    layer.resize(scale[0], scale[1], AnchorPosition.TOPLEFT);
    c = __box(layer);
    if (a.mode === 'none') {
      __moveLayerTo(layer, a.x, a.y);
    } else {
      __moveLayerTo(layer, box.x + (box.w - c.w) / 2, box.y + (box.h - c.h) / 2);
    }
    if (a.mode === 'fill') __maskToBox(doc, box);
    if (a.name) layer.name = a.name;
    __putInGroup(doc, layer, a.group);
    var info = __layerInfo(layer);
    if (a.mode === 'fill') {
      info.visible_box = box;
      info.note = 'The image is cropped to the box by a vector mask; move or resize the layer to reframe it.';
    }
    return info;
  });
}

/* ---------- editing ---------- */

var __ARRANGE = { front: 'Frnt', back: 'Back', forward: 'Nxt ', backward: 'Prvs' };

function __arrange(how) {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putEnumerated(__cid('Lyr '), __cid('Ordn'), __cid('Trgt'));
  d.putReference(__cid('null'), r);
  var to = new ActionReference();
  to.putEnumerated(__cid('Lyr '), __cid('Ordn'), __cid(__ARRANGE[how]));
  d.putReference(__cid('T   '), to);
  executeAction(__cid('move'), d, DialogModes.NO);
}

/* New colour for a shape / solid-fill layer. */
function __setFillColor(layer, hex) {
  var kind = __kindOf(layer);
  if (kind !== 'shape' && kind !== 'fill') __fail('color works on shape and solid-fill layers (this is ' + kind + '); use ps_layer_style color_overlay or ps_set_text.');
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putEnumerated(__sid('contentLayer'), __cid('Ordn'), __cid('Trgt'));
  d.putReference(__cid('null'), r);
  var fill = new ActionDescriptor();
  fill.putObject(__cid('Clr '), __cid('RGBC'), __amColor(hex));
  d.putObject(__cid('T   '), __sid('solidColorLayer'), fill);
  executeAction(__cid('setd'), d, DialogModes.NO);
}

function __resizeLayer(layer, a) {
  var b = __box(layer);
  if (__has(a, 'scale')) {
    layer.resize(a.scale, a.scale, AnchorPosition.TOPLEFT);
    return;
  }
  if (!__has(a, 'w') && !__has(a, 'h')) return;
  if (!b.w || !b.h) __fail('This layer is empty, so it cannot be resized.');
  var sx = __has(a, 'w') ? 100 * a.w / b.w : 100 * a.h / b.h;
  var sy = __has(a, 'h') ? 100 * a.h / b.h : sx;
  layer.resize(sx, sy, AnchorPosition.TOPLEFT);
  __moveLayerTo(layer, b.x, b.y);
}

function __editLayer(doc, layer, a) {
  var moves = __has(a, 'x') || __has(a, 'y') || __has(a, 'w') || __has(a, 'h') || __has(a, 'scale') || __has(a, 'rotate');
  if (moves) __unlockBackground(layer);
  if (__has(a, 'name')) layer.name = a.name;
  if (__has(a, 'color')) __setFillColor(layer, a.color);
  __resizeLayer(layer, a);
  if (__has(a, 'rotate') && a.rotate !== 0) layer.rotate(a.rotate, AnchorPosition.MIDDLECENTER);
  if (__has(a, 'x') || __has(a, 'y')) {
    var b = __box(layer);
    __moveLayerTo(layer, __pick(a, 'x', b.x), __pick(a, 'y', b.y));
  }
  if (__has(a, 'opacity')) layer.opacity = a.opacity;
  if (__has(a, 'fill_opacity')) layer.fillOpacity = a.fill_opacity;
  if (__has(a, 'blend_mode')) layer.blendMode = BlendMode[__BLEND[a.blend_mode]];
  if (__has(a, 'visible')) layer.visible = a.visible;
  if (__has(a, 'arrange')) __arrange(a.arrange);
  if (__has(a, 'group')) layer.move(__targetGroup(doc, a.group), ElementPlacement.INSIDE);
  if (__has(a, 'clip')) layer.grouped = a.clip;
  if (__has(a, 'locked')) layer.allLocked = a.locked;
}

function ps_set_layer(a) {
  var doc = __requireDoc();
  return __step('Edit layer', function () {
    var layer = __findLayer(doc, a.layer);
    if (a['delete']) {
      var gone = { deleted: layer.id, name: layer.name };
      layer.allLocked = false;
      layer.remove();
      return gone;
    }
    if (a.duplicate) {
      layer = layer.duplicate();
      doc.activeLayer = layer;
    }
    var wasLocked = layer.typename === 'ArtLayer' && layer.allLocked && !__has(a, 'locked');
    if (wasLocked) layer.allLocked = false;
    __editLayer(doc, layer, a);
    if (wasLocked) layer.allLocked = true;
    return __layerInfo(layer);
  });
}

/* ---------- groups ---------- */

function __selectLayers(layers) {
  for (var i = 0; i < layers.length; i++) __selectLayerId(layers[i].id, i > 0);
}

function ps_group(a) {
  var doc = __requireDoc();
  return __step(a.action === 'ungroup' ? 'Ungroup' : 'Group', function () {
    if (a.action === 'ungroup') {
      if (!__has(a, 'layer')) __fail('action "ungroup" needs layer: the group to take apart.');
      var g = __findLayer(doc, a.layer);
      if (g.typename !== 'LayerSet') __fail('Layer "' + a.layer + '" is not a group.');
      var children = [];
      for (var i = 0; i < g.layers.length; i++) children.push(g.layers[i]);
      var d0 = new ActionDescriptor();
      var r0 = new ActionReference();
      r0.putEnumerated(__cid('Lyr '), __cid('Ordn'), __cid('Trgt'));
      d0.putReference(__cid('null'), r0);
      executeAction(__sid('ungroupLayersEvent'), d0, DialogModes.NO);
      var out = [];
      for (var j = 0; j < children.length; j++) out.push(__layerInfo(children[j]));
      return { ungrouped: out };
    }
    if (!a.layers || !a.layers.length) __fail('action "group" needs layers.');
    __selectLayers(__findLayers(doc, a.layers));
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putClass(__sid('layerSection'));
    d.putReference(__cid('null'), r);
    var from = new ActionReference();
    from.putEnumerated(__cid('Lyr '), __cid('Ordn'), __cid('Trgt'));
    d.putReference(__cid('From'), from);
    executeAction(__cid('Mk  '), d, DialogModes.NO);
    var group = doc.activeLayer;
    if (a.name) group.name = a.name;
    return __layerInfo(group);
  });
}

/* ---------- alignment ---------- */

function __alignedPosition(box, area, a) {
  var x = box.x;
  var y = box.y;
  var m = a.margin;
  if (a.horizontal === 'left') x = area.x + m;
  if (a.horizontal === 'center') x = area.x + (area.w - box.w) / 2;
  if (a.horizontal === 'right') x = area.x + area.w - box.w - m;
  if (a.vertical === 'top') y = area.y + m;
  if (a.vertical === 'middle') y = area.y + (area.h - box.h) / 2;
  if (a.vertical === 'bottom') y = area.y + area.h - box.h - m;
  return { x: x, y: y };
}

function __unionOf(boxes) {
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (var i = 0; i < boxes.length; i++) {
    x1 = Math.min(x1, boxes[i].x); y1 = Math.min(y1, boxes[i].y);
    x2 = Math.max(x2, boxes[i].x + boxes[i].w); y2 = Math.max(y2, boxes[i].y + boxes[i].h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function ps_align(a) {
  var doc = __requireDoc();
  if (!a.horizontal && !a.vertical) __fail('Give horizontal and/or vertical.');
  return __step('Align', function () {
    var layers = __findLayers(doc, a.layers);
    var canvas = { x: 0, y: 0, w: __px(doc.width), h: __px(doc.height) };
    var boxes = [];
    for (var i = 0; i < layers.length; i++) {
      __unlockBackground(layers[i]);
      boxes.push(__box(layers[i]));
    }
    var out = [];
    if (a.as_group) {
      var u = __unionOf(boxes);
      var p = __alignedPosition(u, canvas, a);
      for (var j = 0; j < layers.length; j++) layers[j].translate(new UnitValue(p.x - u.x, 'px'), new UnitValue(p.y - u.y, 'px'));
    } else {
      for (var k = 0; k < layers.length; k++) {
        var q = __alignedPosition(boxes[k], canvas, a);
        __moveLayerTo(layers[k], q.x, q.y);
      }
    }
    for (var n = 0; n < layers.length; n++) out.push(__layerInfo(layers[n]));
    return { layers: out };
  });
}
