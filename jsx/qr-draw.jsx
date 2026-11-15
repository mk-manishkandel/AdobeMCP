/*
 * qr-draw.jsx: draws an encoded QR (from qr-encoder.jsx) as Illustrator vector art.
 * Uses only the Illustrator DOM (no MCP helpers), so the ai_qr_code tool and the
 * standalone "QR Code" script share it. Coordinates come in through map(mx, my),
 * which turns module-grid corners (y down, quiet zone excluded) into document points.
 */

var __QR_DOT_SCALE = 0.9;

function __qrAddLoops(compound, loops, map) {
  for (var i = 0; i < loops.length; i++) {
    var pts = [];
    for (var j = 0; j < loops[i].length; j++) pts.push(map(loops[i][j][0], loops[i][j][1]));
    var p = compound.pathItems.add();
    p.setEntirePath(pts);
    p.closed = true;
  }
}

/* One circle per dark module outside the finder patterns. map must flip y (document space is y up). */
function __qrAddDots(compound, qr, map, moduleSize) {
  var d = moduleSize * __QR_DOT_SCALE;
  var inset = (moduleSize - d) / 2;
  for (var y = 0; y < qr.size; y++) {
    for (var x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x] || __qrIsFinder(qr.size, x, y)) continue;
      var tl = map(x, y);
      compound.pathItems.ellipse(tl[1] - inset, tl[0] + inset, d, d);
    }
  }
}

function __qrNotFinder(size) {
  return function (x, y) { return !__qrIsFinder(size, x, y); };
}

/* Adds the compound path of dark modules to container. style: "square" (merged outlines) or "dots". */
function __qrDrawModules(container, qr, map, moduleSize, style) {
  var compound = container.compoundPathItems.add();
  compound.name = 'QR modules';
  if (style === 'dots') {
    __qrAddLoops(compound, __qrOutlines(qr.modules, __qrNotFinder(qr.size)), map);
    __qrAddDots(compound, qr, map, moduleSize);
  } else {
    __qrAddLoops(compound, __qrOutlines(qr.modules), map);
  }
  return compound;
}

/* A compound path shows the paint of its sub-paths, so every sub-path gets the same colour. */
function __qrFillCompound(compound, color) {
  for (var i = 0; i < compound.pathItems.length; i++) {
    var p = compound.pathItems[i];
    p.filled = true;
    p.fillColor = color;
    p.stroked = false;
  }
}
