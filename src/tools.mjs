/**
 * Tool registry: turns per-app tool tables into one `callTool` for the MCP layer.
 *
 * A tool definition is
 *   { name, description, inputSchema, annotations?, timeoutSec?, handler?(args, ctx) }
 * timeoutSec shortens the AppleEvent timeout for quick tools (never above the global limit).
 * Without a handler, the tool runs the JSX function of the same name and the
 * result is returned as pretty JSON text. A handler may return MCP content
 * blocks itself (e.g. images).
 */
import { BridgeError, RpcError, RpcCodes } from './errors.mjs';
import { applyDefaults, validate } from './validate.mjs';

export function textContent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return [{ type: 'text', text }];
}

async function defaultHandler(args, ctx) {
  return textContent(await ctx.call(ctx.tool.name, args));
}

function errorResult(message) {
  return { content: textContent(message), isError: true };
}

/** Flattens apps into a name -> {tool, app} map and rejects duplicates. */
export function indexTools(apps) {
  const index = new Map();
  for (const app of apps) {
    for (const tool of app.tools) {
      if (index.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
      index.set(tool.name, Object.freeze({ tool, app }));
    }
  }
  return index;
}

/**
 * @param {object} opts
 * @param {Array} opts.apps     app definitions {id, label, target, jsxFiles, tools}
 * @param {{call: Function, tmpDir: string}} opts.bridge
 * @param {Function} [opts.log]
 */
export function createToolRunner({ apps, bridge, log = () => {} }) {
  const index = indexTools(apps);
  const tools = [...index.values()].map(({ tool }) => tool);

  async function callTool(name, rawArgs, { signal } = {}) {
    const entry = index.get(name);
    if (!entry) throw new RpcError(RpcCodes.INVALID_PARAMS, `Unknown tool: ${name}`);
    const { tool, app } = entry;

    const problems = validate(tool.inputSchema, rawArgs);
    if (problems.length) return errorResult(`Invalid arguments for ${name}:\n- ${problems.join('\n- ')}`);
    const args = applyDefaults(tool.inputSchema, rawArgs);

    const ctx = Object.freeze({
      tool,
      app,
      log,
      signal,
      tmpDir: bridge.tmpDir,
      call: (fnName, fnArgs) => bridge.call(app, fnName, fnArgs, { signal, timeoutSec: tool.timeoutSec }),
    });
    const started = Date.now();
    try {
      const content = await (tool.handler || defaultHandler)(args, ctx);
      log('info', `${name} ok ${Date.now() - started} ms`);
      return { content };
    } catch (err) {
      const ms = Date.now() - started;
      if (err instanceof BridgeError) {
        log('warn', `${name} failed [${err.code}] after ${ms} ms: ${err.message}`);
        return errorResult(err.message);
      }
      log('error', `${name} crashed after ${ms} ms:`, err?.stack || err);
      return errorResult(`${name} failed unexpectedly: ${err?.message || err}`);
    }
  }

  return Object.freeze({ tools, callTool });
}
