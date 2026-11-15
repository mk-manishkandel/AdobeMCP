/**
 * Export ai_* tools. ai_preview returns the rendered artboard as MCP image content.
 */
import { PREVIEW_DEFAULT_SIZE, previewHandler } from '../shared-schemas.mjs';
import { artboard, filePath, objectSchema, overwrite, withNoClobber } from './schemas.mjs';

export { PREVIEW_DEFAULT_SIZE, previewHandler };

const exportTool = {
  name: 'ai_export',
  description:
    'Export one artboard to PNG, JPG, SVG or WebP (format from the file extension, or set format). Size: width or height ' +
    'in output pixels (e.g. width 1080 for Instagram), or scale (1 = 100%, 2 = 2x). An existing file is only replaced with overwrite: true. ' +
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
      overwrite,
    },
    ['path'],
  ),
  handler: withNoClobber(['path']),
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

const exportPdf = {
  name: 'ai_export_pdf',
  description:
    'Export a print-ready PDF: chosen artboards (0-based; default all), an Adobe PDF preset (default ' +
    '"[High Quality Print]"; "[PDF/X-4:2008]" for printers), bleed and crop marks. cmyk: true converts colours to CMYK ' +
    'by using the "[PDF/X-1a:2001]" preset. ' +
    'list_presets: true lists the presets. Illustrator then treats the PDF as the document\'s file (the result says how ' +
    'to switch back). An existing file is only replaced with overwrite: true.',
  inputSchema: objectSchema({
    path: filePath('Output .pdf file'),
    artboards: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1, maxItems: 1000, description: 'Artboard indices' },
    preset: { type: 'string', minLength: 1, description: 'Adobe PDF preset; default "[High Quality Print]"' },
    cmyk: { type: 'boolean', default: false, description: 'Convert colours to CMYK (PDF/X-1a)' },
    bleed: { type: 'number', minimum: 0, maximum: 72, default: 0, description: 'Bleed on every side (px = pt)' },
    crop_marks: { type: 'boolean', default: false },
    list_presets: { type: 'boolean', default: false },
    overwrite,
  }),
  handler: withNoClobber(['path']),
  timeoutSec: 600,
};

export const exportTools = Object.freeze([exportTool, preview, exportPdf]);
