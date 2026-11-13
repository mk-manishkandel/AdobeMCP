/**
 * Bridge: Node -> osascript -> `do javascript` -> ExtendScript.
 *
 * For each call we compose  common.jsx + <app>.jsx + `var ARGS = …;` + `__run(…)`,
 * write it to a temp file with a UTF-8 BOM, and ask the app to run a tiny loader
 * that reads the file as UTF-8 and evals it. The file path is passed through
 * `with arguments`, so nothing user-controlled is ever spliced into AppleScript.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeError, ErrorCodes } from './errors.mjs';
import { createSerialQueue } from './queue.mjs';

export const DEFAULT_TIMEOUT_SEC = 600;
const KILL_GRACE_SEC = 30;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const LOADER_ERROR_PREFIX = '__ADOBE_MCP_LOADER_ERROR__';
const FN_NAME_RE = /^[a-z][a-z0-9_]*$/;
const BUNDLE_ID_RE = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const APP_NAME_RE = /^[\w .()-]+$/;
const TMP_FILE_MODE = 0o600;
const STALE_TMP_MS = 24 * 3600 * 1000;

/** ExtendScript loader, run via `do javascript … with arguments {path}`. No double quotes or backslashes. */
export const LOADER = [
  "var __f=new File(arguments[0]);__f.encoding='UTF-8';",
  "if(!__f.open('r')){'" + LOADER_ERROR_PREFIX + "cannot open '+__f.fsName}",
  'else{var __c=__f.read();__f.close();',
  "try{eval(__c)}catch(__e){'" + LOADER_ERROR_PREFIX + "'+__e.message+' (line '+__e.line+')'}}",
].join('');

/** `tell` target for an app given as a bundle id or an app name. */
export function tellTarget(target) {
  if (typeof target !== 'string' || !target) throw new BridgeError(ErrorCodes.CONFIG, 'App target is empty');
  if (BUNDLE_ID_RE.test(target)) return `application id "${target}"`;
  if (APP_NAME_RE.test(target)) return `application "${target}"`;
  throw new BridgeError(ErrorCodes.CONFIG, `Invalid app target ${JSON.stringify(target)}: use a bundle id or plain app name`);
}

/** osascript argv. The temp file path is the single run-handler argument. */
export function buildOsascriptArgs(target, timeoutSec, filePath) {
  return [
    '-e', 'on run argv',
    '-e', `with timeout of ${Math.round(timeoutSec)} seconds`,
    '-e', `tell ${tellTarget(target)} to do javascript "${LOADER}" with arguments {item 1 of argv}`,
    '-e', 'end timeout',
    '-e', 'end run',
    filePath,
  ];
}

