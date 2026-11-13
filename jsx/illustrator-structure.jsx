/*
 * illustrator-structure.jsx: ai_group (group / ungroup / clipping mask),
 * ai_pathfinder and ai_layer.
 *
 * Pathfinder has no DOM API. It runs Illustrator's own Effect > Pathfinder
 * menu commands on a temporary group and expands the result, which needs the
 * group to be selected (the user's selection is cleared afterwards).
 */

var __PATHFINDER_COMMANDS = {
  unite: 'Live Pathfinder Add',
  minus_front: 'Live Pathfinder Subtract',
  minus_back: 'Live Pathfinder Minus Back',
  intersect: 'Live Pathfinder Intersect',
  exclude: 'Live Pathfinder Exclude',
  divide: 'Live Pathfinder Divide'
};

function __findItems(doc, refs) {
  var out = [];
  for (var i = 0; i < refs.length; i++) {
    var item = __findItem(doc, refs[i]);
    for (var j = 0; j < out.length; j++) if (out[j] === item) __fail('Item "' + refs[i] + '" is listed twice.');
    out.push(item);
  }
  return out;
}

/* Items ordered front-most first (higher absoluteZOrderPosition is further front). */
function __frontToBack(items) {
  var sorted = items.slice(0);
  sorted.sort(function (p, q) { return q.absoluteZOrderPosition - p.absoluteZOrderPosition; });
  return sorted;
}

/* Puts items in a new group where the front-most of them was, keeping their stacking order. */
function __groupItems(items) {
  var ordered = __frontToBack(items);
  var front = ordered[0];
  var group = front.parent.groupItems.add();
  group.move(front, ElementPlacement.PLACEBEFORE);
  for (var i = 0; i < ordered.length; i++) {
    ordered[i].locked = false;
    ordered[i].move(group, ElementPlacement.PLACEATEND);
  }
  return group;
}

/* Moves a group's children out to its parent at the group's position, then removes the group. */
function __ungroupItem(group) {
  var children = [];
  for (var i = 0; i < group.pageItems.length; i++) children.push(group.pageItems[i]);
  for (var j = 0; j < children.length; j++) children[j].move(group, ElementPlacement.PLACEBEFORE);
  group.remove();
  return children;
}

function __clipMask(group) {
  for (var i = 0; i < group.pathItems.length; i++) if (group.pathItems[i].clipping) return group.pathItems[i];
  for (var j = 0; j < group.compoundPathItems.length; j++) {
    var cp = group.compoundPathItems[j];
    if (cp.pathItems.length && cp.pathItems[0].clipping) return cp;
  }
  return null;
}

function __makeClip(doc, a) {
  if (!__has(a, 'mask')) __fail('action "clip" needs mask: the shape (or text) whose outline shows the items.');
  var mask = __findItem(doc, a.mask);
  var t = mask.typename;
  if (t !== 'PathItem' && t !== 'CompoundPathItem' && t !== 'TextFrame') {
    __fail('The mask must be a path, compound path or text (it is ' + __typeOf(mask) + ').');
  }
  var items = __findItems(doc, a.items);
  for (var i = 0; i < items.length; i++) if (items[i] === mask) __fail('Do not list the mask in items; pass it as mask.');
  var group = __groupItems(items.concat([mask]));
  mask.move(group, ElementPlacement.PLACEATBEGINNING);
  group.clipped = true;
  return group;
}

/* Ungroups; for a clipping group the mask shape is deleted (it has no paint of its own). */
function __releaseGroup(doc, a) {
  var group = __findItem(doc, a.item);
  if (group.typename !== 'GroupItem') __fail('Item "' + a.item + '" is a ' + __typeOf(group) + ', not a group.');
  var removedMask = null;
  if (group.clipped) {
    var mask = __clipMask(group);
    group.clipped = false;
    if (mask) {
      removedMask = mask.uuid;
      mask.remove();
    }
  }
  var children = __ungroupItem(group);
  var out = [];
  for (var i = 0; i < children.length; i++) out.push(__itemInfo(doc, children[i], null, 0));
  return { ungrouped: out, removed_mask: removedMask };
}

