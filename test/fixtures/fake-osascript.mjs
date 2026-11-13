/**
 * Fake `osascript` for offline tests. Invoked by the bridge as
 *   node fake-osascript.mjs -e … -e … <script.jsx>
 * It checks the AppleScript shape, then does what Illustrator's loader would:
 * reads the UTF-8 file and evaluates it, printing the completion value.
 *
 * Env knobs:
 *   FAKE_OSA_STDERR / FAKE_OSA_EXIT   simulate an osascript failure
 *   FAKE_OSA_CAPTURE                  write argv as JSON to this path
 *   FAKE_OSA_DELAY_MS                 sleep before answering (queue tests)
 *   FAKE_AI_STATE                     JSON passed to createFakeGlobals
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import vm from 'node:vm';
import { createFakeGlobals } from './fake-illustrator.mjs';

const LOADER_ERROR_PREFIX = '__ADOBE_MCP_LOADER_ERROR__';
const argv = process.argv.slice(2);
const env = process.env;

if (env.FAKE_OSA_CAPTURE) writeFileSync(env.FAKE_OSA_CAPTURE, JSON.stringify(argv));
if (env.FAKE_OSA_LOG) appendFileSync(env.FAKE_OSA_LOG, `start ${Date.now()}\n`);

if (env.FAKE_OSA_STDERR) {
  process.stderr.write(`${env.FAKE_OSA_STDERR}\n`);
  process.exit(Number(env.FAKE_OSA_EXIT || 1));
}

const script = argv.filter((a, i) => argv[i - 1] === '-e').join('\n');
if (!/do javascript ".*" with arguments \{item 1 of argv\}/.test(script)) {
  process.stderr.write('fake-osascript: unexpected AppleScript\n');
  process.exit(2);
}

const delay = Number(env.FAKE_OSA_DELAY_MS || 0);
if (delay) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);

const file = argv[argv.length - 1];
let output;
try {
  const source = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const context = vm.createContext(createFakeGlobals(JSON.parse(env.FAKE_AI_STATE || '{}')));
  output = vm.runInContext(source, context, { filename: 'composed.jsx' });
} catch (e) {
  const m = String(e.stack || '').match(/composed\.jsx:(\d+)/);
  output = `${LOADER_ERROR_PREFIX}${e.message}${m ? ` (line ${m[1]})` : ''}`;
}
if (env.FAKE_OSA_LOG) appendFileSync(env.FAKE_OSA_LOG, `end ${Date.now()}\n`);
process.stdout.write(`${output}\n`);
