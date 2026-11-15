/**
 * Text ps_* tools.
 */
import { color, groupName, layerName, layerRef, objectSchema, px } from './schemas.mjs';

const MAX_TEXT_PX = 5000;

const textStyle = {
  font: { type: 'string', minLength: 1, description: 'PostScript font name from ps_list_fonts, e.g. "AvenirNext-Bold"' },
  size: { type: 'number', minimum: 1, maximum: MAX_TEXT_PX, description: 'Font size (px)' },
  color: color('Text colour'),
  align: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Alignment (justify: paragraph text only)' },
  tracking: { type: 'number', minimum: -1000, maximum: 10000, description: 'Letter spacing in 1/1000 em' },
  leading: { type: 'number', minimum: 0, maximum: MAX_TEXT_PX, description: 'Line spacing (px); default auto' },
  all_caps: { type: 'boolean', description: 'Display in capitals' },
};

const addText = {
  name: 'ps_add_text',
  description:
    'Add a text layer (Unicode, including Nepali/Devanagari: pick a Devanagari font via ps_list_fonts). Point text: ' +
    '(x, y) is the TOP of the text, x its left edge, centre or right edge by align. Give width (and optionally height) for ' +
    'paragraph text that wraps inside the box whose top-left is (x, y). Use \\n for new lines.',
  inputSchema: objectSchema(
    {
      text: { type: 'string', minLength: 1, maxLength: 20000 },
      x: px('Anchor x'),
      y: px('Top of the text'),
      ...textStyle,
      size: { ...textStyle.size, default: 48 },
      color: { ...textStyle.color, default: '#000000' },
      align: { ...textStyle.align, default: 'left' },
      width: { type: 'number', exclusiveMinimum: 0, description: 'Paragraph box width (px); omit for point text' },
      height: { type: 'number', exclusiveMinimum: 0, description: 'Paragraph box height (px)' },
      name: layerName,
      group: groupName,
    },
    ['text', 'x', 'y'],
  ),
};

const setText = {
  name: 'ps_set_text',
  description:
    'Edit a text layer: new text and/or style. Point text keeps its anchor (left/centre/right edge and top) or, with ' +
    'keep_center, its centre. max_width shrinks the font until the line fits (not below min_size).',
  inputSchema: objectSchema(
    {
      layer: layerRef,
      text: { type: 'string', minLength: 1, maxLength: 20000 },
      ...textStyle,
      max_width: { type: 'number', exclusiveMinimum: 0, description: 'Shrink point text to fit this width (px)' },
      min_size: { type: 'number', minimum: 1, default: 8, description: 'Smallest size max_width may use (px)' },
      keep_center: { type: 'boolean', default: false, description: 'Keep the centre instead of the aligned edge' },
    },
    ['layer'],
  ),
};

export const textTools = Object.freeze([addText, setText]);
