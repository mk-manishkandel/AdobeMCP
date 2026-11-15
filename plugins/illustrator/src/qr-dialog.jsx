/*
 * qr-dialog.jsx: the "QR Code" dialog for the standalone Illustrator script.
 * Built with jsx/qr-encoder.jsx, jsx/qr-draw.jsx, qr-payloads.jsx and qr-place.jsx
 * into plugins/illustrator/QR Code.jsx by scripts/build-qr-plugin.mjs.
 * ES3 only. Avoid chained "a ? b : c ? d : e" (ExtendScript mis-parses it).
 */

var QRP_TITLE = 'QR Code';
var QRP_TYPES = ['Text / URL', 'Wi-Fi', 'Email', 'Phone'];
var QRP_ECC = ['L - 7%', 'M - 15%', 'Q - 25%', 'H - 30%'];
var QRP_ECC_CODES = ['L', 'M', 'Q', 'H'];
var QRP_SECURITY = ['WPA/WPA2/WPA3', 'WEP', 'None'];
var QRP_STYLES = ['Square', 'Dots'];
var QRP_DEFAULT_SIZE = 200;
var QRP_DEFAULT_QUIET = 4;
var QRP_MIN_SIZE = 10;
var QRP_MAX_SIZE = 10000;
var QRP_MAX_QUIET = 16;
var QRP_FIELD_WIDTH = 300;
var QRP_LABEL_WIDTH = 110;

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
