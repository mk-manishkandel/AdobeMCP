/**
 * Phase 3 end-to-end demo: builds a 1080x1080 admission post and a 1080x1920
 * story variant in Illustrator purely through MCP tool calls, then exports
 * both as PNG and saves the .ai.
 *
 *   npm run demo [-- --photo /abs/campus.jpg --logo /abs/logo.svg --out /abs/dir]
 *
 * Without --photo/--logo, generated placeholder images are used.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writePlaceholderAssets } from './lib/assets.mjs';
import { ROOT, pickFont, startClient } from './lib/mcp-client.mjs';

const BRAND = Object.freeze({ navy: '#0B3D91', gold: '#FFC20E', white: '#FFFFFF' });
const POST = Object.freeze({ w: 1080, h: 1080 });
const STORY = Object.freeze({ w: 1080, h: 1920 });
const MARGIN = 80;
/** Bottom band of a story that Instagram/Facebook cover with the reply bar. */
const STORY_SAFE_BOTTOM = 250;
const COPY = Object.freeze({
  headline: 'ADMISSIONS OPEN',
  subline: "Fall 2026 Intake · Bachelor's Programmes",
  nepali: 'भर्ना खुला छ — आजै आवेदन दिनुहोस्',
  cta: 'APPLY NOW',
  footer: 'Boston International College',
});

function readOptions() {
  const { values } = parseArgs({
    options: { photo: { type: 'string' }, logo: { type: 'string' }, out: { type: 'string' } },
  });
  const out = resolve(values.out ?? join(ROOT, 'out'));
  mkdirSync(out, { recursive: true });
  const placeholders = values.photo && values.logo ? {} : writePlaceholderAssets(join(out, 'assets'));
  const photo = resolve(values.photo ?? placeholders.photo);
  const logo = resolve(values.logo ?? placeholders.logo);
  for (const path of [photo, logo]) {
    if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  }
  return { out, photo, logo };
}

async function pickFonts(c) {
  return {
    bold: await pickFont(c, ['helvetica neue bold', 'arial bold'], 'MyriadPro-Bold'),
    regular: await pickFont(c, ['helvetica neue', 'arial'], 'MyriadPro-Regular'),
    nepali: await pickFont(c, ['kohinoor devanagari semibold', 'kohinoor devanagari', 'devanagari'], null),
  };
}

/** Centres an item inside a box (both in artboard coordinates). */
function centreIn(c, item, box) {
  return c.must('ai_set_item', { item: item.id, x: box.x + (box.w - item.w) / 2, y: box.y + (box.h - item.h) / 2 });
}

/** Vertically centres an item on a box without moving it horizontally. */
function middleOf(c, item, box) {
  return c.must('ai_set_item', { item: item.id, y: box.y + (box.h - item.h) / 2 });
}

async function buildPost(c, fonts, { photo, logo }) {
  await c.must('ai_new_document', { width: POST.w, height: POST.h, background: BRAND.navy, name: 'Admission 2026', artboard_name: 'Post' });
  await c.must('ai_place_image', { path: photo, x: 0, y: 0, w: POST.w, h: 560, mode: 'fill', name: 'Photo' });
  await c.must('ai_place_image', { path: logo, x: 48, y: 48, w: 140, h: 140, mode: 'fit', focus: 'left', name: 'Logo' });
  await c.must('ai_add_shape', { shape: 'rectangle', x: MARGIN, y: 608, w: 120, h: 8, fill: BRAND.gold, name: 'Accent' });

  await c.must('ai_add_text', { text: COPY.headline, x: MARGIN, y: 636, size: 96, color: BRAND.white, font: fonts.bold, name: 'Headline' });
  const headline = await c.must('ai_set_text', { item: 'Headline', max_width: POST.w - 2 * MARGIN });
  const sub = await c.must('ai_add_text', { text: COPY.subline, x: MARGIN, y: headline.y + headline.h + 20, size: 36, color: BRAND.white, font: fonts.regular, name: 'Subline' });
  const nepaliArgs = { text: COPY.nepali, x: MARGIN, y: sub.y + sub.h + 18, size: 40, color: BRAND.gold, name: 'Nepali' };
  await c.must('ai_add_text', fonts.nepali ? { ...nepaliArgs, font: fonts.nepali } : nepaliArgs);

  const button = await c.must('ai_add_shape', { shape: 'rounded_rectangle', x: MARGIN, y: 930, w: 300, h: 80, radius: 40, fill: BRAND.gold, name: 'CTA Button' });
  const label = await c.must('ai_add_text', { text: COPY.cta, x: MARGIN, y: 930, size: 32, tracking: 80, color: BRAND.navy, font: fonts.bold, name: 'CTA Label' });
  await centreIn(c, label, button);
  const footer = await c.must('ai_add_text', { text: COPY.footer, x: POST.w - MARGIN, y: 930, size: 26, align: 'right', color: BRAND.white, font: fonts.regular, name: 'Footer' });
  await middleOf(c, footer, button);
}

