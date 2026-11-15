/*
 * qr-encoder.jsx: QR Code Model 2 encoder in plain ES3 (ExtendScript-safe), plus
 * vector outline tracing. No Illustrator DOM access here, so it is shared by the
 * ai_qr_code MCP tool and the standalone "QR Code" Illustrator script, and is
 * unit-tested in Node.
 *
 * Algorithm follows ISO/IEC 18004 (structure after Project Nayuki's MIT-licensed
 * reference implementation): one segment (numeric / alphanumeric / byte UTF-8),
 * versions 1-40, ECC L/M/Q/H, automatic mask selection by penalty score.
 *
 * Public API:
 *   __qrEncode(text, ecc, minVersion) -> {version, size, ecc, mask, mode, modules: [[bool]]}   (modules[y][x], true = dark)
 *   __qrOutlines(modules, skip)       -> [[[x, y], ...], ...] closed loops in module units (y down);
 *                                        outer loops clockwise, holes counter-clockwise. skip(x, y) excludes cells.
 *   __qrIsFinder(size, x, y)          -> true inside one of the three 7x7 finder patterns
 */

var __QR_ECC = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 }
};

var __QR_ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];

var __QR_NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

var __QR_ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
var __QR_PENALTY_N1 = 3;
var __QR_PENALTY_N2 = 3;
var __QR_PENALTY_N3 = 40;
var __QR_PENALTY_N4 = 10;
var __QR_MIN_VERSION = 1;
var __QR_MAX_VERSION = 40;

function __qrError(message) {
  if (typeof __fail === 'function') __fail(message);
  throw new Error(message);
}

/* ---------- small helpers ---------- */

function __qrBit(value, i) {
  return ((value >>> i) & 1) !== 0;
}

function __qrFilled(length, value) {
  var out = [];
  for (var i = 0; i < length; i++) out.push(value);
  return out;
}

function __qrGrid(size, value) {
  var rows = [];
  for (var i = 0; i < size; i++) rows.push(__qrFilled(size, value));
  return rows;
}

function __qrAppendBits(bits, value, length) {
  for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

/* UTF-8 bytes of a JS (UTF-16) string; lone surrogates become U+FFFD. */
function __qrUtf8(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
      var lo = text.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        c = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00);
        i++;
      }
    }
    if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >>> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >>> 12), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >>> 18), 0x80 | ((c >>> 12) & 63), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/* ---------- data segment ---------- */

function __qrIsNumeric(text) {
  return /^[0-9]*$/.test(text);
}

function __qrIsAlnum(text) {
  for (var i = 0; i < text.length; i++) if (__QR_ALNUM.indexOf(text.charAt(i)) < 0) return false;
  return true;
}

function __qrNumericBits(text) {
  var bits = [];
  for (var i = 0; i < text.length; i += 3) {
    var chunk = text.substr(i, 3);
    __qrAppendBits(bits, parseInt(chunk, 10), chunk.length * 3 + 1);
  }
  return bits;
}

function __qrAlnumBits(text) {
  var bits = [];
  var i = 0;
  for (; i + 2 <= text.length; i += 2) {
    __qrAppendBits(bits, __QR_ALNUM.indexOf(text.charAt(i)) * 45 + __QR_ALNUM.indexOf(text.charAt(i + 1)), 11);
  }
  if (i < text.length) __qrAppendBits(bits, __QR_ALNUM.indexOf(text.charAt(i)), 6);
  return bits;
}

function __qrByteBits(bytes) {
  var bits = [];
  for (var i = 0; i < bytes.length; i++) __qrAppendBits(bits, bytes[i], 8);
  return bits;
}

/* The most compact single segment for text: {mode, modeBits, charCount, bits, ccBits: [v1-9, v10-26, v27-40]}. */
function __qrSegment(text) {
  if (__qrIsNumeric(text)) {
    return { mode: 'numeric', modeBits: 1, charCount: text.length, bits: __qrNumericBits(text), ccBits: [10, 12, 14] };
  }
  if (__qrIsAlnum(text)) {
    return { mode: 'alphanumeric', modeBits: 2, charCount: text.length, bits: __qrAlnumBits(text), ccBits: [9, 11, 13] };
  }
  var bytes = __qrUtf8(text);
  return { mode: 'byte', modeBits: 4, charCount: bytes.length, bits: __qrByteBits(bytes), ccBits: [8, 16, 16] };
}

