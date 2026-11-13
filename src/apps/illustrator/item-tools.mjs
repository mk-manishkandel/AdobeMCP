/**
 * Item ai_* tools: shapes, images, editing, alignment.
 */
import { artboard, filePath, itemName, itemRef, layer, objectSchema, paint, px, withPaths } from './schemas.mjs';

const addShape = {
  name: 'ai_add_shape',
  description:
    'Draw a shape. rectangle / rounded_rectangle / ellipse / polygon / star fill the box x, y, w, h (top-left corner, y down). ' +
    'line goes from (x, y) to (x2, y2) and uses stroke. Default fill #CCCCCC and no stroke (line: stroke #000000, 1 px).',
  inputSchema: objectSchema(
    {
      shape: { type: 'string', enum: ['rectangle', 'rounded_rectangle', 'ellipse', 'polygon', 'star', 'line'] },
      x: px('Left of the box / line start x'),
      y: px('Top of the box / line start y'),
      w: { type: 'number', exclusiveMinimum: 0, description: 'Box width (px)' },
      h: { type: 'number', exclusiveMinimum: 0, description: 'Box height (px)' },
      x2: px('Line end x'),
      y2: px('Line end y'),
      fill: paint('Fill colour'),
      stroke: paint('Stroke colour'),
      stroke_width: { type: 'number', minimum: 0, description: 'Stroke width (px)' },
      radius: { type: 'number', minimum: 0, default: 24, description: 'Corner radius for rounded_rectangle (px)' },
      sides: { type: 'integer', minimum: 3, maximum: 100, default: 6, description: 'Polygon sides' },
      points: { type: 'integer', minimum: 3, maximum: 100, default: 5, description: 'Star points' },
      inner_ratio: { type: 'number', exclusiveMinimum: 0, maximum: 1, default: 0.5, description: 'Star inner/outer radius ratio' },
      opacity: { type: 'number', minimum: 0, maximum: 100, default: 100, description: 'Opacity %' },
      artboard: artboard(),
      layer,
      name: itemName,
    },
    ['shape', 'x', 'y'],
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
    'Locked items are unlocked for the edit and re-locked. Returns the (new) item.',
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
      arrange: { type: 'string', enum: ['bring_to_front', 'bring_forward', 'send_backward', 'send_to_back'] },
      layer: { ...layer, description: 'Move the item to this layer (created if missing)' },
      duplicate: { type: 'boolean', default: false, description: 'Duplicate first and edit the copy' },
      to_artboard: { type: 'integer', minimum: 0, description: 'With duplicate: artboard to put the copy on (same relative position)' },
      delete: { type: 'boolean', default: false, description: 'Delete the item (other edits are ignored)' },
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
