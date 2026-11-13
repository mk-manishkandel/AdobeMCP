/**
 * Shared JSON-schema fragments and handler helpers for the ai_* tool tables.
 */
import { homedir } from 'node:os';
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

export const paint = (description, extra = {}) => ({
  type: 'string',
  pattern: PAINT_PATTERN,
  description: `${description}: "#RRGGBB" or "none"`,
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

/** Handler that expands path arguments, then calls the JSX function of the same name. */
export function withPaths(keys) {
  return async (args, ctx) => textContent(await ctx.call(ctx.tool.name, expandPaths(args, keys)));
}
