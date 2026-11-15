/**
 * Document-level ps_* tools.
 */
import { QUICK_TIMEOUT_SEC, documentName, filePath, objectSchema, overwrite, withNoClobber, withPaths } from './schemas.mjs';

const MAX_CANVAS_PX = 30000;

const status = {
  name: 'ps_status',
  description:
    'Report the Photoshop version and every open document (name, path, saved state, width x height px, resolution, ' +
    'colour mode, top-level layer count). Call this first to check that Photoshop is reachable.',
  inputSchema: objectSchema({}),
  annotations: { readOnlyHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const getDocumentInfo = {
  name: 'ps_get_document_info',
  description:
    'Describe a document and every layer (groups are walked, top to bottom): id, name, kind ' +
    '(pixel/text/shape/smart_object/fill/adjustment/group), x/y/w/h (px from the canvas top-left, y down, without layer ' +
    'effects), visible, opacity, blend_mode, locked, clipped, group; text layers add text, font PostScript name, size ' +
    'and color. Use the returned ids with the other tools.',
  inputSchema: objectSchema({ document: documentName }),
  annotations: { readOnlyHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const newDocument = {
  name: 'ps_new_document',
  description:
    'Create a document of width x height px. Social sizes: post 1080x1080, portrait 1080x1350, story 1080x1920, ' +
    'banner 1920x1080; print at 300 ppi. background is a "#RRGGBB" colour or "transparent".',
  inputSchema: objectSchema(
    {
      width: { type: 'integer', minimum: 1, maximum: MAX_CANVAS_PX, description: 'Canvas width (px)' },
      height: { type: 'integer', minimum: 1, maximum: MAX_CANVAS_PX, description: 'Canvas height (px)' },
      resolution: { type: 'number', minimum: 1, maximum: 2400, default: 72, description: 'Pixels per inch (72 screen, 300 print)' },
      color_mode: { type: 'string', enum: ['rgb', 'cmyk', 'grayscale'], default: 'rgb' },
      name: { type: 'string', minLength: 1, maxLength: 255, description: 'Document title' },
      background: {
        type: 'string',
        pattern: '^(transparent|#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}))$',
        default: '#FFFFFF',
        description: 'Background "#RRGGBB" or "transparent"',
      },
    },
    ['width', 'height'],
  ),
};

const open = {
  name: 'ps_open',
  description:
    'Open an image or document (psd, jpg, png, tif, pdf, heic...) and make it active, or pass document to switch ' +
    'to one that is already open (all other tools work on the active document).',
  inputSchema: objectSchema({
    path: filePath('File to open'),
    document: { type: 'string', minLength: 1, description: 'Name of an open document to make active (see ps_status)' },
  }),
  handler: withPaths(['path']),
};

const close = {
  name: 'ps_close',
  description: 'Close a document. Unsaved changes are discarded unless save is true (which needs a previously saved document).',
  inputSchema: objectSchema({
    document: documentName,
    save: { type: 'boolean', default: false, description: 'Save before closing' },
  }),
  annotations: { destructiveHint: true },
};

const save = {
  name: 'ps_save',
  description:
    'Save the document with layers: path ending in .psd (Photoshop), .tif (layered TIFF) or .pdf. Without a path re-saves ' +
    'the existing file. Missing folders are created. An existing file is only replaced with overwrite: true. ' +
    'For flat .png / .jpg images use ps_export.',
  inputSchema: objectSchema({ path: filePath('Target .psd, .tif or .pdf'), document: documentName, overwrite }),
  handler: withNoClobber(['path']),
};

const listFonts = {
  name: 'ps_list_fonts',
  description:
    'Search installed fonts by name. Returns PostScript names to pass as font to ps_add_text / ps_set_text. ' +
    'For Nepali text search "devanagari".',
  inputSchema: objectSchema({
    query: { type: 'string', description: 'Case-insensitive substring, e.g. "avenir", "bold", "devanagari"' },
    limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
  }),
  annotations: { readOnlyHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const undo = {
  name: 'ps_undo',
  description:
    'Step back in the history. Every ps_* tool that changes a document is ONE history step, so steps = tool calls to undo.',
  inputSchema: objectSchema({ steps: { type: 'integer', minimum: 1, maximum: 100, default: 1 } }),
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const canvas = {
  name: 'ps_canvas',
  description:
    'Change the whole document. resize_image: scale everything to width and/or height px (aspect kept if one is given). ' +
    'resize_canvas: change the canvas to width x height without scaling, anchored at anchor. crop: keep the box x, y, w, h. ' +
    'rotate: rotate the canvas by angle degrees. trim: cut away transparent edges. flatten: merge all layers into one.',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['resize_image', 'resize_canvas', 'crop', 'rotate', 'trim', 'flatten'] },
      width: { type: 'integer', minimum: 1, maximum: MAX_CANVAS_PX, description: 'New width (px)' },
      height: { type: 'integer', minimum: 1, maximum: MAX_CANVAS_PX, description: 'New height (px)' },
      anchor: {
        type: 'string',
        enum: ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'],
        default: 'center',
        description: 'Which part stays put when resizing the canvas',
      },
      x: { type: 'number', description: 'Crop box left (px)' },
      y: { type: 'number', description: 'Crop box top (px)' },
      w: { type: 'number', exclusiveMinimum: 0, description: 'Crop box width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'Crop box height (px)' },
      angle: { type: 'number', minimum: -360, maximum: 360, default: 90, description: 'Rotation in degrees, clockwise' },
    },
    ['action'],
  ),
  annotations: { destructiveHint: true },
};

export const documentTools = Object.freeze([getDocumentInfo, newDocument, open, close, save, canvas, listFonts, undo]);
export const statusTool = status;
