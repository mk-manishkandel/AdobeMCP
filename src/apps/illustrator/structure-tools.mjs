/**
 * Structure ai_* tools: groups and clipping masks, pathfinder, layers.
 */
import { itemName, itemRef, objectSchema } from './schemas.mjs';

const itemList = (description, minItems = 1) => ({ type: 'array', items: itemRef, minItems, maxItems: 500, description });

const group = {
  name: 'ai_group',
  description:
    'Group items, ungroup a group, or make a clipping mask. "group": items become one group (stacking order kept). ' +
    '"clip": items are shown only inside the outline of mask (a shape or text), like Object > Clipping Mask; ' +
    'the result is a clipping group. "ungroup": item (a group) is taken apart; for a clipping group the mask shape ' +
    'is deleted. Returns the new group, or the ungrouped items.',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['group', 'clip', 'ungroup'] },
      items: itemList('Items to group or clip'),
      mask: { ...itemRef, description: 'For "clip": the shape or text that defines the visible area' },
      item: { ...itemRef, description: 'For "ungroup": the group' },
      name: itemName,
    },
    ['action'],
  ),
};

const pathfinder = {
  name: 'ai_pathfinder',
  description:
    'Combine shapes into new geometry (Pathfinder). unite merges them; minus_front cuts the front shapes out of the ' +
    'back-most one; minus_back the reverse; intersect keeps only the overlap; exclude keeps the non-overlapping parts; ' +
    'divide splits into all pieces (returned as a group). The result takes the paint of the front-most shape and ' +
    'replaces the originals.',
  inputSchema: objectSchema(
    {
      items: itemList('Shapes to combine (at least 2)', 2),
      operation: { type: 'string', enum: ['unite', 'minus_front', 'minus_back', 'intersect', 'exclude', 'divide'] },
      name: itemName,
    },
    ['items', 'operation'],
  ),
  annotations: { destructiveHint: true },
};

const layerTool = {
  name: 'ai_layer',
  description:
    'Manage layers: list them; add a new one; update one (new_name, visible, locked, position top/bottom); or delete ' +
    'one (a layer with items needs delete_items: true). Move items onto a layer with ai_set_item layer.',
  inputSchema: objectSchema(
    {
      action: { type: 'string', enum: ['list', 'add', 'update', 'delete'] },
      name: { type: 'string', minLength: 1, description: 'Layer name' },
      new_name: { type: 'string', minLength: 1, description: 'For "update": rename to this' },
      visible: { type: 'boolean' },
      locked: { type: 'boolean' },
      position: { type: 'string', enum: ['top', 'bottom'], description: 'Move the layer to the top or bottom of the stack' },
      delete_items: { type: 'boolean', default: false, description: 'For "delete": also delete the items on it' },
    },
    ['action'],
  ),
};

export const structureTools = Object.freeze([group, pathfinder, layerTool]);
