/**
 * Item ai_* tools: shapes, images, editing, alignment.
 */
import {
  COLOR_PATTERN, artboard, filePath, itemName, itemRef, layer, objectSchema, paint, px, strokeStyle, vertex, withPaths,
} from './schemas.mjs';

const effectColor = { type: 'string', pattern: COLOR_PATTERN, description: '"#RRGGBB"' };

const addShape = {
  name: 'ai_add_shape',
  description:
    'Draw a shape. rectangle / rounded_rectangle / ellipse / polygon / star fill the box x, y, w, h (top-left corner, y down). ' +
    'line goes from (x, y) to (x2, y2) and uses stroke. path draws through vertices [[x, y], ...] (closed: true for a ' +
    'polygon; x and y are ignored); a vertex {x, y, in: [x, y], out: [x, y]} adds Bezier handles for curves. ' +
    'fill accepts a gradient or "swatch:<name>". dash / cap / join style the stroke. Default fill #CCCCCC and no stroke ' +
    '(line and open path: stroke #000000, 1 px, no fill).',
  inputSchema: objectSchema(
    {
      shape: { type: 'string', enum: ['rectangle', 'rounded_rectangle', 'ellipse', 'polygon', 'star', 'line', 'path'] },
      vertices: {
        type: 'array',
        items: vertex,
        minItems: 2,
        maxItems: 5000,
        description: 'For shape "path": points [[x, y], ...] or {x, y, in, out} in px from the artboard top-left',
      },
      closed: { type: 'boolean', default: false, description: 'For shape "path": close it into a polygon' },
      x: px('Left of the box / line start x'),
      y: px('Top of the box / line start y'),
      w: { type: 'number', exclusiveMinimum: 0, description: 'Box width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'Box height (px)' },
      x2: px('Line end x'),
      y2: px('Line end y'),
      fill: paint('Fill colour'),
      stroke: paint('Stroke colour'),
      stroke_width: { type: 'number', minimum: 0, description: 'Stroke width (px)' },
      ...strokeStyle,
      radius: { type: 'number', minimum: 0, default: 24, description: 'Corner radius for rounded_rectangle (px)' },
      sides: { type: 'integer', minimum: 3, maximum: 100, default: 6, description: 'Polygon sides' },
      points: { type: 'integer', minimum: 3, maximum: 100, default: 5, description: 'Star points' },
      inner_ratio: { type: 'number', exclusiveMinimum: 0, maximum: 1, default: 0.5, description: 'Star inner/outer radius ratio' },
      opacity: { type: 'number', minimum: 0, maximum: 100, default: 100, description: 'Opacity %' },
      artboard: artboard(),
      layer,
      name: itemName,
    },
    ['shape'],
  ),
};

const placeImage = {
  name: 'ai_place_image',
  description:
    'Place an image (jpg/png/psd/tif/pdf/ai linked or embedded; svg is imported as editable vector art) into the box x, y, w, h. mode "fill" covers the box and crops the rest ' +
    'with a clipping group (photos); "fit" shows the whole image inside the box (logos); "stretch" distorts to the box; ' +
    '"none" places at natural size with its top-left at (x, y). focus picks which part stays visible (fill) or where ' +
    'it sits (fit). Linked by default; embed=true embeds it into the document.',
  inputSchema: objectSchema(
    {
      path: filePath('Image file'),
      x: px('Box left'),
      y: px('Box top'),
      w: { type: 'number', exclusiveMinimum: 0, description: 'Box width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'Box height (px)' },
      mode: { type: 'string', enum: ['fit', 'fill', 'stretch', 'none'], default: 'fit' },
      focus: { type: 'string', enum: ['center', 'top', 'bottom', 'left', 'right'], default: 'center' },
      embed: { type: 'boolean', default: false, description: 'Embed instead of linking' },
      artboard: artboard(),
      layer,
      name: itemName,
    },
    ['path', 'x', 'y'],
  ),
  handler: withPaths(['path']),
};

const setItem = {
  name: 'ai_set_item',
  description:
    'Edit one item: move (x/y = new top-left of its visible box), resize (w/h; keep_aspect when only one is given), ' +
    'rotate (degrees, positive = counter-clockwise), opacity, hide, lock, rename, recolour (fill/stroke for paths, fill for text), ' +
    'arrange (z-order), move to a layer, duplicate (edits then apply to the copy; to_artboard puts the copy at the same ' +
    'relative position on another artboard), or delete. Coordinates are relative to the item\'s own artboard unless artboard is given. ' +
    'fill/stroke accept gradients and also work on whole groups. outline turns text into one shape (needed for a gradient ' +
    'on text). glow / shadow add a blurred copy behind the item (ids returned as glow_id / shadow_id); blur blurs the item. ' +
    'Order: duplicate, outline, edits, effects. Locked items are unlocked for the edit and re-locked. Returns the (new) item.',
  inputSchema: objectSchema(
    {
      item: itemRef,
      x: px('New left of the visible box'),
      y: px('New top of the visible box'),
      w: { type: 'number', exclusiveMinimum: 0, description: 'New width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'New height (px)' },
      keep_aspect: { type: 'boolean', default: true, description: 'When only w or h is given, scale the other proportionally' },
      rotate: { type: 'number', description: 'Rotate by this many degrees (counter-clockwise positive)' },
      opacity: { type: 'number', minimum: 0, maximum: 100, description: 'Opacity %' },
      hidden: { type: 'boolean' },
      locked: { type: 'boolean' },
      name: itemName,
      fill: paint('Fill colour (paths) or text colour'),
      stroke: paint('Stroke colour (paths)'),
      stroke_width: { type: 'number', minimum: 0, description: 'Stroke width (px, paths)' },
      ...strokeStyle,
      blend_mode: {
        type: 'string',
        enum: [
          'normal', 'multiply', 'screen', 'overlay', 'soft_light', 'hard_light', 'color_dodge', 'color_burn',
          'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
        ],
        description: 'Transparency blend mode',
      },
      arrange: { type: 'string', enum: ['bring_to_front', 'bring_forward', 'send_backward', 'send_to_back'] },
      layer: { ...layer, description: 'Move the item to this layer (created if missing)' },
      duplicate: { type: 'boolean', default: false, description: 'Duplicate first and edit the copy' },
      to_artboard: { type: 'integer', minimum: 0, description: 'With duplicate: artboard to put the copy on (same relative position)' },
      delete: { type: 'boolean', default: false, description: 'Delete the item (other edits are ignored)' },
      outline: { type: 'boolean', default: false, description: 'Text only: convert to a single outlined shape first' },
      glow: {
        type: 'object',
        properties: {
          radius: { type: 'number', minimum: 0, maximum: 250, default: 12, description: 'Blur radius (px)' },
          opacity: { type: 'number', minimum: 0, maximum: 100, default: 70 },
          color: { ...effectColor, description: 'Glow colour; default: the item\'s own colours' },
        },
        additionalProperties: false,
        description: 'Soft glow behind the item',
      },
      shadow: {
        type: 'object',
        properties: {
          x: { type: 'number', default: 0, description: 'Offset right (px)' },
          y: { type: 'number', default: 8, description: 'Offset down (px)' },
          blur: { type: 'number', minimum: 0, maximum: 250, default: 12, description: 'Blur radius (px)' },
          opacity: { type: 'number', minimum: 0, maximum: 100, default: 40 },
          color: { ...effectColor, default: '#000000' },
        },
        additionalProperties: false,
        description: 'Drop shadow behind the item',
      },
      blur: { type: 'number', minimum: 0, maximum: 250, description: 'Gaussian blur radius applied to the item itself (px)' },
      artboard: artboard("Default: the item's own artboard."),
    },
    ['item'],
  ),
};

const align = {
  name: 'ai_align',
  description:
    'Align items to their artboard with an optional margin, e.g. horizontal "center" to centre a headline, or ' +
    'vertical "bottom" + margin 60 for a footer. as_group moves the items together, keeping their relative layout.',
  inputSchema: objectSchema(
    {
      items: { type: 'array', items: itemRef, minItems: 1, maxItems: 200, description: 'Item ids or names' },
      horizontal: { type: 'string', enum: ['left', 'center', 'right'] },
      vertical: { type: 'string', enum: ['top', 'center', 'bottom'] },
      margin: { type: 'number', minimum: 0, default: 0, description: 'Distance from the artboard edge for left/right/top/bottom (px)' },
      as_group: { type: 'boolean', default: false, description: 'Align the combined bounds and move all items together' },
      artboard: artboard("Default: the first item's artboard."),
    },
    ['items'],
  ),
};

export const itemTools = Object.freeze([addShape, placeImage, setItem, align]);
