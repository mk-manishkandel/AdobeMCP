/**
 * Text ai_* tools.
 */
import { artboard, color, itemName, itemRef, layer, objectSchema, px } from './schemas.mjs';

const styleProps = {
  font: {
    type: 'string',
    minLength: 1,
    description:
      'PostScript font name from ai_list_fonts, e.g. "Montserrat-Bold". For Nepali/Devanagari use a Devanagari font ' +
      '(search ai_list_fonts "devanagari"); Indic text automatically uses the World-Ready composer.',
  },
  size: { type: 'number', minimum: 1, maximum: 1296, description: 'Font size (px = pt)' },
  color: color('Text colour'),
  align: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Paragraph alignment' },
  tracking: { type: 'integer', minimum: -1000, maximum: 10000, description: 'Letter spacing in 1/1000 em (0 = normal, 100 = wide)' },
  leading: { type: 'number', minimum: 0, description: 'Line height (px). Omit for automatic (120%).' },
  all_caps: { type: 'boolean', description: 'Display as ALL CAPS without changing the text' },
};

const addText = {
  name: 'ai_add_text',
  description:
    'Add text. POINT text (no width): a single frame that grows with the text; (x, y) is the TOP of the frame and x is ' +
    'its left edge for align "left", its CENTRE for "center", its right edge for "right" (so align "center" with ' +
    'x = artboard width / 2 centres the text). Line breaks with "\\n". AREA text (width given): text wraps inside the box ' +
    'x, y, width, height; without height the box is sized to fit. The result reports overflow for area text. ' +
    'Returns the item (id, x/y/w/h measured from the artboard top-left).',
  inputSchema: objectSchema(
    {
      text: { type: 'string', minLength: 1, description: 'The text (UTF-8, Nepali OK)' },
      x: px('Horizontal position, see description'),
      y: px('Top of the text frame from the artboard top'),
      width: { type: 'number', exclusiveMinimum: 0, description: 'Area text box width (px). Omit for point text.' },
      height: { type: 'number', exclusiveMinimum: 0, description: 'Area text box height (px). Omit to fit the text.' },
      ...styleProps,
      size: { ...styleProps.size, default: 48 },
      color: { ...styleProps.color, default: '#000000' },
      align: { ...styleProps.align, default: 'left' },
      artboard: artboard(),
      layer,
      name: itemName,
    },
    ['text', 'x', 'y'],
  ),
};

const setText = {
  name: 'ai_set_text',
  description:
    'Change an existing text item (template filling). Replaces the text and/or style; only given properties change. ' +
    'Point text keeps its anchor: top-left/top-centre/top-right by alignment, or the centre with keep_center. ' +
    'max_width shrinks point text proportionally until it fits that width (never below min_size). ' +
    'shrink_to_fit shrinks area text until nothing overflows. Returns the updated item.',
  inputSchema: objectSchema(
    {
      item: itemRef,
      text: { type: 'string', minLength: 1, description: 'New text ("\\n" for line breaks)' },
      ...styleProps,
      max_width: { type: 'number', exclusiveMinimum: 0, description: 'Point text: shrink font size until the text is at most this wide (px)' },
      shrink_to_fit: { type: 'boolean', default: false, description: 'Area text: shrink font size until there is no overflow' },
      min_size: { type: 'number', minimum: 1, default: 8, description: 'Smallest font size shrinking may use' },
      keep_center: { type: 'boolean', default: false, description: 'Keep the frame centre fixed instead of the aligned edge' },
      artboard: artboard("Default: the item's own artboard."),
    },
    ['item'],
  ),
};

export const textTools = Object.freeze([addText, setText]);
