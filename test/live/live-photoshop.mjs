/**
 * Live test suite against the real Photoshop, through the real MCP server.
 *   npm run test:live:ps         (Photoshop must be installed; it will be launched)
 * Creates its own document ("PsLiveSuite") and closes it without saving; other
 * open documents are left alone. Exit code 1 if any check fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { writePlaceholderAssets } from '../../scripts/lib/assets.mjs';
import { startClient } from '../../scripts/lib/mcp-client.mjs';

const DOC = 'PsLiveSuite';
const SAVED_NAME = 'post.psd';
const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-pslive-'));
const assets = writePlaceholderAssets(work);
const failures = [];
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

function check(label, cond, detail = '') {
  console.log(`  ${cond ? '✔' : '✘'} ${label}${cond ? '' : `  ${detail}`}`);
  if (!cond) failures.push(label);
}

function dims(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]).toString();
  return `${out.match(/pixelWidth: (\d+)/)[1]}x${out.match(/pixelHeight: (\d+)/)[1]}`;
}

async function psFont(c, queries, fallback) {
  for (const query of queries) {
    const res = await c.must('ps_list_fonts', { query, limit: 1 });
    if (res.fonts.length) return res.fonts[0].postscript;
  }
  return fallback;
}

const layerCount = async (c) => (await c.must('ps_get_document_info', {})).layer_count;

async function shapes(c) {
  console.log('document & shapes');
  const doc = await c.must('ps_new_document', { width: 1080, height: 1350, background: '#0B3D91', name: DOC });
  check('new document', doc.width === 1080 && doc.height === 1350 && doc.name === DOC, JSON.stringify(doc));
  const rect = await c.must('ps_add_shape', { shape: 'rectangle', x: 60, y: 60, w: 200, h: 100, fill: '#FFC20E', name: 'Rect' });
  check('rectangle box', near(rect.x, 60, 1) && near(rect.y, 60, 1) && near(rect.w, 200, 1) && near(rect.h, 100, 1), JSON.stringify(rect));
  check('rectangle is a shape layer', rect.kind === 'shape', rect.kind);
  for (const shape of ['rounded_rectangle', 'ellipse']) {
    const s = await c.must('ps_add_shape', { shape, x: 300, y: 60, w: 120, h: 100, fill: '#FFFFFF', group: 'Shapes' });
    check(`${shape} box in group`, near(s.x, 300) && near(s.w, 120) && near(s.h, 100) && s.group === 'Shapes', JSON.stringify(s));
  }
  const recolored = await c.must('ps_set_layer', { layer: 'Rect', color: '#E63946', opacity: 80, blend_mode: 'multiply' });
  check('set color/opacity/blend', recolored.opacity === 80 && recolored.blend_mode === 'multiply', JSON.stringify(recolored));
  const moved = await c.must('ps_set_layer', { layer: rect.id, x: 100, y: 1100, w: 300 });
  check('move + resize by id', near(moved.x, 100) && near(moved.y, 1100) && near(moved.w, 300) && near(moved.h, 150), JSON.stringify(moved));
  const dup = await c.must('ps_set_layer', { layer: 'Rect', duplicate: true, name: 'Rect copy', x: 500 });
  check('duplicate', dup.id !== rect.id && near(dup.x, 500), JSON.stringify(dup));
  const gone = await c.must('ps_set_layer', { layer: dup.id, delete: true });
  check('delete', gone.deleted === dup.id, JSON.stringify(gone));
}

async function text(c) {
  console.log('text');
  const bold = await psFont(c, ['AvenirNext-Bold', 'Helvetica-Bold', 'Arial-BoldMT'], 'ArialMT');
  const left = await c.must('ps_add_text', { text: 'ADMISSIONS OPEN', x: 60, y: 260, size: 72, color: '#FFFFFF', font: bold, name: 'Headline' });
  check('point text top-left at (x, y)', near(left.x, 60, 6) && near(left.y, 260, 3), JSON.stringify(left));
  check('text info', left.kind === 'text' && left.font === bold && near(left.size, 72, 0.5) && left.color === '#ffffff', JSON.stringify(left));
  const ctr = await c.must('ps_add_text', { text: 'Centred', x: 540, y: 400, size: 48, align: 'center', color: '#FFC20E', name: 'Centred' });
  check('centred text', near(ctr.x + ctr.w / 2, 540, 3) && near(ctr.y, 400, 3), JSON.stringify(ctr));
  const dev = await psFont(c, ['KohinoorDevanagari-Medium', 'devanagari'], bold);
  const nepali = 'बोस्टन इन्टरनेशनल कलेज';
  const ne = await c.must('ps_add_text', { text: nepali, x: 540, y: 500, size: 44, align: 'center', font: dev, color: '#FFFFFF', name: 'Nepali' });
  check('Nepali text round-trips', ne.text === nepali && ne.w > 100, JSON.stringify(ne));
  const para = await c.must('ps_add_text', {
    text: 'Paragraph text wraps inside its box when it is long enough.', x: 60, y: 600, width: 400, height: 200, size: 32, color: '#FFFFFF', name: 'Para',
  });
  check('paragraph text stays in its box', para.w <= 402 && para.h > 40, JSON.stringify(para));
  const edited = await c.must('ps_set_text', { layer: 'Centred', text: 'Centred and longer' });
  check('set_text keeps centre anchor', near(edited.x + edited.w / 2, 540, 3) && edited.text === 'Centred and longer', JSON.stringify(edited));
  const fit = await c.must('ps_set_text', { layer: 'Headline', max_width: 500 });
  check('max_width shrinks the font', fit.w <= 502 && fit.size < 72 && near(fit.x, 60, 6), JSON.stringify(fit));
  const bad = await c.callTool('ps_add_text', { text: 'x', x: 0, y: 0, font: 'NoSuchFont-Regular' });
  check('unknown font is a clear error', bad.isError && /ps_list_fonts/.test(bad.text), bad.text);
}

async function looks(c) {
  console.log('images, styles, adjustments, filters');
  const photo = await c.must('ps_place_image', { path: assets.photo, x: 0, y: 700, w: 1080, h: 380, mode: 'fill', name: 'Photo' });
  check('placed photo fills its box', photo.kind === 'smart_object' && near(photo.x, 0) && near(photo.y, 700) && near(photo.w, 1080) && near(photo.h, 380), JSON.stringify(photo));
  const logo = await c.must('ps_place_image', { path: assets.logo, x: 820, y: 60, w: 200, h: 200, mode: 'fit', name: 'Logo' });
  check('logo fits its box', logo.w <= 201 && logo.h <= 201 && (near(logo.w, 200) || near(logo.h, 200)), JSON.stringify(logo));
  const styled = await c.callTool('ps_layer_style', { layer: 'Headline', drop_shadow: { distance: 8, size: 12 }, stroke: { color: '#FFC20E', size: 2 } });
  check('drop shadow + stroke', !styled.isError, styled.text);
  const grad = await c.callTool('ps_layer_style', {
    layer: 'Centred', gradient_overlay: { stops: [{ color: '#FFC20E' }, { color: '#E63946' }], angle: 0 }, outer_glow: {},
  });
  check('gradient overlay + glow', !grad.isError, grad.text);
  const overlay = await c.callTool('ps_layer_style', { layer: 'Logo', color_overlay: { color: '#FFFFFF' } });
  check('color overlay', !overlay.isError, overlay.text);
  const cleared = await c.callTool('ps_layer_style', { layer: 'Logo', clear: true });
  check('clear style', !cleared.isError, cleared.text);
  const none = await c.callTool('ps_layer_style', { layer: 'Centred' });
  check('style without effects is a clear error', none.isError && /at least one/.test(none.text), none.text);
  const hs = await c.must('ps_adjust', { type: 'hue_saturation', layer: 'Photo', saturation: -40, name: 'Photo tone' });
  check('clipped hue/saturation layer', hs.kind === 'adjustment' && hs.clipped === true, JSON.stringify(hs));
  for (const type of ['brightness_contrast', 'levels', 'exposure', 'vibrance', 'black_white', 'invert', 'posterize', 'threshold']) {
    const adj = await c.callTool('ps_adjust', { type, layer: 'Photo' });
    check(`adjustment ${type}`, !adj.isError && adj.json.kind === 'adjustment', adj.text);
    if (!adj.isError) await c.must('ps_set_layer', { layer: adj.json.id, delete: true });
  }
  const blur = await c.callTool('ps_filter', { layer: 'Photo', filter: 'gaussian_blur', radius: 4 });
  check('smart filter on photo', !blur.isError && blur.json.smart_filter === true, blur.text);
  const textBlur = await c.callTool('ps_filter', { layer: 'Para', filter: 'motion_blur', distance: 10 });
  check('text converted before filtering', !textBlur.isError && textBlur.json.kind === 'smart_object', textBlur.text);
  for (const filter of ['unsharp_mask', 'add_noise', 'high_pass', 'sharpen']) {
    const f = await c.callTool('ps_filter', { layer: 'Photo', filter });
    check(`filter ${filter}`, !f.isError, f.text);
    if (!f.isError) await c.must('ps_undo', {});
  }
  await cutout(c);
}

/* Remove Background needs a real subject; the synthetic placeholder has none (Photoshop
   then spends minutes before giving up), so this runs only with PS_LIVE_SUBJECT_PHOTO. */