function copyToStory(c, name, edits = {}) {
  return c.must('ai_set_item', { item: name, duplicate: true, to_artboard: 1, name: `${name} Story`, ...edits });
}

/** Copies a text item to the story, resizes its font, and puts its top-left at (MARGIN, y). */
async function copyAndRestyle(c, name, size, y) {
  await copyToStory(c, name);
  await c.must('ai_set_text', { item: `${name} Story`, size });
  return c.must('ai_set_item', { item: `${name} Story`, x: MARGIN, y });
}

async function buildStory(c, { photo, logo }) {
  await c.must('ai_add_artboard', { width: STORY.w, height: STORY.h, name: 'Story', background: BRAND.navy });
  await c.must('ai_place_image', { path: photo, x: 0, y: 0, w: STORY.w, h: 1000, mode: 'fill', artboard: 1, name: 'Photo Story' });
  await c.must('ai_place_image', { path: logo, x: 60, y: 80, w: 180, h: 180, mode: 'fit', focus: 'left', artboard: 1, name: 'Logo Story' });
  await copyToStory(c, 'Accent', { x: MARGIN, y: 1080 });

  await copyToStory(c, 'Headline');
  await c.must('ai_set_text', { item: 'Headline Story', size: 120, max_width: STORY.w - 2 * MARGIN });
  const headline = await c.must('ai_set_item', { item: 'Headline Story', x: MARGIN, y: 1112 });
  const sub = await copyAndRestyle(c, 'Subline', 44, headline.y + headline.h + 32);
  const nepali = await copyAndRestyle(c, 'Nepali', 52, sub.y + sub.h + 26);

  const buttonY = Math.min(nepali.y + nepali.h + 110, STORY.h - STORY_SAFE_BOTTOM - 96);
  const button = await copyToStory(c, 'CTA Button', { x: MARGIN, y: buttonY, w: 360, h: 96 });
  await copyToStory(c, 'CTA Label');
  await centreIn(c, await c.must('ai_set_text', { item: 'CTA Label Story', size: 38 }), button);
  const footer = await copyToStory(c, 'Footer');
  await c.must('ai_align', { items: [footer.id], horizontal: 'right', margin: MARGIN });
  await middleOf(c, footer, button);
}

async function exportAll(c, out) {
  const post = await c.must('ai_export', { path: join(out, 'admission-post.png'), artboard: 0, width: POST.w, overwrite: true });
  const story = await c.must('ai_export', { path: join(out, 'admission-story.png'), artboard: 1, width: STORY.w, overwrite: true });
  const aiPath = join(out, 'admission-2026.ai');
  await c.must('ai_save', { path: aiPath, overwrite: true });
  return [post.path, story.path, aiPath];
}

async function main() {
  const options = readOptions();
  const c = await startClient();
  try {
    const fonts = await pickFonts(c);
    console.log(`fonts: ${JSON.stringify(fonts)}`);
    await buildPost(c, fonts, options);
    await buildStory(c, options);
    const files = await exportAll(c, options.out);
    console.log(`wrote:\n  ${files.join('\n  ')}`);
  } finally {
    await c.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