/** JSON that is also a valid ES3 literal (U+2028/2029 are line terminators in ES3). */
export function toJsLiteral(value) {
  return JSON.stringify(value ?? null)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function normaliseSource(text) {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Composes the script for one call. Returns the source plus line segments so
 * ExtendScript line numbers can be mapped back to the original .jsx files.
 */
export function buildScript({ sources, fnName, args }) {
  if (!FN_NAME_RE.test(fnName)) throw new BridgeError(ErrorCodes.CONFIG, `Invalid function name: ${fnName}`);
  const parts = [
    ...sources.map(({ file, src }) => [file, normaliseSource(src)]),
    ['<args>', `var ARGS = ${toJsLiteral(args)};`],
    ['<call>', `__run(function () { return ${fnName}(ARGS); });`],
  ];
  const segments = [];
  let start = 1;
  for (const [file, text] of parts) {
    const lineCount = text.split('\n').length;
    segments.push(Object.freeze({ file, start, end: start + lineCount - 1 }));
    start += lineCount;
  }
  return { source: parts.map(([, text]) => text).join('\n'), segments };
}

/** Maps a line in the composed script back to {file, line}. */
export function mapLine(segments, line) {
  const seg = segments.find((s) => line >= s.start && line <= s.end);
  return seg ? { file: seg.file, line: line - seg.start + 1 } : null;
}

function locate(segments, line) {
  const loc = Number.isInteger(line) ? mapLine(segments, line) : null;
  return loc ? ` [${loc.file}:${loc.line}]` : '';
}

/** Parses what the loader printed. Returns the result or throws a BridgeError. */
export function parseScriptOutput(stdout, segments, appLabel) {
  const text = stdout.replace(/\r?\n$/, '');
  if (text.startsWith(LOADER_ERROR_PREFIX)) {
    const raw = text.slice(LOADER_ERROR_PREFIX.length);
    const m = raw.match(/^(.*) \(line (\d+)\)$/s);
    const detail = m ? `${m[1]}${locate(segments, Number(m[2]))}` : raw;
    throw new BridgeError(ErrorCodes.LOADER_ERROR, `${appLabel} could not load the script: ${detail}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BridgeError(ErrorCodes.BAD_RESPONSE, `Unexpected response from ${appLabel}: ${text.slice(0, 500)}`);
  }
  if (payload && payload.ok === true) return payload.result ?? null;
  if (payload && payload.ok === false) {
    const message = payload.user ? payload.message : `${payload.message}${locate(segments, payload.line)}`;
    throw new BridgeError(ErrorCodes.SCRIPT_ERROR, message, { line: payload.line });
  }
  throw new BridgeError(ErrorCodes.BAD_RESPONSE, `Malformed response from ${appLabel}: ${text.slice(0, 500)}`);
}

function automationHelp(appLabel) {
  return (
    `macOS blocked this server from controlling ${appLabel} (error -1743). ` +
    'Open System Settings → Privacy & Security → Automation, find the app that runs this MCP server ' +
    `(Claude, Terminal, iTerm, …) and switch on "${appLabel}" underneath it, then retry. ` +
    'If no toggle is listed, quit and reopen that app so macOS asks again.'
  );
}

/** Turns a failed osascript run into a clear BridgeError. */
export function classifyOsascriptError({ stderr = '', killed = false, code } = {}, { appLabel, target, timeoutSec }) {
  const s = String(stderr);
  if (killed) {
    return new BridgeError(ErrorCodes.TIMEOUT, `${appLabel} did not answer within ${timeoutSec + KILL_GRACE_SEC} s; osascript was stopped.`);
  }
  if (/-1743\b/.test(s) || /Not authori[sz]ed to send Apple events/i.test(s)) {
    return new BridgeError(ErrorCodes.PERMISSION_DENIED, automationHelp(appLabel));
  }
  if (/-1712\b/.test(s)) {
    return new BridgeError(
      ErrorCodes.TIMEOUT,
      `${appLabel} did not finish within ${timeoutSec} s (AppleEvent timeout -1712). ` +
        'The script may still be running inside the app and later calls will wait for it. ' +
        'Check the app for an open dialog, or split the work into smaller calls.',
    );
  }
  if (/-1728\b/.test(s) || /-10814\b/.test(s) || /Can.t get application/i.test(s)) {
    return new BridgeError(
      ErrorCodes.APP_NOT_FOUND,
      `Could not find ${appLabel} (target ${JSON.stringify(target)}). Check that it is installed, or set the env var to its bundle id or exact app name.`,
    );
  }
  if (/-600\b/.test(s) || /-609\b/.test(s) || /isn.t running|Connection is invalid/i.test(s)) {
    return new BridgeError(ErrorCodes.APP_QUIT, `${appLabel} quit or crashed during the call. Reopen it and retry.`);
  }
  const msg = s.trim() || `osascript exited with code ${code}`;
  return new BridgeError(ErrorCodes.OSASCRIPT_FAILED, `${appLabel} call failed: ${msg}`);
}

function runOsascript(command, args, timeoutMs) {
  const [file, prefixArgs] = /\.(m?js)$/.test(command) ? [process.execPath, [command]] : [command, []];
  return new Promise((resolve) => {
    execFile(
      file,
      [...prefixArgs, ...args],
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });
}

/**
 * Deletes composed scripts (*.jsx) older than maxAgeMs left behind by crashed
 * runs. Returns how many were removed; a missing directory counts as zero.
 */
export async function sweepStaleTmp(dir, maxAgeMs = STALE_TMP_MS) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const name of names.filter((n) => n.endsWith('.jsx'))) {
    const file = join(dir, name);
    const info = await stat(file).catch(() => null);
    if (info && info.mtimeMs < cutoff && (await unlink(file).then(() => true, () => false))) removed += 1;
  }
  return removed;
}

/** Effective AppleEvent timeout: the tool's own, never above the global limit. */
function effectiveTimeout(globalSec, requestedSec) {
  return Number.isFinite(requestedSec) && requestedSec > 0 ? Math.min(requestedSec, globalSec) : globalSec;
}

/**
 * @param {object} opts
 * @param {string} opts.jsxDir           folder holding common.jsx and the per-app .jsx files
 *                                      (an app is {label, target, jsxFiles: ['illustrator.jsx', …]})
 * @param {string} [opts.osascript]      osascript binary (a .mjs path runs a fake under node, for tests)
 * @param {number} [opts.timeoutSec]
 * @param {string} [opts.tmpDir]
 * @param {boolean} [opts.keepTmp]       keep composed scripts for debugging
 * @param {Function} [opts.log]
 */
export function createBridge({
  jsxDir,
  osascript = 'osascript',
  timeoutSec = DEFAULT_TIMEOUT_SEC,
  tmpDir = join(tmpdir(), 'adobe-mcp'),
  keepTmp = false,
  log = () => {},
}) {
  const queue = createSerialQueue();
  sweepStaleTmp(tmpDir).then(
    (n) => n && log('info', `removed ${n} stale temp script(s) from ${tmpDir}`),
    () => {},
  );

  async function loadSources(app) {
    const files = ['common.jsx', ...app.jsxFiles];
    const texts = await Promise.all(files.map((f) => readFile(join(jsxDir, f), 'utf8')));
    return files.map((file, i) => ({ file, src: texts[i] }));
  }

  async function execute(app, fnName, args, { signal, timeoutSec: requested } = {}) {
    if (signal?.aborted) throw new BridgeError(ErrorCodes.CANCELLED, `${fnName} was cancelled before it started.`);
    const callTimeout = effectiveTimeout(timeoutSec, requested);
    const sources = await loadSources(app);
    const { source, segments } = buildScript({ sources, fnName, args });
    await mkdir(tmpDir, { recursive: true });
    const file = join(tmpDir, `${fnName}-${randomUUID()}.jsx`);
    await writeFile(file, `﻿${source}`, { encoding: 'utf8', mode: TMP_FILE_MODE });

    const started = Date.now();
    try {
      const osaArgs = buildOsascriptArgs(app.target, callTimeout, file);
      const { error, stdout, stderr } = await runOsascript(osascript, osaArgs, (callTimeout + KILL_GRACE_SEC) * 1000);
      log('debug', `${fnName} took ${Date.now() - started} ms`);
      if (error) {
        throw classifyOsascriptError(
          { stderr: stderr || error.message, killed: error.killed, code: error.code },
          { appLabel: app.label, target: app.target, timeoutSec: callTimeout },
        );
      }
      return parseScriptOutput(stdout, segments, app.label);
    } finally {
      if (!keepTmp) await unlink(file).catch(() => {});
    }
  }

  return Object.freeze({
    tmpDir,
    /**
     * Runs `fnName(args)` inside the app. Calls are serialised. opts.signal skips
     * the call if it is aborted before its turn; opts.timeoutSec shortens the timeout.
     */
    call: (app, fnName, args = {}, opts = {}) => queue.run(() => execute(app, fnName, args, opts)),
    get queueSize() {
      return queue.size;
    },
  });
}