async function cutout(c) {
  const subject = process.env.PS_LIVE_SUBJECT_PHOTO;
  if (!subject) {
    console.log('  - cutout skipped (set PS_LIVE_SUBJECT_PHOTO to a photo of a person, animal or object)');
    return;
  }
  for (const [mode, h] of [['stretch', 300], ['fill', 600]]) {
    const placed = await c.must('ps_place_image', { path: subject, x: 0, y: 0, w: 500, h, mode, name: `Cutout ${mode}` });
    const removed = await c.callTool('ps_cutout', { layer: placed.id });
    check(`remove background (${mode})`, !removed.isError && removed.json.masked === true, removed.text);
    await c.must('ps_set_layer', { layer: placed.id, delete: true });
  }
}

async function arrange(c) {
  console.log('groups, alignment, undo, canvas');
  const g = await c.must('ps_group', { layers: ['Headline', 'Centred'], name: 'Titles' });
  check('group', g.kind === 'group' && g.name === 'Titles', JSON.stringify(g));
  const ug = await c.must('ps_group', { action: 'ungroup', layer: 'Titles' });
  check('ungroup', ug.ungrouped.length === 2, JSON.stringify(ug));
  const al = await c.must('ps_align', { layers: ['Nepali'], horizontal: 'right', vertical: 'bottom', margin: 40 });
  const n = al.layers[0];
  check('align right/bottom with margin', near(n.x + n.w, 1040) && near(n.y + n.h, 1310), JSON.stringify(n));
  const before = await layerCount(c);
  await c.must('ps_add_shape', { shape: 'ellipse', x: 10, y: 10, w: 20, h: 20 });
  await c.must('ps_add_shape', { shape: 'ellipse', x: 40, y: 10, w: 20, h: 20 });
  const undone = await c.must('ps_undo', { steps: 2 });
  check('undo 2 tool calls', undone.undone === 2 && (await layerCount(c)) === before, JSON.stringify(undone));
  const grown = await c.must('ps_canvas', { action: 'resize_canvas', width: 1200, height: 1350, anchor: 'left' });
  check('resize canvas', grown.width === 1200, JSON.stringify(grown));
  const un = await c.must('ps_undo', {});
  const back = (await c.must('ps_status', {})).documents.find((d) => d.name === DOC);
  check('canvas undo', back && back.width === 1080, `${JSON.stringify(un)} ${JSON.stringify(back)}`);
}