function ai_group(a) {
  var doc = __requireDoc();
  if (a.action === 'ungroup') {
    if (!__has(a, 'item')) __fail('action "ungroup" needs item: the group to take apart.');
    return __releaseGroup(doc, a);
  }
  if (!a.items || !a.items.length) __fail('action "' + a.action + '" needs items.');
  var group = a.action === 'clip' ? __makeClip(doc, a) : __groupItems(__findItems(doc, a.items));
  if (a.name) group.name = a.name;
  return __itemInfo(doc, group, null, 0);
}

/* After expanding, a single result comes back wrapped in a group: unwrap it. */
function __unwrapSingle(item) {
  if (item.typename === 'GroupItem' && item.pageItems.length === 1 && !item.clipped) {
    var only = item.pageItems[0];
    only.move(item, ElementPlacement.PLACEBEFORE);
    item.remove();
    return only;
  }
  return item;
}

function ai_pathfinder(a) {
  var doc = __requireDoc();
  var items = __findItems(doc, a.items);
  if (items.length < 2) __fail('Pathfinder needs at least 2 items.');
  var group = __groupItems(items);
  doc.selection = null;
  group.selected = true;
  app.executeMenuCommand(__PATHFINDER_COMMANDS[a.operation]);
  app.executeMenuCommand('expandStyle');
  if (!doc.selection || doc.selection.length !== 1) __fail('Pathfinder "' + a.operation + '" did not produce a single result.');
  var result = __unwrapSingle(doc.selection[0]);
  doc.selection = null;
  if (a.name) result.name = a.name;
  return __itemInfo(doc, result, null, 0);
}

/* ---------- layers ---------- */

function __requireLayer(doc, name) {
  var layer = __findLayer(doc, name);
  if (!layer) __fail('Layer not found: "' + name + '". Layers are listed by ai_layer with action "list".');
  return layer;
}

function __layerPosition(doc, layer, position) {
  if (position === 'top') layer.move(doc, ElementPlacement.PLACEATBEGINNING);
  if (position === 'bottom') layer.move(doc, ElementPlacement.PLACEATEND);
}

function __layerProps(doc, layer, a) {
  if (__has(a, 'new_name')) {
    if (__findLayer(doc, a.new_name)) __fail('A layer named "' + a.new_name + '" already exists.');
    layer.name = a.new_name;
  }
  if (__has(a, 'visible')) layer.visible = a.visible;
  if (__has(a, 'locked')) layer.locked = a.locked;
  if (__has(a, 'position')) __layerPosition(doc, layer, a.position);
}

function __deleteLayer(doc, a) {
  var layer = __requireLayer(doc, a.name);
  if (doc.layers.length === 1) __fail('A document needs at least one layer.');
  var count = layer.pageItems.length;
  if (count > 0 && !a.delete_items) {
    __fail('Layer "' + a.name + '" has ' + count + ' items. Pass delete_items: true to delete them with it.');
  }
  layer.locked = false;
  layer.remove();
  return { deleted: a.name, items_deleted: count, layers: __layerList(doc) };
}

function ai_layer(a) {
  var doc = __requireDoc();
  if (a.action === 'list') return { layers: __layerList(doc) };
  if (!__has(a, 'name')) __fail('action "' + a.action + '" needs name.');
  if (a.action === 'delete') return __deleteLayer(doc, a);
  var layer;
  if (a.action === 'add') {
    if (__findLayer(doc, a.name)) __fail('A layer named "' + a.name + '" already exists.');
    layer = doc.layers.add();
    layer.name = a.name;
  } else {
    layer = __requireLayer(doc, a.name);
  }
  __layerProps(doc, layer, a);
  return { layer: layer.name, layers: __layerList(doc) };
}
