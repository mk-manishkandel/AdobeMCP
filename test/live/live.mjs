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

async function capabilities(c) {
  console.log('gradients, effects, paths, runs, copy');
  await c.must('ai_new_document', { width: 800, height: 800, background: '#101020', name: 'LiveSource' });
  await c.must('ai_add_shape', { shape: 'ellipse', x: 300, y: 300, w: 120, h: 80, fill: '#FFC20E', name: 'Logo' });
  await c.must('ai_new_document', { width: 1080, height: 1080, background: '#05060F', name: 'LiveCaps' });
  const grad = { type: 'linear', angle: -90, stops: [{ color: '#FF2BD6', position: 0 }, { color: '#00E5FF', position: 100 }] };
  const g = await c.must('ai_add_shape', { shape: 'rectangle', x: 60, y: 60, w: 400, h: 200, fill: grad, name: 'GradRect' });
  check('gradient fill on shape', g.fill === 'gradient', JSON.stringify(g));
  const tri = await c.must('ai_add_shape', { shape: 'path', vertices: [[600, 60], [700, 260], [500, 260]], closed: true, fill: '#00E5FF', name: 'Tri' });
  check('closed path box', near(tri.x, 500) && near(tri.y, 60) && near(tri.w, 200) && near(tri.h, 200), JSON.stringify(tri));
  const open = await c.must('ai_add_shape', { shape: 'path', vertices: [[60, 400], [300, 450]], stroke: '#FFFFFF', stroke_width: 4, name: 'Open' });
  check('open path uses stroke', open.stroke === '#ffffff' && open.fill === 'none', JSON.stringify(open));
  await c.must('ai_add_text', { text: 'NEON', x: 60, y: 500, size: 120, color: '#FFFFFF', font: 'AvenirNext-Heavy', name: 'Neon' });
  const live = await c.callTool('ai_set_item', { item: 'Neon', fill: grad });
  check('gradient on live text explains outline', live.isError && /outline: true/.test(live.text), live.text);
  const out = await c.must('ai_set_item', { item: 'Neon', outline: true, fill: grad, glow: { color: '#FF2BD6', radius: 16 } });
  check('outlined text takes gradient + glow', out.fill === 'gradient' && out.name === 'Neon' && typeof out.glow_id === 'string', JSON.stringify(out));
  const sh = await c.must('ai_set_item', { item: 'GradRect', shadow: { x: 6, y: 10 }, blur: 0 });
  check('shadow helper created', typeof sh.shadow_id === 'string', JSON.stringify(sh));
  const names = (await c.must('ai_get_document_info', {})).items.map((i) => i.name);
  check('effect copies are named', names.includes('Neon glow') && names.includes('GradRect shadow'), names.join(','));
  const runs = await c.must('ai_add_text', { text: 'GO V5', x: 60, y: 760, size: 60, color: '#FFFFFF', font: 'AvenirNext-Bold', runs: [{ start: 0, length: 2, color: '#FF0000' }, { match: 'V5', size: 90 }], name: 'Runs' });
  check('text runs restyle parts', runs.color === '#ff0000' && runs.h > 70, JSON.stringify(runs));
  const cp = await c.must('ai_copy_items', { from_document: 'LiveSource', items: ['Logo'], x: 40, y: 900 });
  const logo = cp.items[0];
  check('copy_items from another document', near(logo.x, 40) && near(logo.y, 900) && near(logo.w, 120) && logo.fill === '#ffc20e', JSON.stringify(cp));
  const sw = await c.must('ai_open', { document: 'LiveSource' });
  check('ai_open switches to an open document', sw.name === 'LiveSource', sw.name);
  await c.must('ai_close', {});
  await c.must('ai_close', { document: 'LiveCaps' });
}

