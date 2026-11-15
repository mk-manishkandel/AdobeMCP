/**
 * App registry: every app the server drives. Tool names are prefixed per app
 * (ai_* Illustrator, ps_* Photoshop), so one server can expose them all.
 */
import { illustratorApp } from './illustrator/index.mjs';
import { photoshopApp } from './photoshop/index.mjs';

export function loadApps(env = process.env) {
  return [illustratorApp(env), photoshopApp(env)];
}
