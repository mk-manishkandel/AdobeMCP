/**
 * App registry. Phase 2 (Photoshop) adds `photoshopApp(env)` here with
 * target from PS_APP, jsxFiles ['photoshop.jsx'] and a ps_* tool table.
 */
import { illustratorApp } from './illustrator/index.mjs';

export function loadApps(env = process.env) {
  return [illustratorApp(env)];
}
