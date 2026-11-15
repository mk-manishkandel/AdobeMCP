/**
 * Export ps_* tools. ps_preview returns the rendered canvas as MCP image content.
 */
import { PREVIEW_DEFAULT_SIZE, previewHandler } from '../shared-schemas.mjs';
import { documentName, filePath, objectSchema, overwrite, withNoClobber } from './schemas.mjs';

const MAX_EXPORT_PX = 30000;

const exportTool = {
  name: 'ps_export',
  description:
    'Export the document as a flat PNG or JPG (format from the extension, or set format). Size: width and/or height in ' +
    'output pixels (aspect kept if one is given), or scale (2 = 200%). transparent: true keeps transparency in PNG. ' +
    'The document itself is not changed. An existing file is only replaced with overwrite: true.',
  inputSchema: objectSchema(
    {
      path: filePath('Output file, e.g. ~/Desktop/post.png'),
      format: { type: 'string', enum: ['png', 'jpg'], description: 'Override the format from the extension' },
      document: documentName,
      width: { type: 'integer', minimum: 1, maximum: MAX_EXPORT_PX, description: 'Output width (px)' },
      height: { type: 'integer', minimum: 1, maximum: MAX_EXPORT_PX, description: 'Output height (px)' },
      scale: { type: 'number', exclusiveMinimum: 0, maximum: 10, description: 'Scale factor (ignored if width/height given)' },
      transparent: { type: 'boolean', default: false, description: 'Keep transparency (png)' },
      quality: { type: 'integer', minimum: 1, maximum: 100, default: 85, description: 'JPG quality' },
      overwrite,
    },
    ['path'],
  ),
  handler: withNoClobber(['path']),
  timeoutSec: 300,
};

const preview = {
  name: 'ps_preview',
  description:
    'Render the document to a small PNG and return it as an image so you can SEE the design. Use after changes to check ' +
    'layout, overlaps, text and colours, then fix with ps_set_layer / ps_set_text.',
  inputSchema: objectSchema({
    document: documentName,
    max_size: { type: 'integer', minimum: 64, maximum: 2048, default: PREVIEW_DEFAULT_SIZE, description: 'Longest side in pixels' },
  }),
  annotations: { readOnlyHint: true },
  handler: previewHandler,
  timeoutSec: 120,
};

export const exportTools = Object.freeze([exportTool, preview]);
