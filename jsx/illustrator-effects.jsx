/*
 * illustrator-effects.jsx: paint on any item, text outlining and live effects
 * (glow, drop shadow, blur). Used by ai_set_item and ai_add_shape.
 */

var __BLUR_EFFECT = '<LiveEffect name="Adobe PSL Gaussian Blur"><Dict data="R blur {r} "/></LiveEffect>';
var __MIN_EFFECT_PPI = 300;

/* Calls fn(path) for every PathItem inside item (paths, compound paths, groups). */
function __eachPath(item, fn) {
  var t = item.typename;
  if (t === 'PathItem') { fn(item); return; }
  if (t === 'CompoundPathItem') {
    for (var i = 0; i < item.pathItems.length; i++) fn(item.pathItems[i]);
    return;
  }
  if (t === 'GroupItem') {
    for (var j = 0; j < item.pageItems.length; j++) __eachPath(item.pageItems[j], fn);
    return;
  }
  __fail('Cannot paint a ' + __typeOf(item) + '.');
}

/* Applies {fill, stroke, stroke_width} to text, paths, compound paths or whole groups. */
function __paintItem(item, a) {
  if (item.typename === 'TextFrame') {
    if (__has(a, 'stroke') || __has(a, 'stroke_width') || __has(a, 'dash') || __has(a, 'cap') || __has(a, 'join')) {
      __fail('stroke settings are for shapes; text takes fill only.');
    }
    if (__isGradientSpec(a.fill)) {
      __fail('Live text cannot show a gradient. Pass outline: true in the same call to turn the text into shapes first.');
    }
    if (__has(a, 'fill')) __allChars(item).fillColor = __makePaint(a.fill);
    return;
  }
  __eachPath(item, function (p) { __applyPaint(p, a); });
  if (__has(a, 'fill')) __gradientAngle(item, a.fill);
}

/* Converts text to ONE compound path (so a gradient spans the whole word). Keeps name and z-order. */
function __outlineText(tf) {
  if (tf.typename !== 'TextFrame') __fail('outline works on text items only (item is ' + __typeOf(tf) + ').');
  var name = tf.name;
  var group = tf.createOutline();
  var cp = group.parent.compoundPathItems.add();
  cp.move(group, ElementPlacement.PLACEBEFORE);
  var paths = [];
  __eachPath(group, function (p) { paths.push(p); });
  for (var i = 0; i < paths.length; i++) paths[i].move(cp, ElementPlacement.PLACEATEND);
  group.remove();
  if (name) cp.name = name;
  return cp;
}

/* Blur and similar effects are rasterised at the document's raster-effect resolution. */
function __ensureEffectResolution(doc) {
  try {
    if (doc.rasterEffectSettings.resolution < __MIN_EFFECT_PPI) doc.rasterEffectSettings.resolution = __MIN_EFFECT_PPI;
  } catch (e) { /* older documents without raster settings: effects still apply */ }
}

function __applyBlur(item, radius) {
  item.applyEffect(__BLUR_EFFECT.replace('{r}', radius));
}

/* A copy directly behind item, recoloured, faded and blurred: the basis of glow and shadow. */
function __blurredCopyBehind(doc, item, color, opacity, radius, suffix) {
  __ensureEffectResolution(doc);
  var copy = item.duplicate(item, ElementPlacement.PLACEAFTER);
  if (color) __paintItem(copy, { fill: color });
  copy.opacity = opacity;
  if (radius > 0) __applyBlur(copy, radius);
  copy.name = (item.name || __typeOf(item)) + ' ' + suffix;
  return copy;
}

/* Glow, shadow and blur from ai_set_item args. Returns ids of the helper items created. */
function __applyEffects(doc, item, a) {
  var out = {};
  if (__has(a, 'shadow')) {
    var s = a.shadow;
    var sh = __blurredCopyBehind(doc, item, __pick(s, 'color', '#000000'), s.opacity, s.blur, 'shadow');
    sh.translate(s.x, -s.y);
    out.shadow_id = sh.uuid;
  }
  if (__has(a, 'glow')) {
    var g = a.glow;
    out.glow_id = __blurredCopyBehind(doc, item, __pick(g, 'color', null), g.opacity, g.radius, 'glow').uuid;
  }
  if (__has(a, 'blur') && a.blur > 0) {
    __ensureEffectResolution(doc);
    __applyBlur(item, a.blur);
  }
  return out;
}
