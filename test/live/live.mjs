/**
 * Live test suite against the real Illustrator, through the real MCP server.
 *   npm run test:live            (Illustrator must be installed; it will be launched)
 * Creates its own documents and closes them without saving; other open
 * documents are left alone. Exit code 1 if any check fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePlaceholderAssets } from '../../scripts/lib/assets.mjs';
import { pickFont, startClient } from '../../scripts/lib/mcp-client.mjs';

const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-live-'));
const assets = writePlaceholderAssets(work);
const failures = [];
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

function check(label, cond, detail = '') {
  console.log(`  ${cond ? '✔' : '✘'} ${label}${cond ? '' : `  ${detail}`}`);
  if (!cond) failures.push(label);
}

function dims(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]).toString();
  return `${out.match(/pixelWidth: (\d+)/)[1]}x${out.match(/pixelHeight: (\d+)/)[1]}`;
}

async function shapesAndText(c) {
  console.log('shapes & text');
  await c.must('ai_new_document', { width: 1080, height: 1080, background: '#0B3D91', name: 'LiveSuite', artboard_name: 'Post' });
  const rect = await c.must('ai_add_shape', { shape: 'rectangle', x: 60, y: 60, w: 200, h: 100, fill: '#FFC20E', name: 'Rect' });
  check('rectangle box', rect.x === 60 && rect.y === 60 && rect.w === 200 && rect.h === 100, JSON.stringify(rect));
  for (const shape of ['rounded_rectangle', 'ellipse', 'polygon', 'star']) {
    const s = await c.must('ai_add_shape', { shape, x: 300, y: 60, w: 120, h: 100, fill: '#FFFFFF' });
    check(`${shape} box`, near(s.x, 300) && near(s.y, 60) && near(s.w, 120) && near(s.h, 100), JSON.stringify(s));
  }
  const line = await c.must('ai_add_shape', { shape: 'line', x: 60, y: 200, x2: 1020, y2: 200, stroke: '#FFFFFF', stroke_width: 3 });
  check('line', near(line.x, 60) && near(line.w, 960) && line.stroke_width === 3, JSON.stringify(line));

  const bold = await pickFont(c, ['helvetica neue bold', 'arial bold'], 'MyriadPro-Bold');
  const left = await c.must('ai_add_text', { text: 'ADMISSIONS OPEN', x: 60, y: 260, size: 72, color: '#FFFFFF', font: bold, name: 'Headline' });
  check('point text left anchor', near(left.x, 60) && near(left.y, 260), JSON.stringify(left));
  const ctr = await c.must('ai_add_text', { text: 'Centred', x: 540, y: 380, size: 48, align: 'center', name: 'Centred' });
  check('point text centre anchor', near(ctr.x + ctr.w / 2, 540) && near(ctr.y, 380), JSON.stringify(ctr));
  const right = await c.must('ai_add_text', { text: 'Right', x: 1020, y: 460, size: 40, align: 'right' });
  check('point text right anchor', near(right.x + right.w, 1020), JSON.stringify(right));

  const dev = await pickFont(c, ['kohinoor devanagari semibold', 'devanagari'], null);
  const nepali = 'भर्ना खुला छ — बोस्टन इन्टरनेशनल कलेज';
  const ne = await c.must('ai_add_text', { text: nepali, x: 540, y: 540, size: 44, align: 'center', font: dev, name: 'Nepali' });
  check('Devanagari round-trip', ne.text === nepali && ne.font === dev, JSON.stringify(ne));
  const area = await c.must('ai_add_text', { text: 'Bachelor programmes in IT, Business and Hospitality. Scholarships available. Apply before Mangsir 30.', x: 60, y: 640, width: 600, size: 30 });
  check('area text auto height, no overflow', area.overflow === false && near(area.w, 600), JSON.stringify(area));
  const tight = await c.must('ai_add_text', { text: 'This text is far too long for a tiny box and must overflow the frame.', x: 700, y: 640, width: 300, height: 40, size: 30, name: 'Tight' });
  check('area overflow detected', tight.overflow === true);
}

async function textEdits(c) {
  console.log('template filling');
  const s = await c.must('ai_set_text', { item: 'Headline', text: 'ADMISSIONS OPEN FOR FALL 2026 INTAKE NOW', max_width: 960 });
  check('max_width shrink', s.w <= 960.5 && s.w > 900 && s.size < 72 && near(s.x, 60) && near(s.y, 260), JSON.stringify(s));
  const before = (await c.must('ai_get_document_info', {})).items.find((i) => i.name === 'Nepali');
  const k = await c.must('ai_set_text', { item: 'Nepali', text: 'भर्ना खुला छ', size: 56, keep_center: true });
  check('keep_center', near(k.x + k.w / 2, before.x + before.w / 2, 1) && near(k.y + k.h / 2, before.y + before.h / 2, 1));
  const f = await c.must('ai_set_text', { item: 'Tight', shrink_to_fit: true, min_size: 6 });
  check('shrink_to_fit removes overflow', f.overflow === false && f.size < 30, JSON.stringify(f));
  const nf = await c.callTool('ai_set_text', { item: 'Headline', font: 'NoSuchFont-Bold' });
  check('missing font error', nf.isError && /ai_list_fonts/.test(nf.text), nf.text);
  const ni = await c.callTool('ai_set_item', { item: 'Nope', x: 0 });
  check('missing item error', ni.isError && /Item not found/.test(ni.text), ni.text);
}

async function itemEdits(c) {
  console.log('items, artboards, images, align');
  const m = await c.must('ai_set_item', { item: 'Rect', x: 100, y: 900, w: 300, name: 'Bar', opacity: 80 });
  check('move + proportional resize', m.x === 100 && m.y === 900 && near(m.w, 300) && near(m.h, 150) && m.opacity === 80, JSON.stringify(m));
  const r = await c.must('ai_set_item', { item: 'Bar', rotate: 90 });
  check('rotate', near(r.w, 150) && near(r.h, 300));
  const info = await c.must('ai_get_document_info', {});
  const bg = info.items.find((i) => i.layer === 'Background');
  const bg2 = await c.must('ai_set_item', { item: bg.id, fill: '#123A7A' });
  const layers = (await c.must('ai_get_document_info', {})).layers;
  check('edit on locked Background layer, relocked', bg2.fill === '#123a7a' && layers.find((l) => l.name === 'Background').locked);
  await c.must('ai_set_item', { item: 'Bar', arrange: 'send_to_back' });
  const content = (await c.must('ai_get_document_info', {})).items.filter((i) => i.layer === 'Content');
  check('arrange send_to_back', content.at(-1).name === 'Bar');

  const ab = await c.must('ai_add_artboard', { width: 1080, height: 1920, name: 'Story', background: '#123A7A' });
  check('add story artboard', ab.index === 1 && ab.h === 1920 && ab.active);
  const dup = await c.must('ai_set_item', { item: 'Headline', duplicate: true, to_artboard: 1, name: 'Headline Story' });
  check('duplicate to artboard', dup.artboard === 1 && near(dup.x, 60) && near(dup.y, 260), JSON.stringify(dup));
  const al = await c.must('ai_align', { items: ['Headline Story'], horizontal: 'center', vertical: 'bottom', margin: 100 });
  const a0 = al.items[0];
  check('align centre/bottom + margin', near(a0.x + a0.w / 2, 540) && near(a0.y + a0.h, 1820), JSON.stringify(a0));

  const fill = await c.must('ai_place_image', { path: assets.photo, x: 0, y: 400, w: 1080, h: 600, mode: 'fill', artboard: 1, name: 'Photo' });
  check('fill → clipping group with box bounds', fill.clipped && fill.x === 0 && fill.y === 400 && fill.w === 1080 && fill.h === 600, JSON.stringify(fill));
  const fit = await c.must('ai_place_image', { path: assets.logo, x: 60, y: 60, w: 300, h: 150, mode: 'fit', focus: 'left', artboard: 1 });
  check('fit (svg logo) inside box', fit.x === 60 && near(fit.w, 150) && near(fit.h, 150), JSON.stringify(fit));
  const st = await c.must('ai_place_image', { path: assets.photo, x: 600, y: 1100, w: 400, h: 100, mode: 'stretch', embed: true, artboard: 1 });
  check('stretch + embed', st.embedded && near(st.w, 400) && near(st.h, 100), JSON.stringify(st));
  const nat = await c.must('ai_place_image', { path: assets.photo, x: 0, y: 1500, mode: 'none', artboard: 1 });
  const del = await c.must('ai_set_item', { item: nat.id, delete: true });
  check('delete linked image by id', del.deleted === nat.id, JSON.stringify(del));
  const mv = await c.must('ai_set_item', { item: 'Photo', y: 420 });
  check('move clipping group by mask box', mv.y === 420 && mv.h === 600);
}

async function exportsAndFiles(c) {
  console.log('preview, export, undo, save/open');
  const pv = await c.callTool('ai_preview', { artboard: 1, max_size: 600 });
  const img = pv.images[0];
  check('preview returns PNG image content over stdio', img && img.mimeType === 'image/png' && Buffer.from(img.data, 'base64').subarray(1, 4).toString() === 'PNG');
  if (img) writeFileSync(join(work, 'preview-story.png'), Buffer.from(img.data, 'base64'));
  const png = await c.must('ai_export', { path: join(work, 'out/post.png'), artboard: 0, width: 1080 });
  check('png width 1080', dims(png.path) === '1080x1080');
  const jpg = await c.must('ai_export', { path: join(work, 'out/story.jpg'), artboard: 1, width: 540 });
  check('jpg 540x960', dims(jpg.path) === '540x960');
  const svg = await c.must('ai_export', { path: join(work, 'out/post.svg'), artboard: 0 });
  check('svg', /<svg/.test(readFileSync(svg.path, 'utf8')));
  const webp = await c.must('ai_export', { path: join(work, 'out/post.webp'), artboard: 0, height: 500 });
  check('webp', readFileSync(webp.path).subarray(8, 12).toString() === 'WEBP');
  await c.must('ai_add_shape', { shape: 'rectangle', x: 10, y: 10, w: 50, h: 50, name: 'UndoMe', artboard: 0 });
  await c.must('ai_undo', { steps: 3 });
  check('undo', !(await c.must('ai_get_document_info', {})).items.some((i) => i.name === 'UndoMe'));
  const aiPath = join(work, 'out/LiveSuite.ai');
  await c.must('ai_save', { path: aiPath });
  await c.must('ai_save', { path: join(work, 'out/LiveSuite.pdf') });
  check('save .ai and .pdf', existsSync(aiPath) && existsSync(join(work, 'out/LiveSuite.pdf')));
  await c.must('ai_close', {});
  const op = await c.must('ai_open', { path: aiPath });
  check('reopen keeps artboards', op.artboards.length === 2 && op.artboards[1].name === 'Story');
  await c.must('ai_close', {});
}

async function main() {
  const c = await startClient();
  try {
    const st = await c.must('ai_status', {});
    console.log(`Illustrator ${st.version}; ${(await c.listTools()).length} tools`);
    await shapesAndText(c);
    await textEdits(c);
    await itemEdits(c);
    await exportsAndFiles(c);
    const cm = await c.must('ai_new_document', { width: 595, height: 842, color_mode: 'cmyk' });
    check('cmyk document', cm.colorSpace === 'cmyk');
    await c.must('ai_close', {});
  } catch (err) {
    failures.push(`crashed: ${err.message}`);
    console.error(err);
  } finally {
    await c.close();
  }
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nall live checks passed');
  console.log(`artifacts: ${work}`);
  if (!failures.length && process.env.KEEP_LIVE_ARTIFACTS !== '1') rmSync(work, { recursive: true, force: true });
  process.exit(failures.length ? 1 : 0);
}

main();
