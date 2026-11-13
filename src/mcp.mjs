/**
 * Zero-dependency MCP server core: JSON-RPC 2.0 over newline-delimited stdio.
 * Handles initialize, ping, tools/list, tools/call. Notifications are ignored.
 * Everything here is transport/protocol only; tools are supplied by the caller.
 */
import { createInterface } from 'node:readline';
import { RpcError, RpcCodes } from './errors.mjs';

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);

function negotiateVersion(requested) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
}

function toolListing(tool) {
  const entry = { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
  return tool.annotations ? { ...entry, annotations: tool.annotations } : entry;
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: '2.0', id: id ?? null, error };
}

/**
 * Builds a message handler.
 * @param {object} opts
 * @param {{name:string, version:string}} opts.serverInfo
 * @param {string} [opts.instructions]
 * @param {Array} opts.tools  tool definitions {name, description, inputSchema}
 * @param {(name:string, args:object) => Promise<object>} opts.callTool  returns an MCP CallToolResult
 * @param {(level:string, ...msg:any[]) => void} [opts.log]
 * @returns {(msg:any) => Promise<object|null>} response, or null for notifications
 */
export function createMcpHandler({ serverInfo, instructions, tools, callTool, log = () => {} }) {
  const methods = {
    initialize: (params) => ({
      protocolVersion: negotiateVersion(params?.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      ...(instructions ? { instructions } : {}),
    }),
    ping: () => ({}),
    'tools/list': () => ({ tools: tools.map(toolListing) }),
    'tools/call': (params) => {
      if (!params || typeof params.name !== 'string') {
        throw new RpcError(RpcCodes.INVALID_PARAMS, 'tools/call requires params.name');
      }
      return callTool(params.name, params.arguments ?? {});
    },
  };

  return async function handle(msg) {
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') {
      return rpcError(null, RpcCodes.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 message');
    }
    const isNotification = msg.id === undefined;
    if (typeof msg.method !== 'string') {
      // A response to a request we never send, or garbage. Ignore responses, reject the rest.
      return isNotification || 'result' in msg || 'error' in msg
        ? null
        : rpcError(msg.id, RpcCodes.INVALID_REQUEST, 'Missing method');
    }
    if (isNotification) {
      log('debug', `notification ignored: ${msg.method}`);
      return null;
    }
    const method = methods[msg.method];
    if (!method) return rpcError(msg.id, RpcCodes.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);

    try {
      return rpcResult(msg.id, await method(msg.params));
    } catch (err) {
      if (err instanceof RpcError) return rpcError(msg.id, err.code, err.message, err.data);
      log('error', `internal error in ${msg.method}:`, err?.stack || err);
      return rpcError(msg.id, RpcCodes.INTERNAL_ERROR, `Internal error: ${err?.message || err}`);
    }
  };
}

/**
 * Connects a handler to newline-delimited JSON streams.
 * Requests are processed concurrently; ordering is the bridge queue's job.
 * Resolves when input ends and all in-flight requests have been answered.
 */
export function serveStdio(handle, { input = process.stdin, output = process.stdout, log = () => {} } = {}) {
  const write = (obj) => output.write(`${JSON.stringify(obj)}\n`);
  const pending = new Set();
  const rl = createInterface({ input, crlfDelay: Infinity, terminal: false });

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      write(rpcError(null, RpcCodes.PARSE_ERROR, 'Parse error: invalid JSON'));
      return;
    }
    const task = Promise.resolve()
      .then(() => handle(msg))
      .then((res) => res && write(res))
      .catch((err) => log('error', 'failed to handle message:', err?.stack || err))
      .finally(() => pending.delete(task));
    pending.add(task);
  });

  return new Promise((resolve) => {
    rl.on('close', () => Promise.allSettled([...pending]).then(() => resolve()));
  });
}
