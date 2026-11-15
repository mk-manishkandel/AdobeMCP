/**
 * Photoshop app definition: target, JSX files and the ps_* tool table.
 * Each tool runs the JSX function of the same name (jsx/photoshop*.jsx)
 * unless the tool has its own handler.
 */
import { documentTools, statusTool } from './document-tools.mjs';
import { exportTools } from './export-tools.mjs';
import { imageTools } from './image-tools.mjs';
import { layerTools } from './layer-tools.mjs';
import { objectSchema } from './schemas.mjs';
import { textTools } from './text-tools.mjs';

export const PHOTOSHOP_BUNDLE_ID = 'com.adobe.Photoshop';

export const PHOTOSHOP_JSX_FILES = Object.freeze([
  'photoshop.jsx',
  'photoshop-document.jsx',
  'photoshop-layers.jsx',
  'photoshop-text.jsx',
  'photoshop-image.jsx',
  'photoshop-export.jsx',
]);

export const PHOTOSHOP_INSTRUCTIONS = [
  'Adobe Photoshop tools (ps_*).',
  'Units: px. Coordinates: x/y from the TOP-LEFT of the canvas, y grows DOWNWARD; boxes are {x, y, w, h}.',
  'Layers are referenced by the id returned when they are created or listed (ps_get_document_info), or a unique name.',
  'Every ps_* call that changes a document is one history step (ps_undo steps = calls).',
  'Workflow: ps_status -> ps_new_document/ps_open -> ps_add_shape / ps_add_text / ps_place_image -> ps_layer_style /',
  'ps_adjust / ps_filter -> ps_preview to look at the result and fix it -> ps_export (png/jpg) or ps_save (psd).',
  'For Nepali text pick a Devanagari font via ps_list_fonts "devanagari".',
].join(' ');

const runScriptTool = {
  name: 'ps_run_script',
  description:
    'Escape hatch: run raw ExtendScript (ES3, no JSON object) inside Photoshop and return the value of the last expression. ' +
    'Return plain objects/arrays/strings/numbers; DOM objects come back as strings. Units are pixels and dialogs are ' +
    'suppressed. Changes made here are NOT grouped into one history step. Prefer the dedicated ps_* tools when one fits.',
  inputSchema: objectSchema(
    { code: { type: 'string', minLength: 1, description: 'ExtendScript source. Example: "app.activeDocument.layers.length"' } },
    ['code'],
  ),
  annotations: { destructiveHint: true },
};

export const PHOTOSHOP_TOOLS = Object.freeze([
  statusTool,
  ...documentTools,
  ...textTools,
  ...layerTools,
  ...imageTools,
  ...exportTools,
  runScriptTool,
]);

/** ps_run_script is on unless ADOBE_MCP_ALLOW_RUN_SCRIPT is "0" or "false". */
function runScriptAllowed(env) {
  return !/^(0|false)$/i.test(env.ADOBE_MCP_ALLOW_RUN_SCRIPT ?? '');
}

/** @param {Record<string,string|undefined>} env */
export function photoshopApp(env = {}) {
  return Object.freeze({
    id: 'photoshop',
    label: 'Adobe Photoshop',
    target: env.PS_APP || PHOTOSHOP_BUNDLE_ID,
    jsxFiles: PHOTOSHOP_JSX_FILES,
    instructions: PHOTOSHOP_INSTRUCTIONS,
    tools: runScriptAllowed(env) ? PHOTOSHOP_TOOLS : PHOTOSHOP_TOOLS.filter((t) => t !== runScriptTool),
  });
}
