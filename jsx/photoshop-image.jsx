/*
 * photoshop-image.jsx: ps_layer_style, ps_adjust, ps_filter, ps_cutout.
 *
 * Layer styles and adjustment layers have no DOM API; they are built with
 * Action Manager descriptors (the same ones Photoshop records for the UI).
 * Adjustments are non-destructive adjustment layers, clipped to one layer when
 * layer is given. Filters on smart objects become editable smart filters.
 */

var __GRADIENT_SCALE = 4096;

/* ---------- layer styles ---------- */

function __fxBase(key, opts, mode) {
  var d = new ActionDescriptor();
  d.putBoolean(__cid('enab'), true);
  d.putEnumerated(__cid('Md  '), __cid('BlnM'), __cid(mode));
  d.putUnitDouble(__cid('Opct'), __cid('#Prc'), opts.opacity);
  if (opts.color) d.putObject(__cid('Clr '), __cid('RGBC'), __amColor(opts.color));
  return d;
}

function __dropShadow(o) {
  var d = __fxBase('DrSh', o, 'Mltp');
  d.putBoolean(__cid('uglg'), false);
  d.putUnitDouble(__cid('lagl'), __cid('#Ang'), o.angle);
  d.putUnitDouble(__cid('Dstn'), __cid('#Pxl'), o.distance);
  d.putUnitDouble(__cid('Ckmt'), __cid('#Pxl'), o.spread);
  d.putUnitDouble(__cid('blur'), __cid('#Pxl'), o.size);
  return d;
}

function __outerGlow(o) {
  var d = __fxBase('OrGl', o, 'Scrn');
  d.putEnumerated(__cid('GlwT'), __cid('BETE'), __cid('SfBL'));
  d.putUnitDouble(__cid('Ckmt'), __cid('#Pxl'), o.spread);
  d.putUnitDouble(__cid('blur'), __cid('#Pxl'), o.size);
  return d;
}

var __STROKE_POS = { outside: 'OutF', inside: 'InsF', center: 'CtrF' };

function __stroke(o) {
  var d = __fxBase('FrFX', o, 'Nrml');
  d.putEnumerated(__cid('Styl'), __cid('FStl'), __cid(__STROKE_POS[o.position]));
  d.putEnumerated(__cid('PntT'), __cid('FrFl'), __cid('SClr'));
  d.putUnitDouble(__cid('Sz  '), __cid('#Pxl'), o.size);
  return d;
}

function __colorOverlay(o) {
  return __fxBase('SoFi', o, 'Nrml');
}

function __gradientDesc(stops) {
  var g = new ActionDescriptor();
  g.putString(__cid('Nm  '), 'MCP gradient');
  g.putEnumerated(__cid('GrdF'), __cid('GrdF'), __cid('CstS'));
  g.putDouble(__cid('Intr'), __GRADIENT_SCALE);
  var colors = new ActionList();
  var alphas = new ActionList();
  for (var i = 0; i < stops.length; i++) {
    var pos = Math.round(__GRADIENT_SCALE * __pick(stops[i], 'position', 100 * i / (stops.length - 1)) / 100);
    var c = new ActionDescriptor();
    c.putObject(__cid('Clr '), __cid('RGBC'), __amColor(stops[i].color));
    c.putEnumerated(__cid('Type'), __cid('Clry'), __cid('UsrS'));
    c.putInteger(__cid('Lctn'), pos);
    c.putInteger(__cid('Mdpn'), 50);
    colors.putObject(__cid('Clrt'), c);
    var t = new ActionDescriptor();
    t.putUnitDouble(__cid('Opct'), __cid('#Prc'), __pick(stops[i], 'opacity', 100));
    t.putInteger(__cid('Lctn'), pos);
    t.putInteger(__cid('Mdpn'), 50);
    alphas.putObject(__cid('TrnS'), t);
  }
  g.putList(__cid('Clrs'), colors);
  g.putList(__cid('Trns'), alphas);
  return g;
}

function __gradientOverlay(o) {
  var d = __fxBase('GrFl', o, 'Nrml');
  d.putObject(__cid('Grad'), __cid('Grdn'), __gradientDesc(o.stops));
  d.putUnitDouble(__cid('Angl'), __cid('#Ang'), o.angle);
  d.putEnumerated(__cid('Type'), __cid('GrdT'), o.type === 'radial' ? __cid('Rdl ') : __cid('Lnr '));
  d.putBoolean(__cid('Algn'), true);
  d.putUnitDouble(__cid('Scl '), __cid('#Prc'), 100);
  return d;
}

