#!/usr/bin/env node
/**
 * Adobe MCP server entry point (stdio).
 *
 * Env:
 *   AI_APP                 Illustrator bundle id or app name (default com.adobe.illustrator)
 *   ADOBE_MCP_TIMEOUT      per-call AppleEvent timeout in seconds (default 600)
 *   ADOBE_MCP_OSASCRIPT    osascript binary (tests point this at a fake .mjs)
 *   ADOBE_MCP_KEEP_TMP=1   keep composed .jsx files in the temp dir for debugging
 *   ADOBE_MCP_DEBUG=1      verbose stderr logging
 *   ADOBE_MCP_ALLOW_RUN_SCRIPT=0  hide ai_run_script (typed tools only)
 * stdout is reserved for JSON-RPC; all logs go to stderr.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApps } from './src/apps/index.mjs';
import { createBridge, DEFAULT_TIMEOUT_SEC } from './src/bridge.mjs';
import { createMcpHandler, serveStdio } from './src/mcp.mjs';
import { createToolRunner } from './src/tools.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function createLogger(debug) {
  return (level, ...msg) => {
    if (level === 'debug' && !debug) return;
    process.stderr.write(`[adobe-mcp] ${level}: ${msg.map(String).join(' ')}\n`);
  };
}

function parseTimeout(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_SEC;
}

export function startServer(env = process.env) {
  const log = createLogger(env.ADOBE_MCP_DEBUG === '1');
  const apps = loadApps(env);
  const bridge = createBridge({
    jsxDir: join(ROOT, 'jsx'),
    osascript: env.ADOBE_MCP_OSASCRIPT || 'osascript',
    timeoutSec: parseTimeout(env.ADOBE_MCP_TIMEOUT),
    keepTmp: env.ADOBE_MCP_KEEP_TMP === '1',
    log,
  });
  const runner = createToolRunner({ apps, bridge, log });
  const handle = createMcpHandler({
    serverInfo: { name: 'adobe-mcp', version: pkg.version },
    instructions: apps.map((a) => a.instructions).join('\n\n'),
    tools: runner.tools,
    callTool: runner.callTool,
    log,
  });
  log('info', `adobe-mcp ${pkg.version} ready: ${runner.tools.length} tools (${apps.map((a) => a.id).join(', ')})`);
  return serveStdio(handle, { log });
}

/** Longest we wait for an in-flight Illustrator call after a shutdown signal. */
const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Process wiring for production: stop reading on SIGINT/SIGTERM and exit once
 * in-flight calls finish (or the grace period ends); log stray errors to stderr.
 */
function installProcessHandlers(log) {
  const shutdown = (signal) => {
    log('info', `${signal} received, shutting down`);
    process.stdin.destroy();
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => log('error', 'unhandled rejection:', reason?.stack || reason));
  process.on('uncaughtException', (err) => {
    log('error', 'uncaught exception, exiting:', err?.stack || err);
    process.exit(1);
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  installProcessHandlers(createLogger(process.env.ADOBE_MCP_DEBUG === '1'));
  startServer().then(() => process.exit(0));
}
