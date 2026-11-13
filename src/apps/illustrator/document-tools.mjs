/**
 * Document-level ai_* tools.
 */
import { artboard, color, filePath, itemRef, layer, objectSchema, overwrite, px, withNoClobber, withPaths } from './schemas.mjs';

/** Read-only and undo calls should never wait minutes; a long wait means a dialog is open. */
const QUICK_TIMEOUT_SEC = 60;

const getDocumentInfo = {
  name: 'ai_get_document_info',
  description:
    'Describe the active document: artboards (index, name, w, h), layers, and every top-level item with ' +
    'id, name, type (text/path/group/image/...), artboard, x/y/w/h (px from the top-left of the item\'s artboard, y down), ' +
    'opacity, hidden/locked, and per type: text (text, font PostScript name, size, color, align, overflow), ' +
    'path (fill, stroke, stroke_width), image (file, embedded), group (clipped, children). ' +
    'Use the returned ids with the other tools. Pass artboard to list only items on that artboard.',
  inputSchema: objectSchema({ artboard: artboard('Optional filter: only items whose centre lies on this artboard.') }),
  annotations: { readOnlyHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const newDocument = {
  name: 'ai_new_document',
  description:
    'Create a new document with one artboard of width x height px. Social sizes: post 1080x1080, portrait 1080x1350, ' +
    'story 1080x1920, landscape banner 1920x1080. Optional background colour goes on a locked bottom "Background" layer; ' +
    'new items go on the "Content" layer. Returns the document summary (artboards with indices).',
  inputSchema: objectSchema(
    {
      width: { type: 'number', minimum: 1, maximum: 16383, description: 'Artboard width (px)' },
      height: { type: 'number', minimum: 1, maximum: 16383, description: 'Artboard height (px)' },
      color_mode: { type: 'string', enum: ['rgb', 'cmyk'], default: 'rgb', description: 'rgb for screen/social, cmyk for print' },
      name: { type: 'string', minLength: 1, description: 'Document title' },
      artboard_name: { type: 'string', minLength: 1, description: 'Name of the first artboard, e.g. "Post"' },
      background: color('Background fill of the artboard'),
    },
    ['width', 'height'],
  ),
};

const open = {
  name: 'ai_open',
  description:
    'Open an .ai, .pdf, .svg or .eps file (e.g. a template) and make it the active document, or pass document to ' +
    'switch to a document that is already open (all other tools work on the active document).',
  inputSchema: objectSchema({
    path: filePath('File to open'),
    document: { type: 'string', minLength: 1, description: 'Name of an open document to make active (see ai_status)' },
  }),
  handler: withPaths(['path']),
};

const close = {
  name: 'ai_close',
  description: 'Close a document. Unsaved changes are discarded unless save is true (which needs a previously saved document).',
  inputSchema: objectSchema({
    document: { type: 'string', minLength: 1, description: 'Document name as shown by ai_status. Default: active document.' },
    save: { type: 'boolean', default: false, description: 'Save before closing' },
  }),
  annotations: { destructiveHint: true },
};

const save = {
  name: 'ai_save',
  description:
    'Save the document. With a path ending in .ai saves as Illustrator; ending in .pdf saves as (editable) PDF. ' +
    'Without a path re-saves to the existing file. Missing folders are created. Saving to a path that already exists ' +
    'needs overwrite: true.',
  inputSchema: objectSchema({
    path: filePath('Target .ai or .pdf file'),
    document: { type: 'string', minLength: 1, description: 'Document name. Default: active document.' },
    pdf_preset: { type: 'string', minLength: 1, description: 'PDF preset name, e.g. "[High Quality Print]" (pdf only)' },
    embed_linked_files: { type: 'boolean', default: false, description: 'Embed linked images when saving .ai' },
    overwrite,
  }),
  handler: withNoClobber(['path']),
};

const addArtboard = {
  name: 'ai_add_artboard',
  description:
    'Add an artboard (e.g. a size variant: story 1080x1920, banner 1920x1080) to the right of the existing ones. ' +
    'Returns its index. Content is not copied; use ai_set_item with duplicate + to_artboard, then reposition.',
  inputSchema: objectSchema(
    {
      width: { type: 'number', minimum: 1, maximum: 16383, description: 'Width (px)' },
      height: { type: 'number', minimum: 1, maximum: 16383, description: 'Height (px)' },
      name: { type: 'string', minLength: 1, description: 'Artboard name, e.g. "Story"' },
      background: color('Background fill on the locked Background layer'),
      gap: { type: 'number', minimum: 0, default: 100, description: 'Horizontal gap to the previous artboard (px)' },
      activate: { type: 'boolean', default: true, description: 'Make it the active artboard' },
    },
    ['width', 'height'],
  ),
};

const undo = {
  name: 'ai_undo',
  description:
    'Undo the last Illustrator operations. One tool call can create several undo steps, so prefer fixing items ' +
    'with ai_set_item; use this for quick reverts.',
  inputSchema: objectSchema({ steps: { type: 'integer', minimum: 1, maximum: 50, default: 1, description: 'Number of undo steps' } }),
  annotations: { destructiveHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const listFonts = {
  name: 'ai_list_fonts',
  description:
    'Search installed fonts. Returns PostScript names to use as "font" in ai_add_text / ai_set_text. ' +
    'All query words must match name, family or style, e.g. "montserrat bold" or "devanagari".',
  inputSchema: objectSchema({
    query: { type: 'string', description: 'Search words (case-insensitive). Empty lists everything.' },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 50, description: 'Maximum fonts returned' },
  }),
  annotations: { readOnlyHint: true },
  timeoutSec: QUICK_TIMEOUT_SEC,
};

const copyItems = {
  name: 'ai_copy_items',
  description:
    'Copy items from another OPEN document into the active one (reuse a logo, footer or whole block from an old ' +
    'design). Items keep their position relative to their artboard, or pass x/y to put the top-left of the copied ' +
    'group there. Text keeps its fonts; check ai_preview, since fonts that are not active render with a fallback.',
  inputSchema: objectSchema(
    {
      from_document: { type: 'string', minLength: 1, description: 'Name of the open source document (see ai_status)' },
      items: { type: 'array', items: itemRef, minItems: 1, maxItems: 200, description: 'Item ids or names in the source document' },
      x: px('Left of the copied group on the target artboard'),
      y: px('Top of the copied group on the target artboard'),
      artboard: artboard(),
      layer,
    },
    ['from_document', 'items'],
  ),
};

export const documentTools = Object.freeze([getDocumentInfo, newDocument, open, close, save, addArtboard, undo, listFonts, copyItems]);