function __clearStyle() {
  try {
    executeAction(__sid('disableLayerStyle'), new ActionDescriptor(), DialogModes.NO);
  } catch (e) { /* no style to clear */ }
}

function ps_layer_style(a) {
  var doc = __requireDoc();
  return __step('Layer style', function () {
    var layer = __findLayer(doc, a.layer);
    __unlockBackground(layer);
    if (a.clear) {
      __clearStyle();
      return __layerInfo(layer);
    }
    var fx = new ActionDescriptor();
    fx.putUnitDouble(__cid('Scl '), __cid('#Prc'), 100);
    var any = false;
    if (a.drop_shadow) { fx.putObject(__cid('DrSh'), __cid('DrSh'), __dropShadow(a.drop_shadow)); any = true; }
    if (a.outer_glow) { fx.putObject(__cid('OrGl'), __cid('OrGl'), __outerGlow(a.outer_glow)); any = true; }
    if (a.stroke) { fx.putObject(__cid('FrFX'), __cid('FrFX'), __stroke(a.stroke)); any = true; }
    if (a.color_overlay) { fx.putObject(__cid('SoFi'), __cid('SoFi'), __colorOverlay(a.color_overlay)); any = true; }
    if (a.gradient_overlay) { fx.putObject(__cid('GrFl'), __cid('GrFl'), __gradientOverlay(a.gradient_overlay)); any = true; }
    if (!any) __fail('Give at least one of drop_shadow, outer_glow, stroke, color_overlay, gradient_overlay, or clear: true.');
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putProperty(__cid('Prpr'), __cid('Lefx'));
    r.putEnumerated(__cid('Lyr '), __cid('Ordn'), __cid('Trgt'));
    d.putReference(__cid('null'), r);
    d.putObject(__cid('T   '), __cid('Lefx'), fx);
    executeAction(__cid('setd'), d, DialogModes.NO);
    return __layerInfo(layer);
  });
}

/* ---------- adjustment layers ---------- */

function __adjBrightness(a) {
  var d = new ActionDescriptor();
  d.putInteger(__cid('Brgh'), a.brightness);
  d.putInteger(__cid('Cntr'), a.contrast);
  d.putBoolean(__sid('useLegacy'), false);
  return [__cid('BrgC'), d];
}

function __adjHueSat(a) {
  var d = new ActionDescriptor();
  d.putBoolean(__cid('Clrz'), !!a.colorize);
  var list = new ActionList();
  var m = new ActionDescriptor();
  m.putInteger(__cid('H   '), a.hue);
  m.putInteger(__cid('Strt'), a.saturation);
  m.putInteger(__cid('Lght'), a.lightness);
  list.putObject(__cid('Hst2'), m);
  d.putList(__cid('Adjs'), list);
  return [__cid('HStr'), d];
}

function __adjLevels(a) {
  var d = new ActionDescriptor();
  var list = new ActionList();
  var m = new ActionDescriptor();
  var ch = new ActionReference();
  ch.putEnumerated(__cid('Chnl'), __cid('Chnl'), __cid('Cmps'));
  m.putReference(__cid('Chnl'), ch);
  var input = new ActionList();
  input.putInteger(a.black);
  input.putInteger(a.white);
  m.putList(__cid('Inpt'), input);
  m.putDouble(__cid('Gmm '), a.gamma);
  list.putObject(__cid('LvlA'), m);
  d.putList(__cid('Adjs'), list);
  return [__cid('Lvls'), d];
}

function __adjExposure(a) {
  var d = new ActionDescriptor();
  d.putDouble(__cid('Exps'), a.exposure);
  d.putDouble(__cid('Ofst'), a.offset);
  d.putDouble(__sid('gammaCorrection'), a.gamma);
  return [__cid('Exps'), d];
}

function __adjVibrance(a) {
  var d = new ActionDescriptor();
  d.putInteger(__sid('vibrance'), a.vibrance);
  d.putInteger(__cid('Strt'), a.saturation);
  return [__sid('vibrance'), d];
}

function __adjPosterize(a) {
  var d = new ActionDescriptor();
  d.putInteger(__cid('Lvls'), a.levels);
  return [__cid('Pstr'), d];
}

function __adjThreshold(a) {
  var d = new ActionDescriptor();
  d.putInteger(__cid('Lvl '), a.level);
  return [__cid('Thrs'), d];
}

