/*
 * illustrator-library.jsx: document libraries. ai_swatch (colour, gradient and
 * pattern swatches), ai_symbol (reusable artwork) and ai_graphic_style.
 * Swatches are used as paint with fill/stroke "swatch:<name>".
 */

var __LIST_LIMIT_DEFAULT = 100;

function __swatchKind(color) {
  switch (color.typename) {
    case 'GradientColor': return 'gradient';
    case 'PatternColor': return 'pattern';
    case 'SpotColor': return 'spot';
    case 'NoColor': return 'none';
    default: return 'color';
  }
}

/* Names in a collection that contain query (case-insensitive), up to limit, with an info function. */
function __listNamed(collection, query, limit, info) {
  var q = (query || '').toLowerCase();
  var out = [];
  var total = 0;
  for (var i = 0; i < collection.length; i++) {
    var entry = collection[i];
    if (q && entry.name.toLowerCase().indexOf(q) < 0) continue;
    total++;
    if (out.length < limit) out.push(info(entry));
  }
  return { total: total, items: out };
}

function __findNamed(collection, name, kind, listHint) {
  try {
    return collection.getByName(name);
  } catch (e) {
    __fail(kind + ' not found: "' + name + '". ' + listHint);
  }
}

function ai_swatch(a) {
  var doc = __requireDoc();
  if (a.action === 'list') {
    return __listNamed(doc.swatches, a.query, __pick(a, 'limit', __LIST_LIMIT_DEFAULT), function (s) {
      return { name: s.name, kind: __swatchKind(s.color), color: __colorHex(s.color) };
    });
  }
  if (!__has(a, 'name') || !__has(a, 'color')) __fail('action "add" needs name and color.');
  var existing = null;
  try { existing = doc.swatches.getByName(a.name); } catch (e) { existing = null; }
  if (existing) __fail('A swatch named "' + a.name + '" already exists.');
  var sw = doc.swatches.add();
  sw.name = a.name;
  sw.color = __makePaint(a.color);
  return { name: sw.name, kind: __swatchKind(sw.color), use_as: 'swatch:' + sw.name };
}

/* ---------- symbols ---------- */

function __symbolInstance(doc, ab, layer, symbol, a) {
  var inst = layer.symbolItems.add(symbol);
  if (__has(a, 'w') || __has(a, 'h')) {
    var b = __bounds(inst);
    var w = __pick(a, 'w', (b[2] - b[0]) * __pick(a, 'h', 0) / (b[1] - b[3]));
    var h = __pick(a, 'h', (b[1] - b[3]) * w / (b[2] - b[0]));
    __resizeTo(inst, w, h);
  }
  __moveTo(doc, ab, inst, a.x, a.y);
  if (a.name) inst.name = a.name;
  return inst;
}

function __createSymbol(doc, a) {
  if (!__has(a, 'item') || !__has(a, 'symbol')) __fail('action "create" needs item and symbol (the new symbol\'s name).');
  var item = __findItem(doc, a.item);
  var ab = __itemArtboard(doc, item, null);
  var box = __boxOf(doc, ab, __bounds(item));
  var symbol = doc.symbols.add(item);
  symbol.name = a.symbol;
  if (!a.replace) return { symbol: symbol.name, item: __itemInfo(doc, item, ab, 0) };
  var layer = item.layer;
  var inst = __symbolInstance(doc, ab, layer, symbol, { x: box.x, y: box.y, name: item.name });
  inst.move(item, ElementPlacement.PLACEBEFORE);
  item.remove();
  return { symbol: symbol.name, item: __itemInfo(doc, inst, ab, 0) };
}

function ai_symbol(a) {
  var doc = __requireDoc();
  if (a.action === 'list') {
    return __listNamed(doc.symbols, a.query, __pick(a, 'limit', __LIST_LIMIT_DEFAULT), function (s) { return { name: s.name }; });
  }
  if (a.action === 'create') return __createSymbol(doc, a);
  if (!__has(a, 'symbol') || !__has(a, 'x') || !__has(a, 'y')) __fail('action "place" needs symbol, x and y.');
  var symbol = __findNamed(doc.symbols, a.symbol, 'Symbol', 'Use ai_symbol with action "list".');
  var ab = __abIndex(doc, a.artboard);
  var inst = __symbolInstance(doc, ab, __targetLayer(doc, a.layer), symbol, a);
  return __itemInfo(doc, inst, ab, 0);
}

/* ---------- graphic styles ---------- */

function ai_graphic_style(a) {
  var doc = __requireDoc();
  if (a.action === 'list') {
    return __listNamed(doc.graphicStyles, a.query, __pick(a, 'limit', __LIST_LIMIT_DEFAULT), function (s) { return { name: s.name }; });
  }
  if (!__has(a, 'name') || !a.items || !a.items.length) __fail('action "apply" needs name and items.');
  var style = __findNamed(doc.graphicStyles, a.name, 'Graphic style', 'Use ai_graphic_style with action "list".');
  var out = [];
  for (var i = 0; i < a.items.length; i++) {
    var item = __findItem(doc, a.items[i]);
    if (a.merge) style.mergeTo(item); else style.applyTo(item);
    out.push(__itemInfo(doc, item, null, 0));
  }
  return { style: style.name, items: out };
}
