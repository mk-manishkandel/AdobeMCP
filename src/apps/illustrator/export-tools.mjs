/**
 * Export ai_* tools. ai_preview returns the rendered artboard as MCP image content.
 */
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { artboard, filePath, objectSchema, withPaths } from './schemas.mjs';

export const PREVIEW_DEFAULT_SIZE = 800;

const exportTool = {
  name: 'ai_export',
  description:
    'Export one artboard to PNG, JPG, SVG or WebP (format from the file extension, or set format). Size: width or height ' +
    'in output pixels (e.g. width 1080 for Instagram), or scale (1 = 100%, 2 = 2x). Overwrites the file. ' +
    'Returns the path and pixel size.',
  inputSchema: objectSchema(
    {
      path: filePath('Output file, e.g. ~/Desktop/admission-post.png'),
      format: { type: 'string', enum: ['png', 'jpg', 'svg', 'webp'], description: 'Override the format from the extension' },
      artboard: artboard(),
      width: { type: 'integer', minimum: 1, maximum: 16000, description: 'Output width in pixels' },
      height: { type: 'integer', minimum: 1, maximum: 16000, description: 'Output height in pixels' },
      scale: { type: 'number', exclusiveMinimum: 0, maximum: 10, description: 'Scale factor (ignored if width/height given)' },
      transparent: { type: 'boolean', default: false, description: 'Transparent background (png/webp)' },
      quality: { type: 'integer', minimum: 1, maximum: 100, default: 85, description: 'JPG/WebP quality' },
    },
    ['path'],
  ),
  handler: withPaths(['path']),
};

const preview = {
  name: 'ai_preview',
  description:
    'Render an artboard to a small PNG and return it as an image so you can SEE the design. Use after changes to check ' +
    'layout, overlaps, text overflow and colours, then fix with ai_set_item / ai_set_text.',
  inputSchema: objectSchema({
    artboard: artboard(),
    max_size: { type: 'integer', minimum: 64, maximum: 2048, default: PREVIEW_DEFAULT_SIZE, description: 'Longest side in pixels' },
  }),
  annotations: { readOnlyHint: true },
  handler: previewHandler,
};

export async function previewHandler(args, ctx) {
  const path = join(ctx.tmpDir, `preview-${randomUUID()}.png`);
  const result = await ctx.call('ai_preview', { ...args, path });
  try {
    const data = await readFile(result.path);
    const summary = { artboard: result.artboard, artboard_name: result.artboard_name, width: result.width, height: result.height };
    return [
      { type: 'image', data: data.toString('base64'), mimeType: 'image/png' },
      { type: 'text', text: JSON.stringify(summary) },
    ];
  } finally {
    await unlink(result.path).catch(() => {});
  }
}

export const exportTools = Object.freeze([exportTool, preview]);
