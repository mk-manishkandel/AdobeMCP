/*
 * QR Code panel UI. Encoding and payload rules come from js/qr-core.js (generated
 * from jsx/qr-encoder.jsx and plugins/illustrator/src/qr-payloads.jsx), so the
 * preview is the exact code Illustrator will draw. Drawing happens in Illustrator
 * through jsx/host.jsx (QRCodePanel.create).
 * Outside Illustrator (opened in a browser) the preview works and Create is disabled.
 */
(function () {
  'use strict';

  const PREVIEW_DELAY_MS = 120;
  const DOT_SCALE = 0.9;
  const LIGHT_SKIN_THRESHOLD = 128;
  const THEME_EVENT = 'com.adobe.csxs.events.ThemeColorChanged';
  const cep = window.__adobe_cep__;
  const byId = (id) => document.getElementById(id);

  let currentType = 'text';
  let touched = false;
  let previewTimer = null;

  /* ---------- reading the form ---------- */

  function readPayload() {
    switch (currentType) {
      case 'wifi':
        return qrpWifiPayload(byId('ssid').value, byId('password').value, Number(byId('security').value), byId('hidden').checked);
      case 'email':
        return qrpEmailPayload(byId('to').value.trim(), byId('subject').value, byId('body').value);
      case 'phone':
        return qrpPhonePayload(byId('phone').value);
      default:
        return qrpTextPayload(byId('text').value);
    }
  }

  /** Validated options in the shape qr-place.jsx expects; throws Error with a user-facing message. */
  function readOptions() {
    const transparent = byId('transparent').checked;
    return {
      text: readPayload(),
      ecc: byId('ecc').value,
      size: qrpNumber(byId('size').value, 'Size', 10, 10000),
      quiet: Math.round(qrpNumber(byId('quiet').value, 'Quiet zone', 0, 16)),
      style: byId('style').value,
      foreground: toPlain(qrpHex(byId('fg').value, 'Colour')),
      background: transparent ? null : toPlain(qrpHex(byId('bg').value, 'Background')),
      at: byId('at').value,
    };
  }

  const toPlain = (rgb) => ({ r: rgb.r, g: rgb.g, b: rgb.b });
  const cssColor = (rgb) => `rgb(${rgb.r},${rgb.g},${rgb.b})`;

  /* ---------- preview ---------- */

  function loopsToPath(loops, q) {
    return loops.map((loop) => 'M' + loop.map(([x, y]) => `${x + q} ${y + q}`).join('L') + 'Z').join('');
  }

  function dotsMarkup(qr, q) {
    const r = DOT_SCALE / 2;
    const out = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.modules[y][x] && !__qrIsFinder(qr.size, x, y)) out.push(`<circle cx="${x + q + 0.5}" cy="${y + q + 0.5}" r="${r}"/>`);
      }
    }
    return out.join('');
  }

  /** SVG markup of the code in module units, the same geometry qr-draw.jsx builds in Illustrator. */
  function previewSvg(qr, opts) {
    const q = opts.quiet;
    const n = qr.size + 2 * q;
    const bg = opts.background ? `<rect width="${n}" height="${n}" fill="${cssColor(opts.background)}"/>` : '';
    const skip = opts.style === 'dots' ? (x, y) => !__qrIsFinder(qr.size, x, y) : undefined;
    const path = `<path fill-rule="nonzero" d="${loopsToPath(__qrOutlines(qr.modules, skip), q)}"/>`;
    const dots = opts.style === 'dots' ? dotsMarkup(qr, q) : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${bg}` +
      `<g fill="${cssColor(opts.foreground)}">${path}${dots}</g></svg>`;
  }

  function showInfo(text, isError) {
    const info = byId('info');
    info.textContent = text;
    info.classList.toggle('error', Boolean(isError));
  }

  function renderPreview() {
    const preview = byId('preview');
    try {
      const opts = readOptions();
      const qr = __qrEncode(opts.text, opts.ecc, 0);
      preview.innerHTML = previewSvg(qr, opts);
      const moduleSize = opts.size / (qr.size + 2 * opts.quiet);
      showInfo(`Version ${qr.version} · ${qr.size}×${qr.size} · ${qr.mode} · module ${moduleSize.toFixed(2)} pt`, false);
      byId('create').disabled = !cep;
      return true;
    } catch (err) {
      preview.innerHTML = '<span class="empty">No preview</span>';
      showInfo(touched ? err.message : 'Type a link or text to see the code.', touched);
      byId('create').disabled = true;
      return false;
    }
  }

  function schedulePreview() {
    touched = true;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, PREVIEW_DELAY_MS);
  }

  /* ---------- Illustrator ---------- */

  function setStatus(text, kind) {
    const status = byId('status');
    status.textContent = text;
    status.className = 'status' + (kind ? ' ' + kind : '');
  }

  /** JSON is a valid ExtendScript object literal once the two JS-only line separators are escaped. */
  const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
  const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

  function toScriptLiteral(value) {
    return JSON.stringify(value).replace(LINE_SEPARATOR, '\\u2028').replace(PARAGRAPH_SEPARATOR, '\\u2029');
  }

  function handleCreateResult(result) {
    const button = byId('create');
    button.disabled = false;
    const parts = String(result).split('\t');
    if (parts[0] === 'OK') {
      setStatus(`Created version ${parts[1]} (${parts[2]}×${parts[2]} modules).`, 'ok');
    } else if (parts[0] === 'ERR') {
      setStatus(parts.slice(1).join(' '), 'error');
    } else {
      setStatus('Illustrator did not run the panel script. Close and reopen the panel, then try again.', 'error');
    }
  }

  function create() {
    if (!cep) {
      setStatus('Open this panel inside Illustrator to create the code.', 'error');
      return;
    }
    let opts;
    try {
      opts = readOptions();
    } catch (err) {
      setStatus(err.message, 'error');
      return;
    }
    byId('create').disabled = true;
    setStatus('Creating…');
    withHost(() => cep.evalScript(`QRCodePanel.create(${toScriptLiteral(opts)})`, handleCreateResult));
  }

  /** Absolute path of this extension's jsx/host.jsx (getSystemPath returns a file:// URI on macOS). */
  function hostScriptPath() {
    const root = decodeURI(cep.getSystemPath('extension')).replace(/^file:\/\//, '');
    return `${root}/jsx/host.jsx`;
  }

  /**
   * Runs fn once QRCodePanel exists in Illustrator. The manifest's ScriptPath does not always load
   * (seen in Illustrator 30.1), so the panel loads its own host script when it is missing.
   */
  function withHost(fn) {
    try {
      const load = `if (typeof QRCodePanel === 'undefined') $.evalFile(new File(${toScriptLiteral(hostScriptPath())})); typeof QRCodePanel`;
      cep.evalScript(load, (type) => {
        if (type === 'object') {
          fn();
          return;
        }
        byId('create').disabled = false;
        setStatus(`Could not load the panel's Illustrator script (${type}). Reinstall the panel.`, 'error');
      });
    } catch (err) {
      byId('create').disabled = false;
      setStatus(`Could not reach Illustrator: ${err.message}`, 'error');
    }
  }

  /* ---------- theme ---------- */

  function applySkin() {
    if (!cep) return;
    try {
      const env = JSON.parse(cep.getHostEnvironment());
      const c = env.appSkinInfo.panelBackgroundColor.color;
      const shade = (c.red + c.green + c.blue) / 3;
      const root = document.documentElement;
      root.dataset.skin = shade >= LIGHT_SKIN_THRESHOLD ? 'light' : 'dark';
      root.style.setProperty('--bg', `rgb(${Math.round(c.red)},${Math.round(c.green)},${Math.round(c.blue)})`);
    } catch (err) {
      setStatus('Could not read Illustrator’s theme; using the dark theme.', '');
    }
  }

  /* ---------- wiring ---------- */

  function selectType(type) {
    currentType = type;
    for (const tab of document.querySelectorAll('#type button')) tab.setAttribute('aria-selected', String(tab.dataset.type === type));
    for (const page of document.querySelectorAll('.page')) page.hidden = page.dataset.page !== type;
    schedulePreview();
  }

  function linkColor(pickId, textId) {
    const pick = byId(pickId);
    const text = byId(textId);
    pick.addEventListener('input', () => {
      text.value = pick.value.toUpperCase();
      schedulePreview();
    });
    text.addEventListener('input', () => {
      if (/^#?[0-9a-f]{6}$/i.test(text.value.trim())) pick.value = '#' + text.value.trim().replace('#', '').toLowerCase();
    });
  }

  function init() {
    for (const tab of document.querySelectorAll('#type button')) tab.addEventListener('click', () => selectType(tab.dataset.type));
    document.querySelector('.panel').addEventListener('input', schedulePreview);
    document.querySelector('.panel').addEventListener('change', schedulePreview);
    linkColor('fgPick', 'fg');
    linkColor('bgPick', 'bg');
    byId('transparent').addEventListener('change', () => {
      byId('bg').disabled = byId('transparent').checked;
      byId('bgPick').disabled = byId('transparent').checked;
    });
    byId('create').addEventListener('click', create);
    applySkin();
    if (cep) cep.addEventListener(THEME_EVENT, applySkin);
    if (cep) withHost(() => setStatus('Ready: Create places the code on the active artboard.'));
    else setStatus('Preview only: open in Illustrator via Window › Extensions › QR Code.');
    renderPreview();
  }

  init();
})();
