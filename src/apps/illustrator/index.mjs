/**
 * Illustrator app definition: target, JSX files and the ai_* tool table.
 * Each tool runs the JSX function of the same name (jsx/illustrator*.jsx)
 * unless the tool has its own handler.
 */
import { documentTools } from './document-tools.mjs';
import { effectTools } from './effect-tools.mjs';
import { exportTools } from './export-tools.mjs';
import { itemTools } from './item-tools.mjs';
import { libraryTools } from './library-tools.mjs';
import { objectSchema } from './schemas.mjs';
import { qrTools } from './qr-tools.mjs';
import { structureTools } from './structure-tools.mjs';
import { textTools } from './text-tools.mjs';

export const ILLUSTRATOR_BUNDLE_ID = 'com.adobe.illustrator';

export const ILLUSTRATOR_JSX_FILES = Object.freeze([
  'illustrator.jsx',
  'illustrator-document.jsx',
  'illustrator-text.jsx',
  'illustrator-items.jsx',
  'illustrator-export.jsx',
  'illustrator-effects.jsx',
  'illustrator-transfer.jsx',
  'illustrator-structure.jsx',
  'illustrator-library.jsx',
  'illustrator-distort.jsx',
  'qr-encoder.jsx',
  'qr-draw.jsx',
  'illustrator-qr.jsx',
]);

export const ILLUSTRATOR_INSTRUCTIONS = [
  'Adobe Illustrator tools (ai_*).',
  'Units: px (1 px = 1 pt in Illustrator).',
  'Coordinates: x/y are measured from the TOP-LEFT corner of the artboard, y grows DOWNWARD;',
  'boxes are {x, y, w, h} with (x, y) the top-left corner. Artboards are 0-based; create tools default to the active',
  "artboard, edit tools to the item's own artboard.",
  'Colours are "#RRGGBB" strings. Items are referenced by the id returned when they are created or listed.',
  'Workflow: ai_status -> ai_new_document/ai_open -> add/edit items -> ai_preview to look at the result and fix it ->',
  'ai_export. For Nepali text pick a Devanagari font via ai_list_fonts "devanagari".',
].join(' ');

const statusTool = {
  name: 'ai_status',
  description:
    'Report Illustrator version and every open document (name, path, saved state, colour space); artboards with sizes ' +
    'and the active artboard are listed for the active document only (Illustrator cannot read them for the others). ' +
    'Call this first to check that Illustrator is reachable.',
  inputSchema: objectSchema({}),
  annotations: { readOnlyHint: true },
  timeoutSec: 30,
};

const runScriptTool = {
  name: 'ai_run_script',
  description:
    'Escape hatch: run raw ExtendScript (ES3, no JSON object) inside Illustrator and return the value of the last expression. ' +
    'Return plain objects/arrays/strings/numbers; DOM objects come back as strings. ' +
    'Raw scripts see Illustrator NATIVE document coordinates (y grows UP), not the top-left convention of the other tools. ' +
    'Dialogs are suppressed. Prefer the dedicated ai_* tools when one fits.',
  inputSchema: objectSchema(
    { code: { type: 'string', minLength: 1, description: 'ExtendScript source. Example: "app.activeDocument.layers.length"' } },
    ['code'],
  ),
  annotations: { destructiveHint: true },
};

export const ILLUSTRATOR_TOOLS = Object.freeze([
  statusTool,
  ...documentTools,
  ...textTools,
  ...itemTools,
  ...structureTools,
  ...libraryTools,
  ...effectTools,
  ...qrTools,
  ...exportTools,
  runScriptTool,
]);

/** ai_run_script is on unless ADOBE_MCP_ALLOW_RUN_SCRIPT is "0" or "false". */
function runScriptAllowed(env) {
  return !/^(0|false)$/i.test(env.ADOBE_MCP_ALLOW_RUN_SCRIPT ?? '');
}

/** @param {Record<string,string|undefined>} env */
export function illustratorApp(env = {}) {
  return Object.freeze({
    id: 'illustrator',
    label: 'Adobe Illustrator',
    target: env.AI_APP || ILLUSTRATOR_BUNDLE_ID,
    jsxFiles: ILLUSTRATOR_JSX_FILES,
    instructions: ILLUSTRATOR_INSTRUCTIONS,
    tools: runScriptAllowed(env) ? ILLUSTRATOR_TOOLS : ILLUSTRATOR_TOOLS.filter((t) => t !== runScriptTool),
  });
}
