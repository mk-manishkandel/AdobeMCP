/**
 * Library ai_* tools: swatches, symbols and graphic styles of the active document.
 */
import { artboard, itemName, itemRef, layer, objectSchema, paint, px } from './schemas.mjs';

const query = { type: 'string', description: 'For "list": only names containing this (case-insensitive)' };
const limit = { type: 'integer', minimum: 1, maximum: 1000, default: 100, description: 'For "list": maximum results' };

const swatch = {
  name: 'ai_swatch',
  description:
    'Document swatches. "list" shows names and kinds (color, spot, gradient, pattern). "add" saves a colour or gradient ' +
    'as a named swatch. Use any swatch (including patterns) as paint with fill/stroke "swatch:<name>".',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['list', 'add'] },
      name: { type: 'string', minLength: 1, description: 'For "add": the new swatch name' },
      color: paint('For "add": the swatch colour'),
      query,
      limit,
    },
    ['action'],
  ),
};

const symbol = {
  name: 'ai_symbol',
  description:
    'Symbols (reusable artwork). "list" shows them. "create" turns item into a symbol named symbol (replace: true also ' +
    'swaps the item for an instance). "place" puts an instance of symbol with its top-left at (x, y), optionally sized ' +
    'to w and/or h (proportional if only one is given).',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['list', 'create', 'place'] },
      symbol: { type: 'string', minLength: 1, description: 'Symbol name' },
      item: { ...itemRef, description: 'For "create": the artwork to turn into a symbol' },
      replace: { type: 'boolean', default: false, description: 'For "create": replace the item with an instance' },
      x: px('For "place": left'),
      y: px('For "place": top'),
      w: { type: 'number', exclusiveMinimum: 0, description: 'For "place": width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'For "place": height (px)' },
      artboard: artboard(),
      layer,
      name: itemName,
      query,
      limit,
    },
    ['action'],
  ),
};

const graphicStyle = {
  name: 'ai_graphic_style',
  description:
    'Graphic styles (saved appearances: fills, strokes, effects). "list" shows the document\'s styles; "apply" adds ' +
    'the style called name on top of each item\'s own appearance. merge: false replaces the appearance completely ' +
    '(styles without a fill, such as "Drop Shadow", then leave the item invisible).',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['list', 'apply'] },
      name: { type: 'string', minLength: 1, description: 'For "apply": style name' },
      items: { type: 'array', items: itemRef, minItems: 1, maxItems: 500, description: 'For "apply": items to style' },
      merge: { type: 'boolean', default: true, description: 'Keep the item\'s own fill/stroke and add the style' },
      query,
      limit,
    },
    ['action'],
  ),
};

export const libraryTools = Object.freeze([swatch, symbol, graphicStyle]);
