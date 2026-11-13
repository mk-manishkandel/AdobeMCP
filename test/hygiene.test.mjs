import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { ROOT } from './helpers.mjs';

// Raw U+2028/U+2029 are line terminators in ES3/ExtendScript and break regex literals.
const FORBIDDEN = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
const SKIP = new Set(['.git', 'node_modules', 'coverage']);

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(m?js|jsx)$/.test(name)) yield p;
  }
}

test('no source file contains raw U+2028/U+2029 characters', () => {
  const offenders = [...sourceFiles(ROOT)].filter((f) => FORBIDDEN.some((c) => readFileSync(f, 'utf8').includes(c)));
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});