/* Explicit branches: ExtendScript mis-parses chained "a ? b : c ? d : e". */
function __qrCcBits(seg, version) {
  if (version <= 9) return seg.ccBits[0];
  if (version <= 26) return seg.ccBits[1];
  return seg.ccBits[2];
}

/* Bits the segment needs at a version, or -1 when its length does not fit the count field. */
function __qrSegmentBits(seg, version) {
  var cc = __qrCcBits(seg, version);
  if (seg.charCount >= (1 << cc)) return -1;
  return 4 + cc + seg.bits.length;
}

/* ---------- capacity ---------- */

function __qrRawModules(version) {
  var result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    var numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function __qrDataCodewords(version, eccOrdinal) {
  return Math.floor(__qrRawModules(version) / 8) -
    __QR_ECC_CODEWORDS_PER_BLOCK[eccOrdinal][version] * __QR_NUM_BLOCKS[eccOrdinal][version];
}

/* Smallest version >= minVersion that holds seg at this ECC level, or -1. */
function __qrPickVersion(seg, eccOrdinal, minVersion) {
  for (var v = minVersion; v <= __QR_MAX_VERSION; v++) {
    var used = __qrSegmentBits(seg, v);
    if (used >= 0 && used <= __qrDataCodewords(v, eccOrdinal) * 8) return v;
  }
  return -1;
}

/* Mode + count + data + terminator + padding, as data codewords (bytes). */
function __qrDataBytes(seg, version, eccOrdinal) {
  var capacity = __qrDataCodewords(version, eccOrdinal) * 8;
  var bits = [];
  __qrAppendBits(bits, seg.modeBits, 4);
  __qrAppendBits(bits, seg.charCount, __qrCcBits(seg, version));
  for (var i = 0; i < seg.bits.length; i++) bits.push(seg.bits[i]);
  __qrAppendBits(bits, 0, Math.min(4, capacity - bits.length));
  __qrAppendBits(bits, 0, (8 - bits.length % 8) % 8);
  for (var pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) __qrAppendBits(bits, pad, 8);
  var bytes = __qrFilled(bits.length / 8, 0);
  for (var j = 0; j < bits.length; j++) bytes[j >>> 3] |= bits[j] << (7 - (j & 7));
  return bytes;
}

/* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */

function __qrGfMul(x, y) {
  var z = 0;
  for (var i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function __qrRsDivisor(degree) {
  var result = __qrFilled(degree, 0);
  result[degree - 1] = 1;
  var root = 1;
  for (var i = 0; i < degree; i++) {
    for (var j = 0; j < result.length; j++) {
      result[j] = __qrGfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = __qrGfMul(root, 0x02);
  }
  return result;
}

function __qrRsRemainder(data, divisor) {
  var result = __qrFilled(divisor.length, 0);
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ result.shift();
    result.push(0);
    for (var j = 0; j < result.length; j++) result[j] ^= __qrGfMul(divisor[j], factor);
  }
  return result;
}

/* Splits data into blocks, appends ECC to each and interleaves them. */
function __qrAddEcc(data, version, eccOrdinal) {
  var numBlocks = __QR_NUM_BLOCKS[eccOrdinal][version];
  var eccLen = __QR_ECC_CODEWORDS_PER_BLOCK[eccOrdinal][version];
  var rawCodewords = Math.floor(__qrRawModules(version) / 8);
  var numShort = numBlocks - rawCodewords % numBlocks;
  var shortLen = Math.floor(rawCodewords / numBlocks);
  var divisor = __qrRsDivisor(eccLen);
  var blocks = [];
  for (var i = 0, k = 0; i < numBlocks; i++) {
    var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    var ecc = __qrRsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  var result = [];
  for (var col = 0; col < blocks[0].length; col++) {
    for (var b = 0; b < blocks.length; b++) {
      if (col !== shortLen - eccLen || b >= numShort) result.push(blocks[b][col]);
    }
  }
  return result;
}

/* ---------- matrix ---------- */

function __qrNewMatrix(version) {
  var size = version * 4 + 17;
  return { version: version, size: size, modules: __qrGrid(size, false), isFunction: __qrGrid(size, false) };
}

function __qrSetFunction(m, x, y, dark) {
  m.modules[y][x] = dark;
  m.isFunction[y][x] = true;
}

function __qrAlignmentPositions(version) {
  if (version === 1) return [];
  var numAlign = Math.floor(version / 7) + 2;
  var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  var result = [6];
  for (var pos = version * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function __qrDrawFinder(m, cx, cy) {
  for (var dy = -4; dy <= 4; dy++) {
    for (var dx = -4; dx <= 4; dx++) {
      var dist = Math.max(Math.abs(dx), Math.abs(dy));
      var x = cx + dx;
      var y = cy + dy;
      if (x >= 0 && x < m.size && y >= 0 && y < m.size) __qrSetFunction(m, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function __qrDrawAlignment(m, cx, cy) {
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) __qrSetFunction(m, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
}

function __qrDrawFormatBits(m, eccFormatBits, mask) {
  var data = (eccFormatBits << 3) | mask;
  var rem = data;
  for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  var bits = ((data << 10) | rem) ^ 0x5412;
  var size = m.size;
  for (var a = 0; a <= 5; a++) __qrSetFunction(m, 8, a, __qrBit(bits, a));
  __qrSetFunction(m, 8, 7, __qrBit(bits, 6));
  __qrSetFunction(m, 8, 8, __qrBit(bits, 7));
  __qrSetFunction(m, 7, 8, __qrBit(bits, 8));
  for (var b = 9; b < 15; b++) __qrSetFunction(m, 14 - b, 8, __qrBit(bits, b));
  for (var c = 0; c < 8; c++) __qrSetFunction(m, size - 1 - c, 8, __qrBit(bits, c));
  for (var d = 8; d < 15; d++) __qrSetFunction(m, 8, size - 15 + d, __qrBit(bits, d));
  __qrSetFunction(m, 8, size - 8, true);
}

function __qrDrawVersion(m) {
  if (m.version < 7) return;
  var rem = m.version;
  for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  var bits = (m.version << 12) | rem;
  for (var j = 0; j < 18; j++) {
    var bit = __qrBit(bits, j);
    var a = m.size - 11 + j % 3;
    var b = Math.floor(j / 3);
    __qrSetFunction(m, a, b, bit);
    __qrSetFunction(m, b, a, bit);
  }
}

function __qrDrawFunctionPatterns(m, eccFormatBits) {
  var size = m.size;
  for (var i = 0; i < size; i++) {
    __qrSetFunction(m, 6, i, i % 2 === 0);
    __qrSetFunction(m, i, 6, i % 2 === 0);
  }
  __qrDrawFinder(m, 3, 3);
  __qrDrawFinder(m, size - 4, 3);
  __qrDrawFinder(m, 3, size - 4);
  var pos = __qrAlignmentPositions(m.version);
  var last = pos.length - 1;
  for (var a = 0; a < pos.length; a++) {
    for (var b = 0; b < pos.length; b++) {
      var corner = (a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0);
      if (!corner) __qrDrawAlignment(m, pos[a], pos[b]);
    }
  }
  __qrDrawFormatBits(m, eccFormatBits, 0);
  __qrDrawVersion(m);
}

/* Zig-zag placement of the codeword bits into the non-function modules. */
function __qrDrawCodewords(m, codewords) {
  var size = m.size;
  var i = 0;
  var total = codewords.length * 8;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    var upward = ((right + 1) & 2) === 0;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        var x = right - j;
        var y = upward ? size - 1 - vert : vert;
        if (!m.isFunction[y][x] && i < total) {
          m.modules[y][x] = __qrBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function __qrMaskHit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
  }
}

/* XORs the mask onto the data modules (applying it twice undoes it). */
function __qrApplyMask(m, mask) {
  for (var y = 0; y < m.size; y++) {
    for (var x = 0; x < m.size; x++) {
      if (!m.isFunction[y][x] && __qrMaskHit(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

/* ---------- mask penalty ---------- */

function __qrFinderCount(history) {
  var n = history[1];
  var core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  if (!core) return 0;
  var count = 0;
  if (history[0] >= n * 4 && history[6] >= n) count++;
  if (history[6] >= n * 4 && history[0] >= n) count++;
  return count;
}

function __qrFinderAddHistory(length, history, size) {
  if (history[0] === 0) length += size;
  history.pop();
  history.unshift(length);
}

function __qrFinderTerminate(runDark, runLength, history, size) {
  if (runDark) {
    __qrFinderAddHistory(runLength, history, size);
    runLength = 0;
  }
  __qrFinderAddHistory(runLength + size, history, size);
  return __qrFinderCount(history);
}

/* Penalty for one row or column; get(i) reads module i along the line. */
function __qrLinePenalty(get, size) {
  var result = 0;
  var runDark = false;
  var run = 0;
  var history = __qrFilled(7, 0);
  for (var i = 0; i < size; i++) {
    var dark = get(i);
    if (dark === runDark) {
      run++;
      if (run === 5) result += __QR_PENALTY_N1;
      else if (run > 5) result++;
    } else {
      __qrFinderAddHistory(run, history, size);
      if (!runDark) result += __qrFinderCount(history) * __QR_PENALTY_N3;
      runDark = dark;
      run = 1;
    }
  }
  return result + __qrFinderTerminate(runDark, run, history, size) * __QR_PENALTY_N3;
}

function __qrRowGetter(row) {
  return function (i) { return row[i]; };
}

function __qrColumnGetter(modules, col) {
  return function (i) { return modules[i][col]; };
}

function __qrPenalty(modules) {
  var size = modules.length;
  var result = 0;
  var dark = 0;
  for (var line = 0; line < size; line++) {
    result += __qrLinePenalty(__qrRowGetter(modules[line]), size);
    result += __qrLinePenalty(__qrColumnGetter(modules, line), size);
  }
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var c = modules[y][x];
      if (c) dark++;
      if (y < size - 1 && x < size - 1 && c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += __QR_PENALTY_N2;
      }
    }
  }
  var total = size * size;
  var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * __QR_PENALTY_N4;
}

function __qrBestMask(m, eccFormatBits) {
  var best = 0;
  var bestScore = -1;
  for (var mask = 0; mask < 8; mask++) {
    __qrApplyMask(m, mask);
    __qrDrawFormatBits(m, eccFormatBits, mask);
    var score = __qrPenalty(m.modules);
    if (bestScore < 0 || score < bestScore) {
      best = mask;
      bestScore = score;
    }
    __qrApplyMask(m, mask);
  }
  return best;
}

/* ---------- public: encode ---------- */

function __qrEncode(text, ecc, minVersion) {
  text = String(text === undefined || text === null ? '' : text);
  if (text.length === 0) __qrError('QR text is empty.');
  var level = __QR_ECC[ecc || 'M'];
  if (!level) __qrError('Unknown error correction level "' + ecc + '" (use L, M, Q or H).');
  var minV = minVersion ? Math.floor(minVersion) : __QR_MIN_VERSION;
  if (minV < __QR_MIN_VERSION || minV > __QR_MAX_VERSION) __qrError('Version must be 1-40.');
  var seg = __qrSegment(text);
  var version = __qrPickVersion(seg, level.ordinal, minV);
  if (version < 0) {
    __qrError('Text is too long for a QR code at error correction ' + (ecc || 'M') + ' (' + seg.charCount +
      ' ' + (seg.mode === 'byte' ? 'bytes' : 'characters') + '). Shorten it or use a lower level such as L.');
  }
  var m = __qrNewMatrix(version);
  __qrDrawFunctionPatterns(m, level.formatBits);
  __qrDrawCodewords(m, __qrAddEcc(__qrDataBytes(seg, version, level.ordinal), version, level.ordinal));
  var mask = __qrBestMask(m, level.formatBits);
  __qrApplyMask(m, mask);
  __qrDrawFormatBits(m, level.formatBits, mask);
  return { version: version, size: m.size, ecc: ecc || 'M', mask: mask, mode: seg.mode, modules: m.modules };
}

/* ---------- public: vector outlines ---------- */

function __qrIsFinder(size, x, y) {
  var inTop = y < 7;
  var inLeft = x < 7;
  return (inTop && inLeft) || (inTop && x >= size - 7) || (inLeft && y >= size - 7);
}

function __qrKey(x, y) {
  return x + ',' + y;
}

function __qrDark(modules, skip, x, y) {
  var size = modules.length;
  return x >= 0 && y >= 0 && x < size && y < size && modules[y][x] && !(skip && skip(x, y));
}

function __qrAddEdge(map, x1, y1, x2, y2) {
  var k = __qrKey(x1, y1);
  if (!map.hasOwnProperty(k)) map[k] = [];
  map[k].push([x2, y2]);
}

/* Directed boundary edges of the dark cells, keyed by start corner. Dark is on the right of every edge (y down). */
function __qrEdges(modules, skip) {
  var size = modules.length;
  var map = {};
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      if (!__qrDark(modules, skip, x, y)) continue;
      if (!__qrDark(modules, skip, x, y - 1)) __qrAddEdge(map, x, y, x + 1, y);
      if (!__qrDark(modules, skip, x + 1, y)) __qrAddEdge(map, x + 1, y, x + 1, y + 1);
      if (!__qrDark(modules, skip, x, y + 1)) __qrAddEdge(map, x + 1, y + 1, x, y + 1);
      if (!__qrDark(modules, skip, x - 1, y)) __qrAddEdge(map, x, y + 1, x, y);
    }
  }
  return map;
}

/* Picks the next edge out of a corner: right turn first (keeps diagonal neighbours as separate loops), then straight, then left. */
function __qrNextEdge(outs, dx, dy, x, y) {
  var prefs = [[-dy, dx], [dx, dy], [dy, -dx]];
  for (var p = 0; p < prefs.length; p++) {
    for (var i = 0; i < outs.length; i++) {
      if (outs[i][0] - x === prefs[p][0] && outs[i][1] - y === prefs[p][1]) return i;
    }
  }
  return 0;
}

/* Drops corners that sit on a straight line between their neighbours. */
function __qrSimplify(loop) {
  var out = [];
  var n = loop.length;
  for (var i = 0; i < n; i++) {
    var a = loop[(i + n - 1) % n];
    var b = loop[i];
    var c = loop[(i + 1) % n];
    var cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out;
}

function __qrTraceLoop(map, startKey) {
  var parts = startKey.split(',');
  var sx = parseInt(parts[0], 10);
  var sy = parseInt(parts[1], 10);
  var loop = [[sx, sy]];
  var x = sx;
  var y = sy;
  var next = map[startKey].shift();
  while (true) {
    var dx = next[0] - x;
    var dy = next[1] - y;
    x = next[0];
    y = next[1];
    if (x === sx && y === sy) break;
    loop.push([x, y]);
    var here = map[__qrKey(x, y)];
    if (!here || here.length === 0) __qrError('QR outline tracing failed (open contour).');
    next = here.splice(__qrNextEdge(here, dx, dy, x, y), 1)[0];
  }
  return __qrSimplify(loop);
}

function __qrOutlines(modules, skip) {
  var map = __qrEdges(modules, skip);
  var loops = [];
  for (var key in map) {
    if (!map.hasOwnProperty(key)) continue;
    while (map[key].length > 0) loops.push(__qrTraceLoop(map, key));
  }
  return loops;
}