async function structureAndLibrary(c) {
  console.log('curves, strokes, groups, pathfinder, layers, swatches, symbols, styles');
  await c.must('ai_new_document', { width: 1200, height: 900, background: '#FFFFFF', name: 'LiveMore' });
  const curve = await c.must('ai_add_shape', {
    shape: 'path', closed: true, fill: '#2878DC', name: 'Drop',
    vertices: [{ x: 100, y: 60, in: [60, 60], out: [140, 60] }, [180, 200], [20, 200]],
  });
  check('curved path', curve.type === 'path' && near(curve.y, 60, 2) && curve.h > 120, JSON.stringify(curve));
  await c.must('ai_add_shape', { shape: 'line', x: 220, y: 60, x2: 420, y2: 60, stroke: '#000000', stroke_width: 6, dash: [12, 6], cap: 'round', name: 'Dashed' });
  const dash = await c.callTool('ai_run_script', { code: "var p=app.activeDocument.pageItems.getByName('Dashed'); p.strokeDashes.length+' '+p.strokeCap" });
  check('dash + round cap', /^2 StrokeCap.ROUNDENDCAP/.test(dash.text), dash.text);
  await c.must('ai_set_item', { item: 'Drop', blend_mode: 'multiply' });
  const bm = await c.callTool('ai_run_script', { code: "String(app.activeDocument.pageItems.getByName('Drop').blendingMode)" });
  check('blend mode', /MULTIPLY/.test(bm.text), bm.text);

  await c.must('ai_swatch', { action: 'add', name: 'Brand Gold', color: '#FFC20E' });
  const sw = await c.must('ai_add_shape', { shape: 'rectangle', x: 450, y: 40, w: 100, h: 60, fill: 'swatch:Brand Gold', name: 'SwatchRect' });
  check('swatch paint', sw.fill === '#ffc20e', JSON.stringify(sw));
  const swl = await c.must('ai_swatch', { action: 'list', query: 'brand' });
  check('swatch list', swl.total === 1 && swl.items[0].kind === 'color', JSON.stringify(swl));

  await c.must('ai_add_shape', { shape: 'rectangle', x: 40, y: 260, w: 160, h: 120, fill: '#E83A3A', name: 'PA' });
  await c.must('ai_add_shape', { shape: 'ellipse', x: 120, y: 300, w: 120, h: 120, fill: '#2878DC', name: 'PB' });
  const pf = await c.must('ai_pathfinder', { items: ['PA', 'PB'], operation: 'minus_front', name: 'Cut' });
  check('pathfinder minus_front', pf.name === 'Cut' && near(pf.w, 160, 1) && near(pf.h, 120, 1) && pf.fill === '#e83a3a', JSON.stringify(pf));

  await c.must('ai_add_shape', { shape: 'rectangle', x: 300, y: 260, w: 200, h: 140, fill: '#00A86B', name: 'Photoish' });
  await c.must('ai_add_shape', { shape: 'ellipse', x: 340, y: 270, w: 120, h: 120, name: 'Circle' });
  const clip = await c.must('ai_group', { action: 'clip', items: ['Photoish'], mask: 'Circle', name: 'Clipped' });
  check('clipping mask', clip.type === 'group' && near(clip.w, 120, 1) && near(clip.h, 120, 1), JSON.stringify(clip));
  const un = await c.must('ai_group', { action: 'ungroup', item: 'Clipped' });
  check('release clip', un.ungrouped.length === 1 && un.removed_mask && near(un.ungrouped[0].w, 200), JSON.stringify(un));
  const g = await c.must('ai_group', { action: 'group', items: ['SwatchRect', 'Dashed'], name: 'Pair' });
  check('group', g.type === 'group' && near(g.x, 220, 4) && near(g.w, 330, 6), JSON.stringify(g));

  const la = await c.must('ai_layer', { action: 'add', name: 'Overlay', position: 'top' });
  check('layer add on top', la.layers[0].name === 'Overlay', JSON.stringify(la.layers));
  const lu = await c.must('ai_layer', { action: 'update', name: 'Overlay', new_name: 'FX', locked: true });
  check('layer update', lu.layers[0].name === 'FX' && lu.layers[0].locked, JSON.stringify(lu.layers));
  const ld = await c.must('ai_layer', { action: 'delete', name: 'FX' });
  check('layer delete', !ld.layers.some((l) => l.name === 'FX'));

  const sc = await c.must('ai_symbol', { action: 'create', item: 'Drop', symbol: 'DropSym', replace: true });
  check('symbol create + replace', sc.symbol === 'DropSym' && sc.item.type === 'symbol', JSON.stringify(sc));
  const sp = await c.must('ai_symbol', { action: 'place', symbol: 'DropSym', x: 600, y: 260, w: 80, name: 'DropCopy' });
  check('symbol place', near(sp.x, 600) && near(sp.y, 260) && near(sp.w, 80, 1), JSON.stringify(sp));
  const gs = await c.must('ai_graphic_style', { action: 'list' });
  if (gs.items.length > 1) {
    const st = (gs.items.find((s) => s.name === 'Drop Shadow') ?? gs.items.find((s) => s.name !== '[Default]')).name;
    const ap = await c.must('ai_graphic_style', { action: 'apply', name: st, items: ['Cut'] });
    check('graphic style merges and keeps the fill', ap.style === st && ap.items[0].fill === '#e83a3a', JSON.stringify(ap));
  } else {
    check('graphic styles listed', gs.total >= 1, JSON.stringify(gs));
  }
}

