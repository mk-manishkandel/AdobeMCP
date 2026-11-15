/**
 * Image ps_* tools: layer styles, adjustment layers, filters, background removal.
 */
import { color, layerName, layerRef, objectSchema, opacity } from './schemas.mjs';

const FILTER_TIMEOUT_SEC = 300;
const angle = (fallback, description) => ({ type: 'number', minimum: -360, maximum: 360, default: fallback, description });
const pixels = (fallback, max, description) => ({ type: 'number', minimum: 0, maximum: max, default: fallback, description: `${description} (px)` });

const dropShadow = objectSchema({
  color: color('Shadow colour', { default: '#000000' }),
  opacity: opacity(50),
  angle: angle(120, 'Light angle in degrees (120 = light from the top-left)'),
  distance: pixels(10, 30000, 'Offset'),
  spread: { type: 'number', minimum: 0, maximum: 100, default: 0, description: 'Spread %' },
  size: pixels(20, 250, 'Blur size'),
});

const outerGlow = objectSchema({
  color: color('Glow colour', { default: '#FFFFBE' }),
  opacity: opacity(75),
  spread: { type: 'number', minimum: 0, maximum: 100, default: 0, description: 'Spread %' },
  size: pixels(20, 250, 'Glow size'),
});

const stroke = objectSchema({
  color: color('Stroke colour', { default: '#000000' }),
  opacity: opacity(100),
  size: { type: 'number', minimum: 1, maximum: 250, default: 3, description: 'Stroke width (px)' },
  position: { type: 'string', enum: ['outside', 'inside', 'center'], default: 'outside' },
});

const colorOverlay = objectSchema({ color: color('Overlay colour', { default: '#FF0000' }), opacity: opacity(100) });

const gradientStop = objectSchema(
  {
    color: color('Stop colour'),
    position: { type: 'number', minimum: 0, maximum: 100, description: 'Position % along the gradient (default: evenly spaced)' },
    opacity: opacity(100),
  },
  ['color'],
);

const gradientOverlay = objectSchema(
  {
    stops: { type: 'array', items: gradientStop, minItems: 2, maxItems: 32 },
    angle: angle(90, 'Direction in degrees (90 = bottom to top)'),
    type: { type: 'string', enum: ['linear', 'radial'], default: 'linear' },
    opacity: opacity(100),
  },
  ['stops'],
);

const layerStyle = {
  name: 'ps_layer_style',
  description:
    'Set the layer style (effects) of a layer: drop_shadow, outer_glow, stroke, color_overlay, gradient_overlay. ' +
    'Each call REPLACES the whole style, so pass every effect you want; {} uses an effect\'s defaults. clear: true ' +
    'removes the style. Works on text, shape, pixel and smart object layers.',
  inputSchema: objectSchema(
    {
      layer: layerRef,
      drop_shadow: dropShadow,
      outer_glow: outerGlow,
      stroke,
      color_overlay: colorOverlay,
      gradient_overlay: gradientOverlay,
      clear: { type: 'boolean', default: false, description: 'Remove the layer style' },
    },
    ['layer'],
  ),
};

const adjust = {
  name: 'ps_adjust',
  description:
    'Add a non-destructive adjustment layer. With layer it is clipped to that layer only; without, it changes everything ' +
    'below it. Types and their settings: brightness_contrast (brightness -150..150, contrast -50..100), hue_saturation ' +
    '(hue -180..180, saturation -100..100, lightness -100..100, colorize), levels (black, white 0..255, gamma 0.1..9.99), ' +
    'exposure (exposure -20..20, offset -0.5..0.5, gamma), vibrance (vibrance, saturation -100..100), black_white, ' +
    'invert, posterize (levels 2..255), threshold (level 1..255). Hide or delete it later with ps_set_layer.',
  inputSchema: objectSchema(
    {
      type: {
        type: 'string',
        enum: ['brightness_contrast', 'hue_saturation', 'levels', 'exposure', 'vibrance', 'black_white', 'invert', 'posterize', 'threshold'],
      },
      layer: { ...layerRef, description: 'Clip the adjustment to this layer (id or name); omit to affect all layers below' },
      name: layerName,
      brightness: { type: 'integer', minimum: -150, maximum: 150, default: 0 },
      contrast: { type: 'integer', minimum: -50, maximum: 100, default: 0 },
      hue: { type: 'integer', minimum: -180, maximum: 180, default: 0 },
      saturation: { type: 'integer', minimum: -100, maximum: 100, default: 0 },
      lightness: { type: 'integer', minimum: -100, maximum: 100, default: 0 },
      colorize: { type: 'boolean', default: false },
      black: { type: 'integer', minimum: 0, maximum: 253, default: 0, description: 'Levels input black point' },
      white: { type: 'integer', minimum: 2, maximum: 255, default: 255, description: 'Levels input white point' },
      gamma: { type: 'number', minimum: 0.1, maximum: 9.99, default: 1, description: 'Levels / exposure gamma' },
      exposure: { type: 'number', minimum: -20, maximum: 20, default: 0 },
      offset: { type: 'number', minimum: -0.5, maximum: 0.5, default: 0 },
      vibrance: { type: 'integer', minimum: -100, maximum: 100, default: 0 },
      levels: { type: 'integer', minimum: 2, maximum: 255, default: 4, description: 'Posterize levels' },
      level: { type: 'integer', minimum: 1, maximum: 255, default: 128, description: 'Threshold level' },
    },
    ['type'],
  ),
};

const filter = {
  name: 'ps_filter',
  description:
    'Apply a filter to a layer: gaussian_blur (radius, default 5), motion_blur (angle, distance default 20), unsharp_mask ' +
    '(amount % default 100, radius default 1, threshold), add_noise (amount % default 5, monochromatic), high_pass ' +
    '(radius default 10), sharpen. Text and shape layers are converted to smart objects first, and filters on smart ' +
    'objects stay editable (smart filters).',
  inputSchema: objectSchema(
    {
      layer: layerRef,
      filter: { type: 'string', enum: ['gaussian_blur', 'motion_blur', 'unsharp_mask', 'add_noise', 'high_pass', 'sharpen'] },
      radius: { type: 'number', exclusiveMinimum: 0, maximum: 1000, description: 'Radius (px)' },
      angle: { type: 'number', minimum: -360, maximum: 360, description: 'Motion blur angle (degrees)' },
      distance: { type: 'number', minimum: 1, maximum: 2000, description: 'Motion blur distance (px)' },
      amount: { type: 'number', minimum: 0.1, maximum: 500, description: 'Unsharp amount % or noise amount %' },
      threshold: { type: 'integer', minimum: 0, maximum: 255, description: 'Unsharp threshold (levels)' },
      monochromatic: { type: 'boolean', default: false, description: 'Grey noise instead of coloured' },
    },
    ['layer', 'filter'],
  ),
  timeoutSec: FILTER_TIMEOUT_SEC,
};

const cutout = {
  name: 'ps_cutout',
  description:
    'Remove the background of a photo layer (pixel or smart object) with Photoshop\'s Remove Background. The background ' +
    'is hidden with a layer mask, so nothing is deleted. Needs a layer without a mask.',
  inputSchema: objectSchema({ layer: layerRef }, ['layer']),
  timeoutSec: FILTER_TIMEOUT_SEC,
};

export const imageTools = Object.freeze([layerStyle, adjust, filter, cutout]);
