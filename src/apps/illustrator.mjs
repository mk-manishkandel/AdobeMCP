/**
 * Illustrator app definition: target, JSX files and the ai_* tool table.
 * Each tool's JSX implementation is the function of the same name in jsx/illustrator.jsx.
 */

export const ILLUSTRATOR_BUNDLE_ID = 'com.adobe.illustrator';

export const ILLUSTRATOR_INSTRUCTIONS = [
  'Adobe Illustrator tools (ai_*).',
  'Units: px (1 px = 1 pt in Illustrator).',
  'Coordinates: x/y are measured from the TOP-LEFT corner of the artboard, y grows DOWNWARD;',
  'boxes are {x, y, w, h} with (x, y) the top-left corner. Artboards are 0-based; tools default to the active artboard.',
  'Colours are "#RRGGBB" strings.',
  'Workflow: ai_status -> ai_new_document/ai_open -> add/edit items -> ai_get_document_info and ai_preview to check -> ai_export.',
].join(' ');

const statusTool = {
  name: 'ai_status',
  description:
    'Report Illustrator version and every open document (name, path, colour space, artboards with sizes, active artboard). ' +
    'Call this first to check that Illustrator is reachable.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};

const runScriptTool = {
  name: 'ai_run_script',
  description:
    'Escape hatch: run raw ExtendScript (ES3, no JSON object) inside Illustrator and return the value of the last expression. ' +
    'Return plain objects/arrays/strings/numbers; DOM objects come back as strings. ' +
    'Raw scripts see Illustrator NATIVE document coordinates (y grows UP), not the top-left convention of the other tools. ' +
    'Dialogs are suppressed. Prefer the dedicated ai_* tools when one fits.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', minLength: 1, description: 'ExtendScript source. Example: "app.activeDocument.layers.length"' },
    },
    required: ['code'],
    additionalProperties: false,
  },
  annotations: { destructiveHint: true },
};

/** @param {Record<string,string|undefined>} env */
export function illustratorApp(env = {}) {
  return Object.freeze({
    id: 'illustrator',
    label: 'Adobe Illustrator',
    target: env.AI_APP || ILLUSTRATOR_BUNDLE_ID,
    jsxFiles: Object.freeze(['illustrator.jsx']),
    instructions: ILLUSTRATOR_INSTRUCTIONS,
    tools: Object.freeze([statusTool, runScriptTool]),
  });
}