function __adjustmentSpec(a) {
  switch (a.type) {
    case 'brightness_contrast': return __adjBrightness(a);
    case 'hue_saturation': return __adjHueSat(a);
    case 'levels': return __adjLevels(a);
    case 'exposure': return __adjExposure(a);
    case 'vibrance': return __adjVibrance(a);
    case 'black_white': return [__cid('BanW'), new ActionDescriptor()];
    case 'invert': return [__cid('Invr'), new ActionDescriptor()];
    case 'posterize': return __adjPosterize(a);
    case 'threshold': return __adjThreshold(a);
    default: __fail('Unknown adjustment "' + a.type + '".');
  }
}

function ps_adjust(a) {
  var doc = __requireDoc();
  return __step('Adjust ' + a.type, function () {
    if (__has(a, 'layer')) __findLayer(doc, a.layer);
    var spec = __adjustmentSpec(a);
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putClass(__cid('AdjL'));
    d.putReference(__cid('null'), r);
    var using = new ActionDescriptor();
    using.putBoolean(__cid('Grup'), __has(a, 'layer'));
    using.putObject(__cid('Type'), spec[0], spec[1]);
    d.putObject(__cid('Usng'), __cid('AdjL'), using);
    executeAction(__cid('Mk  '), d, DialogModes.NO);
    var adj = doc.activeLayer;
    if (a.name) adj.name = a.name;
    var info = __layerInfo(adj);
    info.note = __has(a, 'layer')
      ? 'Adjustment layer clipped to "' + a.layer + '"; hide or delete it with ps_set_layer to undo the look.'
      : 'Adjustment layer affects every layer below it.';
    return info;
  });
}

/* ---------- filters ---------- */

/* Text and shape layers cannot take filters directly: wrap them in a smart object first. */
function __filterable(layer) {
  var kind = __kindOf(layer);
  if (kind === 'group' || kind === 'adjustment' || kind === 'fill') __fail('Filters work on pixel, smart object, text and shape layers (this is ' + kind + ').');
  if (kind === 'text' || kind === 'shape') {
    executeAction(__sid('newPlacedLayer'), new ActionDescriptor(), DialogModes.NO);
    return { layer: app.activeDocument.activeLayer, converted: true };
  }
  return { layer: layer, converted: false };
}

function ps_filter(a) {
  var doc = __requireDoc();
  return __step('Filter ' + a.filter, function () {
    var src = __findLayer(doc, a.layer);
    __unlockBackground(src);
    var f = __filterable(src);
    var L = f.layer;
    if (a.filter === 'gaussian_blur') L.applyGaussianBlur(__pick(a, 'radius', 5));
    if (a.filter === 'motion_blur') L.applyMotionBlur(__pick(a, 'angle', 0), __pick(a, 'distance', 20));
    if (a.filter === 'unsharp_mask') L.applyUnSharpMask(__pick(a, 'amount', 100), __pick(a, 'radius', 1), __pick(a, 'threshold', 0));
    if (a.filter === 'add_noise') L.applyAddNoise(__pick(a, 'amount', 5), NoiseDistribution.GAUSSIAN, !!a.monochromatic);
    if (a.filter === 'high_pass') L.applyHighPass(__pick(a, 'radius', 10));
    if (a.filter === 'sharpen') L.applySharpen();
    var info = __layerInfo(L);
    if (f.converted) info.note = 'The layer was converted to a smart object so the filter stays editable.';
    if (__kindOf(L) === 'smart_object') info.smart_filter = true;
    return info;
  });
}

/* ---------- cut-outs ---------- */

function __hasUserMask(layer) {
  var r = new ActionReference();
  r.putIdentifier(__cid('Lyr '), layer.id);
  return executeActionGet(r).getBoolean(__sid('hasUserMask'));
}

function ps_cutout(a) {
  var doc = __requireDoc();
  return __step('Remove background', function () {
    var layer = __findLayer(doc, a.layer);
    __unlockBackground(layer);
    var kind = __kindOf(layer);
    if (kind !== 'pixel' && kind !== 'smart_object') __fail('Remove Background works on photos (pixel or smart object layers); this is ' + kind + '.');
    if (__hasUserMask(layer)) __fail('Layer "' + layer.name + '" already has a pixel mask. Delete it in Photoshop or use a copy of the layer.');
    try {
      executeAction(__sid('removeBackground'), new ActionDescriptor(), DialogModes.NO);
    } catch (e) {
      if (/cancel/i.test(String(e.message))) __fail('Remove Background found no clear subject in layer "' + layer.name + '" (it needs a photo of a person, animal or object).');
      throw e;
    }
    var info = __layerInfo(doc.activeLayer);
    info.masked = __hasUserMask(doc.activeLayer);
    info.note = 'The background is hidden by a layer mask (nothing is deleted).';
    return info;
  });
}
