/**
 * App-neutral JSON-schema fragments and tool handlers shared by every app's
 * tool table (Illustrator ai_*, Photoshop ps_*).
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BridgeError, ErrorCodes } from '../errors.mjs';
import { textContent } from '../tools.mjs';

export const COLOR_PATTERN = '^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$';
export const PATH_PATTERN = '^(/|~/)';
export const PREVIEW_DEFAULT_SIZE = 800;

export const px = (description, extra = {}) => ({ type: 'number', description: `${description} (px)`, ...extra });

export const color = (description, extra = {}) => ({
  type: 'string',
  pattern: COLOR_PATTERN,
  description: `${description} as "#RRGGBB"`,
  ...extra,
});

export const filePath = (description) => ({
  type: 'string',
  pattern: PATH_PATTERN,
  description: `${description}. Absolute path (may start with ~/).`,
});

export const overwrite = {
  type: 'boolean',
  default: false,
  description: 'Replace the file if it already exists. Without it an existing file is never touched.',
};

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

/**
 * Handler for *_preview tools: the JSX function renders a PNG into the server's
 * temp dir; it is returned as MCP image content and deleted.
 */
export async function previewHandler(args, ctx) {
  const path = join(ctx.tmpDir, `preview-${randomUUID()}.png`);
  const result = await ctx.call(ctx.tool.name, { ...args, path });
  try {
    const data = await readFile(result.path);
    const { path: _rendered, ...summary } = result;
    return [
      { type: 'image', data: data.toString('base64'), mimeType: 'image/png' },
      { type: 'text', text: JSON.stringify(summary) },
    ];
  } finally {
    await unlink(result.path).catch(() => {});
  }
}
