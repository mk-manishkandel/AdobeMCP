/*
 * qr-payloads.jsx: QR content builders and input checks for the Illustrator QR
 * script and panel. Pure ES3 (no Illustrator DOM), so it also runs in the panel's
 * browser and in Node tests. Avoid chained "a ? b : c ? d : e" (ExtendScript mis-parses it).
 */

var QRP_SECURITY_CODES = ['WPA', 'WEP', 'nopass'];

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
