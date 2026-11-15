/*
 * qr-panel-host.jsx: Illustrator side of the QR Code panel (loaded through the
 * manifest's ScriptPath). Built with qr-encoder, qr-draw and qr-place into
 * plugins/illustrator/qr-panel/jsx/host.jsx, all inside one function, so only
 * the QRCodePanel global is added to Illustrator's script engine.
 *
 * QRCodePanel.create(opts) returns "OK\t<version>\t<modules>\t<mode>" or "ERR\t<message>".
 */

function qrPanelCreate(opts) {
  try {
    var res = qrpCreate(opts);
    return ['OK', res.qr.version, res.qr.size, res.qr.mode].join('\t');
  } catch (e) {
    return 'ERR\t' + String(e && e.message ? e.message : e);
  }
}

$.global.QRCodePanel = { create: qrPanelCreate };