async function exportsAndFiles(c) {
  console.log('preview, export, save');
  const pv = await c.callTool('ps_preview', { max_size: 600 });
  check('preview returns an image', !pv.isError && pv.images.length === 1 && pv.images[0].mimeType === 'image/png', pv.text);
  if (pv.images.length) writeFileSync(join(work, 'preview.png'), Buffer.from(pv.images[0].data, 'base64'));
  check('preview size', pv.json && pv.json.height === 600 && pv.json.width === 480, pv.text);
  const png = join(work, 'out', 'post.png');
  const e1 = await c.must('ps_export', { path: png, width: 540 });
  check('png export size', existsSync(png) && dims(png) === '540x675', `${e1.width}x${e1.height}`);
  const again = await c.callTool('ps_export', { path: png });
  check('export refuses to overwrite', again.isError && /overwrite/.test(again.text), again.text);
  const jpg = join(work, 'post.jpg');
  await c.must('ps_export', { path: jpg, scale: 0.5, quality: 70 });
  check('jpg export', existsSync(jpg) && dims(jpg) === '540x675');
  const clear = join(work, 'clear.png');
  await c.must('ps_export', { path: clear, transparent: true, width: 200 });
  check('transparent png export', existsSync(clear) && dims(clear) === '200x250');
  const status = (await c.must('ps_status', {})).documents.find((d) => d.name === DOC);
  check('export leaves the document unchanged', status && status.width === 1080, JSON.stringify(status));
  const psd = join(work, SAVED_NAME);
  const saved = await c.must('ps_save', { path: psd });
  check('save psd', existsSync(psd) && saved.path.endsWith(SAVED_NAME), JSON.stringify(saved));
  const info = await c.must('ps_get_document_info', {});
  check('document info lists layers', info.layer_count >= 8 && info.layers.some((l) => l.name === 'Photo'), String(info.layer_count));
}

/* Closes only the document this suite created (under its original or saved name). */
async function closeOwnDocument(c) {
  const st = await c.callTool('ps_status', {});
  const own = st.json?.documents.find((d) => d.name === DOC || (d.name === SAVED_NAME && d.path?.includes(basename(work))));
  if (own) await c.callTool('ps_close', { document: own.name });
}

async function main() {
  const c = await startClient();
  try {
    const st = await c.must('ps_status', {});
    console.log(`Photoshop ${st.version}; ${(await c.listTools()).length} tools`);
    await shapes(c);
    await text(c);
    await looks(c);
    await arrange(c);
    await exportsAndFiles(c);
  } catch (err) {
    failures.push(`crashed: ${err.message}`);
    console.error(err);
  } finally {
    if (process.env.KEEP_LIVE_DOC !== '1') await closeOwnDocument(c);
    await c.close();
  }
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nall live checks passed');
  console.log(`artifacts: ${work}`);
  if (!failures.length && process.env.KEEP_LIVE_ARTIFACTS !== '1') rmSync(work, { recursive: true, force: true });
  process.exit(failures.length ? 1 : 0);
}

main();
