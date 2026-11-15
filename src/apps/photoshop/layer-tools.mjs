/**
 * Layer ps_* tools: shapes, images, editing, groups, alignment.
 */
import {
  BLEND_MODES, color, filePath, groupName, layerName, layerRef, layerRefs, objectSchema, opacity, px, withPaths,
} from './schemas.mjs';

const size = (description) => ({ type: 'number', exclusiveMinimum: 0, description: `${description} (px)` });

const addShape = {
  name: 'ps_add_shape',
  description:
    'Add a vector shape layer filling the box x, y, w, h (top-left corner, y down): rectangle, rounded_rectangle ' +
    '(radius) or ellipse. Shapes stay sharp when resized; recolour with ps_set_layer color, add strokes, shadows or ' +
    'gradients with ps_layer_style.',
  inputSchema: objectSchema(
    {
      shape: { type: 'string', enum: ['rectangle', 'rounded_rectangle', 'ellipse'] },
      x: px('Left'),
      y: px('Top'),
      w: size('Width'),
      h: size('Height'),
      fill: color('Fill colour', { default: '#CCCCCC' }),
      radius: { type: 'number', minimum: 0, default: 24, description: 'Corner radius for rounded_rectangle (px)' },
      opacity: opacity(100),
      name: layerName,
      group: groupName,
    },
    ['shape', 'x', 'y', 'w', 'h'],
  ),
};

const placeImage = {
  name: 'ps_place_image',
  description:
    'Place an image file (jpg, png, psd, tif, pdf, svg, ai...) as an embedded smart object, so it can be resized without ' +
    'losing quality. mode "fill" covers the box x, y, w, h and hides the rest with a mask (photos); "fit" shows the whole ' +
    'image inside the box (logos); "stretch" distorts to the box; "none" keeps its natural size with its top-left at (x, y).',
  inputSchema: objectSchema(
    {
      path: filePath('Image to place'),
      x: px('Box left', { default: 0 }),
      y: px('Box top', { default: 0 }),
      w: size('Box width'),
      h: size('Box height'),
      mode: { type: 'string', enum: ['fill', 'fit', 'stretch', 'none'], default: 'fill' },
      name: layerName,
      group: groupName,
    },
    ['path'],
  ),
  handler: withPaths(['path']),
  timeoutSec: 300,
};

const setLayer = {
  name: 'ps_set_layer',
  description:
    'Change a layer: move (x, y = new top-left), resize (w and/or h, or scale %), rotate (degrees, around the centre), ' +
    'opacity, fill_opacity (keeps layer styles visible), blend_mode, visible, color (shape/fill layers), name, arrange ' +
    '(front/back/forward/backward), group (move into a group), clip (clip to the layer below), locked. duplicate: true ' +
    'edits a copy (returned). delete: true removes the layer. A background layer becomes a normal layer when moved.',
  inputSchema: objectSchema(
    {
      layer: layerRef,
      x: px('New left'),
      y: px('New top'),
      w: size('New width'),
      h: size('New height'),
      scale: { type: 'number', exclusiveMinimum: 0, maximum: 10000, description: 'Uniform scale %, e.g. 50' },
      rotate: { type: 'number', minimum: -360, maximum: 360, description: 'Rotate by degrees (clockwise)' },
      opacity: { type: 'number', minimum: 0, maximum: 100, description: 'Opacity %' },
      fill_opacity: { type: 'number', minimum: 0, maximum: 100, description: 'Fill opacity % (layer effects stay)' },
      blend_mode: { type: 'string', enum: [...BLEND_MODES] },
      visible: { type: 'boolean' },
      color: color('New fill colour for a shape or solid-fill layer'),
      name: layerName,
      arrange: { type: 'string', enum: ['front', 'back', 'forward', 'backward'] },
      group: { type: 'string', minLength: 1, maxLength: 255, description: 'Move into this group (created if missing)' },
      clip: { type: 'boolean', description: 'Clip to the layer below (clipping mask)' },
      locked: { type: 'boolean' },
      duplicate: { type: 'boolean', default: false, description: 'Apply the changes to a copy' },
      delete: { type: 'boolean', default: false, description: 'Delete the layer' },
    },
    ['layer'],
  ),
  annotations: { destructiveHint: true },
};

const group = {
  name: 'ps_group',
  description: 'group: put layers into a new group (layer set) named name. ungroup: take the group layer apart.',
  inputSchema: objectSchema({
    action: { type: 'string', enum: ['group', 'ungroup'], default: 'group' },
    layers: layerRefs,
    layer: { ...layerRef, description: 'Group to ungroup (id or name)' },
    name: layerName,
  }),
};

const align = {
  name: 'ps_align',
  description:
    'Align layers to the canvas: horizontal left/center/right and/or vertical top/middle/bottom, with margin px from ' +
    'the edge. as_group: true moves the layers together, keeping their positions relative to each other.',
  inputSchema: objectSchema(
    {
      layers: layerRefs,
      horizontal: { type: 'string', enum: ['left', 'center', 'right'] },
      vertical: { type: 'string', enum: ['top', 'middle', 'bottom'] },
      margin: { type: 'number', minimum: 0, default: 0, description: 'Distance from the canvas edge (px)' },
      as_group: { type: 'boolean', default: false },
    },
    ['layers'],
  ),
};

export const layerTools = Object.freeze([addShape, placeImage, setLayer, group, align]);
