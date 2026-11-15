/**
 * Illustrator-specific JSON-schema fragments for the ai_* tool tables.
 * App-neutral helpers live in ../shared-schemas.mjs and are re-exported here.
 */
import { COLOR_PATTERN } from '../shared-schemas.mjs';

export {
  COLOR_PATTERN, PATH_PATTERN, color, expandPaths, filePath, objectSchema, overwrite, px, withNoClobber, withPaths,
} from '../shared-schemas.mjs';

export const PAINT_PATTERN = '^(none|#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|swatch:.+)$';
export const artboard = (extra = '') => ({
  type: 'integer',
  minimum: 0,
  description: `0-based artboard index that x/y are measured from. ${extra || 'Default: the active artboard.'}`,
});

export const gradientStop = {
  type: 'object',
  properties: {
    color: { type: 'string', pattern: COLOR_PATTERN, description: '"#RRGGBB"' },
    position: { type: 'number', minimum: 0, maximum: 100, description: 'Stop position 0-100 % (default: evenly spread)' },
    opacity: { type: 'number', minimum: 0, maximum: 100, default: 100, description: 'Stop opacity %' },
  },
  required: ['color'],
  additionalProperties: false,
};

/** "#RRGGBB", "none", or a gradient {type, angle, stops}. Strings and objects are told apart by type. */
export const paint = (description, extra = {}) => ({
  type: ['string', 'object'],
  pattern: PAINT_PATTERN,
  properties: {
    type: { type: 'string', enum: ['linear', 'radial'], default: 'linear' },
    angle: { type: 'number', minimum: -360, maximum: 360, default: 0, description: 'Linear angle: 0 = left→right, 90 = bottom→top, -90 = top→bottom' },
    stops: { type: 'array', items: gradientStop, minItems: 2, maxItems: 12 },
  },
  required: ['stops'],
  additionalProperties: false,
  description:
    `${description}: "#RRGGBB", "none", "swatch:<name>" (a document swatch, also patterns), or a gradient ` +
    '{"type":"linear","angle":-90,"stops":[{"color":"#FFE259"},{"color":"#FF2E7E"}]}',
  ...extra,
});

/** Dash pattern, caps and joins shared by the shape tools. */
export const strokeStyle = Object.freeze({
  dash: {
    type: 'array',
    items: { type: 'number', minimum: 0 },
    maxItems: 6,
    description: 'Dash pattern in px, e.g. [12, 6] (dash, gap, ...); [] = solid',
  },
  cap: { type: 'string', enum: ['butt', 'round', 'square'], description: 'Line end caps' },
  join: { type: 'string', enum: ['miter', 'round', 'bevel'], description: 'Corner joins' },
});

const point = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };

/** A path vertex: [x, y], or {x, y, in, out} where in/out are absolute Bezier handle positions. */
export const vertex = {
  type: ['array', 'object'],
  items: { type: 'number' },
  minItems: 2,
  maxItems: 2,
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    in: { ...point, description: 'Incoming handle [x, y]' },
    out: { ...point, description: 'Outgoing handle [x, y]' },
  },
  required: ['x', 'y'],
  additionalProperties: false,
};

export const itemRef = {
  type: 'string',
  minLength: 1,
  description: 'Item id (the "id" from ai_get_document_info or a create result) or the item\'s unique name.',
};

export const layer = {
  type: 'string',
  minLength: 1,
  description: 'Layer name to put the item on (created if missing). Default: the active unlocked layer.',
};

export const itemName = { type: 'string', minLength: 1, description: 'Name for the item, so it can be found later by name.' };
