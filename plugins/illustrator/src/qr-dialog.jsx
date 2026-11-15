/*
 * qr-dialog.jsx: the "QR Code" dialog for the standalone Illustrator script.
 * Built together with jsx/qr-encoder.jsx and jsx/qr-draw.jsx into
 * plugins/illustrator/QR Code.jsx by scripts/build-qr-plugin.mjs.
 * ES3 only. Avoid chained "a ? b : c ? d : e" (ExtendScript mis-parses it).
 */

var QRP_TITLE = 'QR Code';
var QRP_TYPES = ['Text / URL', 'Wi-Fi', 'Email', 'Phone'];
var QRP_ECC = ['L - 7%', 'M - 15%', 'Q - 25%', 'H - 30%'];
var QRP_ECC_CODES = ['L', 'M', 'Q', 'H'];
var QRP_SECURITY = ['WPA/WPA2/WPA3', 'WEP', 'None'];
var QRP_SECURITY_CODES = ['WPA', 'WEP', 'nopass'];
var QRP_STYLES = ['Square', 'Dots'];
var QRP_DEFAULT_SIZE = 200;
var QRP_DEFAULT_QUIET = 4;
var QRP_MIN_SIZE = 10;
var QRP_MAX_SIZE = 10000;
var QRP_MAX_QUIET = 16;
var QRP_NEW_DOC_SIZE = 600;
var QRP_FIELD_WIDTH = 300;
var QRP_LABEL_WIDTH = 110;

/* ---------- payloads ---------- */

