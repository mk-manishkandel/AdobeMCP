/*
 * common.jsx: shared ExtendScript runtime for every Adobe app.
 *
 * ExtendScript is ES3: no JSON, no let/const, no arrow functions, no Array.isArray.
 * This file is re-read on every call, so edits take effect immediately.
 *
 * Contract with the Node bridge:
 *   __run(fn) returns a JSON string:
 *     {"ok":true,"result":...}
 *     {"ok":false,"error":"msg (line N)","message":"msg","line":N,"user":false}
 *   Errors thrown with __fail(msg) are "user" errors: clear messages with no line noise.
 *
 * Per-app files may define __beforeCall() -> state and __afterCall(state) to
 * set up and restore app settings (dialog suppression, coordinate system...).
 */

var __JSON_MAX_DEPTH = 32;

function __quote(s) {
  return '"' + String(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
    if (c === '"') return '\\"';
    if (c === '\\') return '\\\\';
    if (c === '\n') return '\\n';
    if (c === '\r') return '\\r';
    if (c === '\t') return '\\t';
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  }) + '"';
}

function __isPlainObject(v) {
  try {
    return v.constructor === Object;
  } catch (e) {
    return false;
  }
}

function __jsonArray(arr, depth) {
  var out = [];
  for (var i = 0; i < arr.length; i++) out.push(__json(arr[i], depth + 1));
  return '[' + out.join(',') + ']';
}

function __jsonObject(obj, depth) {
  var out = [];
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    var v = obj[k];
    if (v === undefined || typeof v === 'function') continue;
    out.push(__quote(k) + ':' + __json(v, depth + 1));
  }
  return '{' + out.join(',') + '}';
}

/* JSON.stringify replacement. Plain objects/arrays are serialised; DOM objects,
   enumerators, Files etc. become their String() form. */
function __json(v, depth) {
  depth = depth || 0;
  if (depth > __JSON_MAX_DEPTH) return '"[max depth]"';
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return __quote(v);
  if (t === 'function') return 'null';
  if (v instanceof Array) return __jsonArray(v, depth);
  if (__isPlainObject(v)) return __jsonObject(v, depth);
  try {
    return __quote(String(v));
  } catch (e) {
    return '"[unprintable]"';
  }
}

/* Throw an error meant for the caller (no line number appended). */
function __fail(message) {
  throw { __userError: true, message: String(message) };
}

function __errorInfo(e) {
  if (e && e.__userError) return { message: e.message, line: null, user: true };
  var msg = (e && e.message) ? e.message : String(e);
  var line = (e && e.line) ? e.line : null;
  return { message: msg, line: line, user: false };
}

function __run(fn) {
  var state = null;
  var hasHooks = typeof __beforeCall === 'function';
  try {
    if (hasHooks) state = __beforeCall();
    var result = fn();
    return __json({ ok: true, result: result === undefined ? null : result });
  } catch (e) {
    var info = __errorInfo(e);
    var text = info.line ? info.message + ' (line ' + info.line + ')' : info.message;
    return __json({ ok: false, error: text, message: info.message, line: info.line, user: info.user });
  } finally {
    if (hasHooks && typeof __afterCall === 'function') {
      try { __afterCall(state); } catch (ignored) { /* never mask the real result */ }
    }
  }
}

/* ---------- small shared helpers ---------- */

function __round(n, places) {
  var f = Math.pow(10, places === undefined ? 2 : places);
  return Math.round(n * f) / f;
}

function __has(obj, key) {
  return obj !== null && obj !== undefined && obj[key] !== undefined && obj[key] !== null;
}

function __pick(obj, key, fallback) {
  return __has(obj, key) ? obj[key] : fallback;
}

/* Parses "#RRGGBB" / "#RGB" / "RRGGBB" into {r,g,b} 0..255, or fails. */
function __parseHex(hex) {
  var s = String(hex).replace(/^#/, '');
  if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) __fail('Invalid colour "' + hex + '": use "#RRGGBB"');
  return {
    r: parseInt(s.substr(0, 2), 16),
    g: parseInt(s.substr(2, 2), 16),
    b: parseInt(s.substr(4, 2), 16)
  };
}

function __toHex(r, g, b) {
  function h(n) { return ('0' + Math.round(n).toString(16)).slice(-2); }
  return '#' + h(r) + h(g) + h(b);
}
