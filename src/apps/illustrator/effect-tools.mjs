/**
 * Effect ai_* tools: distortions, faux-3D extrusion and Image Trace.
 */
import { COLOR_PATTERN, itemName, itemRef, objectSchema } from './schemas.mjs';

export const WARP_STYLES = Object.freeze([
  'arc', 'arc_lower', 'arc_upper', 'arch', 'bulge', 'shell_lower', 'shell_upper', 'flag', 'wave', 'fish', 'rise',
  'fisheye', 'inflate', 'squeeze', 'twist',
]);

const distort = {
  name: 'ai_distort',
  description:
    'Distort an item. warp: Illustrator warp (style, amount = bend %, horizontal/vertical distortion %, direction). ' +
    'twirl: swirl by angle. roughen: jagged/rough edges (size % of the item, detail per inch, smooth). warp, twirl and ' +
    'roughen are live effects (expand: true turns them into plain paths). pucker_bloat: amount < 0 pulls edges in ' +
    '(pucker), > 0 pushes them out (bloat); reshapes the paths. extrude: solid 3D-style depth behind the item ' +
    '(depth px, angle 0 = right, 90 = down, side color; returned as extrude_id). Works on shapes, text and groups.',
  inputSchema: objectSchema(
    {
      item: itemRef,
      effect: { type: 'string', enum: ['warp', 'twirl', 'roughen', 'pucker_bloat', 'extrude'] },
      style: { type: 'string', enum: [...WARP_STYLES], default: 'arc', description: 'Warp style' },
      amount: { type: 'number', minimum: -200, maximum: 200, default: 50, description: 'Warp bend % (-100..100) or pucker/bloat %' },
      horizontal: { type: 'number', minimum: -100, maximum: 100, default: 0, description: 'Warp horizontal distortion %' },
      vertical: { type: 'number', minimum: -100, maximum: 100, default: 0, description: 'Warp vertical distortion %' },
      direction: { type: 'string', enum: ['horizontal', 'vertical'], default: 'horizontal', description: 'Warp direction' },
      angle: { type: 'number', minimum: -3600, maximum: 3600, default: 45, description: 'Twirl angle, or extrude direction (degrees)' },
      size: { type: 'number', minimum: 0, maximum: 100, default: 5, description: 'Roughen size (% of the item)' },
      detail: { type: 'number', minimum: 0, maximum: 100, default: 10, description: 'Roughen detail (points per inch)' },
      smooth: { type: 'boolean', default: false, description: 'Roughen with smooth points instead of corners' },
      depth: { type: 'number', exclusiveMinimum: 0, maximum: 500, default: 20, description: 'Extrude depth (px)' },
      color: { type: 'string', pattern: COLOR_PATTERN, description: 'Extrude side colour "#RRGGBB" (default: darker fill)' },
      expand: { type: 'boolean', default: false, description: 'Expand a live effect into plain paths' },
    },
    ['item', 'effect'],
  ),
};

const traceImage = {
  name: 'ai_trace_image',
  description:
    'Image Trace: turn a placed or embedded image into vector paths using a tracing preset (e.g. "[Default]", ' +
    '"Black and White Logo", "6 Colors", "High Fidelity Photo"). list_presets: true lists the exact names. ' +
    'expand (default) returns editable paths as a group; expand: false keeps a live tracing object.',
  inputSchema: objectSchema({
    item: { ...itemRef, description: 'The image to trace' },
    preset: { type: 'string', minLength: 1, default: '[Default]' },
    expand: { type: 'boolean', default: true },
    list_presets: { type: 'boolean', default: false },
    name: itemName,
  }),
  timeoutSec: 300,
};

export const effectTools = Object.freeze([distort, traceImage]);