/* Backslash-escapes the characters the Wi-Fi QR format reserves. */
function qrpWifiEscape(s) {
  return String(s).replace(/([\\;,:"])/g, '\\$1');
}

function qrpWifiPayload(ssid, password, securityIndex, hidden) {
  if (ssid === '') throw new Error('Enter the Wi-Fi network name (SSID).');
  var type = QRP_SECURITY_CODES[securityIndex];
  var out = 'WIFI:T:' + type + ';S:' + qrpWifiEscape(ssid) + ';';
  if (type !== 'nopass') {
    if (password === '') throw new Error('Enter the Wi-Fi password, or choose security "None".');
    out += 'P:' + qrpWifiEscape(password) + ';';
  }
  if (hidden) out += 'H:true;';
  return out + ';';
}

function qrpEmailPayload(to, subject, body) {
  if (to === '') throw new Error('Enter the email address.');
  var params = [];
  if (subject !== '') params.push('subject=' + encodeURIComponent(subject));
  if (body !== '') params.push('body=' + encodeURIComponent(body));
  return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
}

function qrpPhonePayload(number) {
  var clean = String(number).replace(/[^0-9+*#]/g, '');
  if (clean === '' || clean === '+') throw new Error('Enter a phone number.');
  return 'tel:' + clean;
}

function qrpTextPayload(text) {
  if (text === '' || text === 'https://') throw new Error('Enter the text or link to encode.');
  return text;
}

/* ---------- values ---------- */

function qrpHex(value, label) {
  var s = String(value).replace(/^\s+|\s+$/g, '').replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(s)) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  if (!/^[0-9A-Fa-f]{6}$/.test(s)) throw new Error(label + ' must be a hex colour like #000000.');
  return { r: parseInt(s.substr(0, 2), 16), g: parseInt(s.substr(2, 2), 16), b: parseInt(s.substr(4, 2), 16) };
}

function qrpNumber(value, label, min, max) {
  var n = parseFloat(value);
  if (isNaN(n) || n < min || n > max) throw new Error(label + ' must be a number from ' + min + ' to ' + max + '.');
  return n;
}

/* Pure black becomes 100% K in CMYK documents (crisp single-plate print); other colours convert from RGB. */
function qrpColor(doc, rgb) {
  var isBlack = rgb.r === 0 && rgb.g === 0 && rgb.b === 0;
  if (doc.documentColorSpace === DocumentColorSpace.CMYK && isBlack) {
    var k = new CMYKColor();
    k.black = 100;
    return k;
  }
  var c = new RGBColor();
  c.red = rgb.r;
  c.green = rgb.g;
  c.blue = rgb.b;
  return c;
}

/* ---------- drawing ---------- */

function qrpTargetDocument() {
  if (app.documents.length > 0) return app.activeDocument;
  return app.documents.add(DocumentColorSpace.RGB, QRP_NEW_DOC_SIZE, QRP_NEW_DOC_SIZE);
}

function qrpTargetLayer(doc) {
  var layer = doc.activeLayer;
  if (layer.locked || !layer.visible) throw new Error('The active layer "' + layer.name + '" is locked or hidden. Pick another layer.');
  return layer;
}

function qrpBackground(group, doc, top, left, opts) {
  var bg = group.pathItems.rectangle(top, left, opts.size, opts.size);
  bg.name = 'QR background';
  bg.stroked = false;
  bg.filled = true;
  bg.fillColor = qrpColor(doc, opts.background);
}

/* Draws the QR centred on the active artboard; returns {group, qr}. */
function qrpCreate(opts) {
  var qr = __qrEncode(opts.text, opts.ecc, 0);
  var doc = qrpTargetDocument();
  var layer = qrpTargetLayer(doc);
  var r = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
  var left = (r[0] + r[2]) / 2 - opts.size / 2;
  var top = (r[1] + r[3]) / 2 + opts.size / 2;
  var m = opts.size / (qr.size + 2 * opts.quiet);
  var q = opts.quiet;
  var map = function (mx, my) { return [left + (mx + q) * m, top - (my + q) * m]; };
  var group = layer.groupItems.add();
  group.name = 'QR Code';
  if (opts.background) qrpBackground(group, doc, top, left, opts);
  var compound = __qrDrawModules(group, qr, map, m, opts.style);
  __qrFillCompound(compound, qrpColor(doc, opts.foreground));
  compound.move(group, ElementPlacement.PLACEATBEGINNING);
  doc.selection = null;
  group.selected = true;
  return { group: group, qr: qr };
}

/* ---------- dialog ---------- */

function qrpRow(parent, label) {
  var g = parent.add('group');
  g.orientation = 'row';
  g.alignChildren = ['left', 'center'];
  var st = g.add('statictext', undefined, label);
  st.preferredSize.width = QRP_LABEL_WIDTH;
  return g;
}

function qrpField(parent, label, value) {
  var e = qrpRow(parent, label).add('edittext', undefined, value || '');
  e.preferredSize.width = QRP_FIELD_WIDTH;
  return e;
}

function qrpDropdown(parent, label, items, selected) {
  var d = qrpRow(parent, label).add('dropdownlist', undefined, items);
  d.selection = selected;
  return d;
}

function qrpStackGroup(stack) {
  var g = stack.add('group');
  g.orientation = 'column';
  g.alignChildren = ['fill', 'top'];
  return g;
}

function qrpContentPages(ui, stack) {
  ui.pages = [qrpStackGroup(stack), qrpStackGroup(stack), qrpStackGroup(stack), qrpStackGroup(stack)];
  ui.text = ui.pages[0].add('edittext', undefined, 'https://', { multiline: true, scrolling: true });
  ui.text.preferredSize = [QRP_FIELD_WIDTH + QRP_LABEL_WIDTH + 5, 90];
  ui.ssid = qrpField(ui.pages[1], 'Network (SSID)');
  ui.password = qrpField(ui.pages[1], 'Password');
  ui.security = qrpDropdown(ui.pages[1], 'Security', QRP_SECURITY, 0);
  ui.hidden = ui.pages[1].add('checkbox', undefined, 'Hidden network');
  ui.to = qrpField(ui.pages[2], 'To');
  ui.subject = qrpField(ui.pages[2], 'Subject');
  ui.body = qrpField(ui.pages[2], 'Message');
  ui.phone = qrpField(ui.pages[3], 'Phone number', '+977');
}

function qrpContentPanel(w) {
  var p = w.add('panel', undefined, 'Content');
  p.alignChildren = ['fill', 'top'];
  var ui = { type: qrpDropdown(p, 'Type', QRP_TYPES, 0) };
  var stack = p.add('group');
  stack.orientation = 'stack';
  stack.alignChildren = ['fill', 'top'];
  qrpContentPages(ui, stack);
  var show = function () {
    for (var i = 0; i < ui.pages.length; i++) ui.pages[i].visible = ui.type.selection.index === i;
  };
  ui.type.onChange = show;
  show();
  return ui;
}

function qrpAppearancePanel(w, ui) {
  var p = w.add('panel', undefined, 'Appearance');
  p.alignChildren = ['fill', 'top'];
  ui.size = qrpField(p, 'Size (pt)', String(QRP_DEFAULT_SIZE));
  ui.quiet = qrpField(p, 'Quiet zone', String(QRP_DEFAULT_QUIET));
  ui.ecc = qrpDropdown(p, 'Error correction', QRP_ECC, 1);
  ui.style = qrpDropdown(p, 'Style', QRP_STYLES, 0);
  ui.foreground = qrpField(p, 'Colour', '#000000');
  ui.background = qrpField(p, 'Background', '#FFFFFF');
  ui.transparent = p.add('checkbox', undefined, 'Transparent background');
  ui.transparent.onClick = function () { ui.background.enabled = !ui.transparent.value; };
}

function qrpPayload(ui) {
  switch (ui.type.selection.index) {
    case 1: return qrpWifiPayload(ui.ssid.text, ui.password.text, ui.security.selection.index, ui.hidden.value);
    case 2: return qrpEmailPayload(ui.to.text, ui.subject.text, ui.body.text);
    case 3: return qrpPhonePayload(ui.phone.text);
    default: return qrpTextPayload(ui.text.text);
  }
}

/* Reads and validates the dialog; throws Error with a user-facing message. */
function qrpOptions(ui) {
  return {
    text: qrpPayload(ui),
    size: qrpNumber(ui.size.text, 'Size', QRP_MIN_SIZE, QRP_MAX_SIZE),
    quiet: Math.round(qrpNumber(ui.quiet.text, 'Quiet zone', 0, QRP_MAX_QUIET)),
    ecc: QRP_ECC_CODES[ui.ecc.selection.index],
    style: ui.style.selection.index === 1 ? 'dots' : 'square',
    foreground: qrpHex(ui.foreground.text, 'Colour'),
    background: ui.transparent.value ? null : qrpHex(ui.background.text, 'Background')
  };
}

function qrpDialog() {
  var w = new Window('dialog', QRP_TITLE);
  w.alignChildren = ['fill', 'top'];
  var ui = qrpContentPanel(w);
  qrpAppearancePanel(w, ui);
  var buttons = w.add('group');
  buttons.alignment = 'right';
  buttons.add('button', undefined, 'Cancel', { name: 'cancel' });
  var ok = buttons.add('button', undefined, 'Create', { name: 'ok' });
  var result = null;
  ok.onClick = function () {
    try {
      result = qrpOptions(ui);
      w.close(1);
    } catch (e) {
      alert(e.message, QRP_TITLE, true);
    }
  };
  w.show();
  return result;
}

function qrpMain() {
  var opts = qrpDialog();
  if (!opts) return;
  try {
    qrpCreate(opts);
  } catch (e) {
    alert('Could not create the QR code:\n' + (e.message || e), QRP_TITLE, true);
  }
}
