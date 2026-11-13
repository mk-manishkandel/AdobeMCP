/**
 * Safety policies: no silent overwrites, and ai_run_script can be switched off.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ErrorCodes } from '../src/errors.mjs';
import { ILLUSTRATOR_TOOLS, illustratorApp } from '../src/apps/illustrator/index.mjs';

const work = mkdtempSync(join(tmpdir(), 'adobe-mcp-safety-'));
after(() => rmSync(work, { recursive: true, force: true }));
const tool = (name) => ILLUSTRATOR_TOOLS.find((t) => t.name === name);

function fakeCtx(name) {
  const calls = [];
  return { calls, ctx: { tool: tool(name), call: async (fn, args) => { calls.push({ fn, args }); return { path: args.path }; } } };
}

for (const name of ['ai_export', 'ai_save']) {
  test(`${name} refuses to replace an existing file unless overwrite is true`, async () => {
    const existing = join(work, `${name}.png`);
    writeFileSync(existing, 'x');
    const { calls, ctx } = fakeCtx(name);
    await assert.rejects(tool(name).handler({ path: existing, overwrite: false }, ctx), (e) => {
      assert.equal(e.code, ErrorCodes.FILE_EXISTS);
      assert.match(e.message, /already exists.*overwrite: true/);
      return true;
    });
    assert.equal(calls.length, 0);
    await tool(name).handler({ path: existing, overwrite: true }, ctx);
    await tool(name).handler({ path: join(work, `${name}-new.png`), overwrite: false }, ctx);
    assert.equal(calls.length, 2);
  });

  test(`${name} schema exposes overwrite (default false)`, () => {
    assert.equal(tool(name).inputSchema.properties.overwrite.default, false);
  });
}

test('ai_save without a path re-saves in place and is not blocked', async () => {
  const { calls, ctx } = fakeCtx('ai_save');
  await tool('ai_save').handler({ overwrite: false }, ctx);
  assert.equal(calls.length, 1);
});

test('ADOBE_MCP_ALLOW_RUN_SCRIPT=0 removes ai_run_script; it is on by default', () => {
  const names = (env) => illustratorApp(env).tools.map((t) => t.name);
  assert.ok(names({}).includes('ai_run_script'));
  assert.ok(!names({ ADOBE_MCP_ALLOW_RUN_SCRIPT: '0' }).includes('ai_run_script'));
  assert.ok(names({ ADOBE_MCP_ALLOW_RUN_SCRIPT: '1' }).includes('ai_run_script'));
});
