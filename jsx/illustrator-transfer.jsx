/*
 * illustrator-transfer.jsx: ai_copy_items, copying items from another open
 * document (e.g. a logo or a whole block from last year's poster).
 *
 * Illustrator quirks handled here: item uuids and artboards can only be read
 * reliably while their document is ACTIVE, so the source is activated for the
 * lookup and the target is re-activated before anything is positioned.
 */

/* Reads each item's box relative to its own artboard in the (active) source document. */
function __collectSources(src, refs) {
  var out = [];
  for (var i = 0; i < refs.length; i++) {
    var item = __findItem(src, refs[i]);
    var ab = __artboardAt(src, __bounds(item));
    out.push({ item: item, box: __boxOf(src, ab === null ? 0 : ab, __bounds(item)) });
  }
  return out;
}

/* Union box of entries [{box}] (artboard coordinates). */
function __unionBox(entries) {
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (var i = 0; i < entries.length; i++) {
    var b = entries[i].box;
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function ai_copy_items(a) {
  var target = __requireDoc();
  var src = __findDocument(a.from_document);
  if (src === target) __fail('from_document is the active document; use ai_set_item with duplicate: true instead.');
  var layer = __targetLayer(target, a.layer);
  var copies = [];
  var entries;
  src.activate();
  try {
    entries = __collectSources(src, a.items);
    /* Reverse order + PLACEATBEGINNING keeps the listed order: the first item ends up on top. */
    for (var i = entries.length - 1; i >= 0; i--) {
      copies.unshift(entries[i].item.duplicate(layer, ElementPlacement.PLACEATBEGINNING));
    }
  } finally {
    target.activate();
  }
  var ab = __abIndex(target, a.artboard);
  var union = __unionBox(entries);
  var dx = __has(a, 'x') ? a.x - union.x : 0;
  var dy = __has(a, 'y') ? a.y - union.y : 0;
  var out = [];
  for (var j = 0; j < copies.length; j++) {
    copies[j].locked = false;
    copies[j].hidden = false;
    __moveTo(target, ab, copies[j], entries[j].box.x + dx, entries[j].box.y + dy);
    out.push(__itemInfo(target, copies[j], ab, 0));
  }
  return {
    from_document: src.name,
    artboard: ab,
    items: out,
    note: 'Copied text keeps its fonts; if a font is not active on this Mac the text renders with a fallback.'
  };
}
