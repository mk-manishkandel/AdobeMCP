import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createFakeGlobals } from './fixtures/fake-illustrator.mjs';
import { ILLUSTRATOR_JSX_FILES } from '../src/apps/illustrator/index.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const JSX_DIR = join(ROOT, 'jsx');
export const FAKE_OSASCRIPT = join(ROOT, 'test', 'fixtures', 'fake-osascript.mjs');

export function readJsx(name) {
  return readFileSync(join(JSX_DIR, name), 'utf8');
}

/** Loads the given JSX files into a fresh vm context with fake Illustrator globals. */
export const ALL_JSX = Object.freeze(['common.jsx', ...ILLUSTRATOR_JSX_FILES]);

export function loadJsx(files = ALL_JSX, state = {}) {
  const context = vm.createContext(createFakeGlobals(state));
  for (const f of files) vm.runInContext(readJsx(f), context, { filename: f });
  return context;
}

export function run(context, code) {
  return vm.runInContext(code, context);
}

/** Illustrator-like test state: one 1080x1080 doc + a 1080x1920 story artboard. */
export const SAMPLE_STATE = Object.freeze({
  documents: [
    {
      name: 'Admission.ai',
      path: '/Users/test/Admission.ai',
      activeArtboard: 1,
      artboards: [
        { name: 'Post', rect: [0, 1080, 1080, 0] },
        { name: 'Story', rect: [1200, 1080, 2280, -840] },
      ],
    },
    { name: 'Untitled-2', saved: false, cmyk: true, artboards: [{ name: 'A', rect: [0, 0, 100, -100] }] },
  ],
});