async function distortTraceAndPdf(c) {
  console.log('distort, extrude, trace, print pdf');
  const star = (name, i) => c.must('ai_add_shape', { shape: 'star', x: 40 + i * 190, y: 500, w: 140, h: 120, fill: '#2878DC', name });
  await star('Warp', 0);
  await c.must('ai_distort', { item: 'Warp', effect: 'warp', style: 'arc', amount: 50 });
  const vb = await c.callTool('ai_run_script', { code: "var b=app.activeDocument.pageItems.getByName('Warp').visibleBounds; Math.round(b[2]-b[0])" });
  check('warp arc widens the visible shape', Number(vb.text) > 150, vb.text);
  await star('Twirl', 1);
  await c.must('ai_distort', { item: 'Twirl', effect: 'twirl', angle: 90 });
  await star('Rough', 2);
  await c.must('ai_distort', { item: 'Rough', effect: 'roughen', size: 6, detail: 12 });
  await star('Pucker', 3);
  const pk = await c.must('ai_distort', { item: 'Pucker', effect: 'pucker_bloat', amount: -60 });
  check('pucker keeps item', pk.name === 'Pucker' && pk.type === 'path', JSON.stringify(pk));
  await star('Bloat', 4);
  await c.must('ai_distort', { item: 'Bloat', effect: 'pucker_bloat', amount: 60 });
  await c.must('ai_add_text', { text: 'V5', x: 40, y: 700, size: 120, color: '#FFC20E', font: 'AvenirNext-Heavy', name: 'Deep' });
  const ex = await c.must('ai_distort', { item: 'Deep', effect: 'extrude', depth: 16, angle: 45 });
  check('extrude', typeof ex.extrude_id === 'string', JSON.stringify(ex));
  const ew = await c.must('ai_distort', { item: 'Twirl', effect: 'warp', style: 'flag', amount: 40, expand: true });
  check('expand live effect', ew.name === 'Twirl', JSON.stringify(ew));

  const pv = await c.callTool('ai_preview', { max_size: 1200 });
  if (process.env.LIVE_PREVIEW_OUT) writeFileSync(process.env.LIVE_PREVIEW_OUT, Buffer.from(pv.images[0].data, 'base64'));

  const pr = await c.must('ai_trace_image', { list_presets: true });
  check('tracing presets', pr.presets.includes('[Default]'), pr.presets.join(','));
  const img = await c.must('ai_place_image', { path: assets.photo, x: 800, y: 600, w: 200, h: 200, mode: 'stretch', embed: true, name: 'ToTrace' });
  const tr = await c.must('ai_trace_image', { item: img.id, preset: '6 Colors', name: 'Traced' });
  check('image trace expands to vectors', tr.type === 'group' && tr.name === 'Traced', JSON.stringify(tr));

  const pp = await c.must('ai_export_pdf', { list_presets: true });
  check('pdf presets', pp.presets.includes('[High Quality Print]'), pp.presets.join(','));
  const pdfPath = join(work, 'out/print.pdf');
  const pdf = await c.must('ai_export_pdf', { path: pdfPath, artboards: [0], cmyk: true, bleed: 9, crop_marks: true });
  check('print pdf (cmyk via PDF/X-1a)', existsSync(pdfPath) && readFileSync(pdfPath).subarray(0, 4).toString() === '%PDF' && pdf.preset === '[PDF/X-1a:2001]', JSON.stringify(pdf));
  const again = await c.callTool('ai_export_pdf', { path: pdfPath });
  check('pdf no-clobber', again.isError && /overwrite/.test(again.text), again.text);
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
    await capabilities(c);
    await structureAndLibrary(c);
    await distortTraceAndPdf(c);
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
