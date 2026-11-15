/**
 * Photoshop-specific JSON-schema fragments; app-neutral ones come from ../shared-schemas.mjs.
 */
export {
  COLOR_PATTERN, PATH_PATTERN, color, expandPaths, filePath, objectSchema, overwrite, px, withNoClobber, withPaths,
} from '../shared-schemas.mjs';

export const BLEND_MODES = Object.freeze([
  'normal', 'dissolve', 'darken', 'multiply', 'color_burn', 'linear_burn', 'lighten', 'screen', 'color_dodge',
  'linear_dodge', 'overlay', 'soft_light', 'hard_light', 'vivid_light', 'linear_light', 'pin_light', 'hard_mix',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
]);

/** Read-only and undo calls should never wait minutes; a long wait means a dialog is open. */
export const QUICK_TIMEOUT_SEC = 60;

export const layerRef = {
  type: ['string', 'integer'],
  description: 'Layer id (from ps_get_document_info or a create tool) or its unique name',
};

export const layerRefs = {
  type: 'array',
  items: layerRef,
  minItems: 1,
  maxItems: 500,
  description: 'Layer ids or unique names',
};

export const documentName = {
  type: 'string',
  minLength: 1,
  description: 'Name of an open document (see ps_status). Default: the active document.',
};

export const layerName = { type: 'string', minLength: 1, maxLength: 255, description: 'Layer name' };

export const groupName = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  description: 'Put the new layer in this group (layer set); it is created if missing',
};

export const opacity = (fallback) => ({ type: 'number', minimum: 0, maximum: 100, default: fallback, description: 'Opacity %' });
