/**
 * QR ai_* tool: native vector QR codes (encoder in jsx/qr-encoder.jsx, drawing in jsx/illustrator-qr.jsx).
 */
import { artboard, itemName, layer, objectSchema, paint, px } from './schemas.mjs';

/** Byte-mode capacity of version 40 at ECC L; longer text can never fit. */
export const QR_MAX_TEXT_LENGTH = 2953;

const qrCode = {
  name: 'ai_qr_code',
  description:
    'Create a scannable QR code as native vector art: one compound path of merged module outlines (no stray squares or ' +
    'hairline seams), grouped with a background square that includes the quiet zone. text is anything a QR holds: a URL, ' +
    '"WIFI:T:WPA;S:<ssid>;P:<password>;;", "mailto:...", "tel:...", plain or Nepali/Unicode text (UTF-8). ' +
    'size is the full width including the quiet zone; (x, y) is its top-left (default: centred on the artboard). ' +
    'ecc: L 7%, M 15%, Q 25%, H 30% damage tolerance (use H when a logo will cover the middle). ' +
    'style "dots" draws round modules with square finder eyes. Keep strong contrast (dark fill on light background). ' +
    'Returns the group plus qr {version, ecc, modules, module_size}.',
  inputSchema: objectSchema(
    {
      text: { type: 'string', minLength: 1, maxLength: QR_MAX_TEXT_LENGTH, description: 'Content to encode' },
      x: px('Left of the code (including the quiet zone)'),
      y: px('Top of the code (including the quiet zone)'),
      size: { type: 'number', minimum: 10, maximum: 10000, default: 200, description: 'Width = height in px, quiet zone included' },
      ecc: { type: 'string', enum: ['L', 'M', 'Q', 'H'], default: 'M', description: 'Error correction level' },
      quiet_zone: { type: 'integer', minimum: 0, maximum: 16, default: 4, description: 'Blank border in modules (spec: 4)' },
      min_version: { type: 'integer', minimum: 1, maximum: 40, description: 'Force at least this QR version (denser grid)' },
      style: { type: 'string', enum: ['square', 'dots'], default: 'square', description: 'Module shape' },
      fill: paint('Module colour', { default: '#000000' }),
      background: paint('Background colour ("none" for transparent)', { default: '#FFFFFF' }),
      artboard: artboard(),
      layer,
      name: itemName,
    },
    ['text'],
  ),
  timeoutSec: 180,
};

export const qrTools = Object.freeze([qrCode]);
