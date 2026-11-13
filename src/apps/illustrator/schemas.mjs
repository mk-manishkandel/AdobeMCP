/**
 * Shared JSON-schema fragments and handler helpers for the ai_* tool tables.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { BridgeError, ErrorCodes } from '../../errors.mjs';
import { textContent } from '../../tools.mjs';

export const COLOR_PATTERN = '^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$';
export const PAINT_PATTERN = '^(none|#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}))$';
export const PATH_PATTERN = '^(/|~/)';

export const artboard = (extra = '') => ({
  type: 'integer',
  minimum: 0,
  description: `0-based artboard index that x/y are measured from. ${extra || 'Default: the active artboard.'}`,
});

export const px = (description, extra = {}) => ({ type: 'number', description: `${description} (px)`, ...extra });

export const color = (description, extra = {}) => ({
  type: 'string',
  pattern: COLOR_PATTERN,
  description: `${description} as "#RRGGBB"`,
  ...extra,
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
    `${description}: "#RRGGBB", "none", or a gradient ` +
    '{"type":"linear","angle":-90,"stops":[{"color":"#FFE259"},{"color":"#FF2E7E"}]}',
  ...extra,
});

export const filePath = (description) => ({
  type: 'string',
  pattern: PATH_PATTERN,
  description: `${description}. Absolute path (may start with ~/).`,
});

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

export const overwrite = {
  type: 'boolean',
  default: false,
  description: 'Replace the file if it already exists. Without it an existing file is never touched.',
};

export const itemName = { type: 'string', minLength: 1, description: 'Name for the item, so it can be found later by name.' };

export function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function expandHome(p) {
  return typeof p === 'string' && p.startsWith('~/') ? `${homedir()}${p.slice(1)}` : p;
}

/** Returns a copy of args with ~/ expanded in the given path keys. */
export function expandPaths(args, keys) {
  const out = { ...args };
  for (const k of keys) if (out[k] !== undefined) out[k] = expandHome(out[k]);
  return out;
}

/**
 * Handler for tools that write `outputKey`: expands paths, refuses to replace an
 * existing file unless args.overwrite is true, then calls the JSX function.
 */
export function withNoClobber(keys, outputKey = 'path') {
  return async (args, ctx) => {
    const expanded = expandPaths(args, keys);
    const target = expanded[outputKey];
    if (target && !expanded.overwrite && existsSync(target)) {
      throw new BridgeError(
        ErrorCodes.FILE_EXISTS,
        `${target} already exists. Pass overwrite: true to replace it, or choose another path.`,
      );
    }
    return textContent(await ctx.call(ctx.tool.name, expanded));
  };
}

/** Handler that expands path arguments, then calls the JSX function of the same name. */
export function withPaths(keys) {
  return async (args, ctx) => textContent(await ctx.call(ctx.tool.name, expandPaths(args, keys)));
}
