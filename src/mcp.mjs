/**
 * Zero-dependency MCP server core: JSON-RPC 2.0 over newline-delimited stdio.
 * Handles initialize, ping, tools/list, tools/call and notifications/cancelled
 * (a cancelled call is skipped if it has not started, and its reply is dropped).
 * Everything here is transport/protocol only; tools are supplied by the caller.
 */
import { createInterface } from 'node:readline';
import { RpcError, RpcCodes } from './errors.mjs';

export const DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);

/** Returned by a method whose request was cancelled; the handler then sends no reply. */
const CANCELLED = Symbol('cancelled');

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
 * @param {(name:string, args:object, opts:{signal:AbortSignal}) => Promise<object>} opts.callTool  returns an MCP CallToolResult
 * @param {(level:string, ...msg:any[]) => void} [opts.log]
 * @returns {(msg:any) => Promise<object|null>} response, or null for notifications
 */
export function createMcpHandler({ serverInfo, instructions, tools, callTool, log = () => {} }) {
  /** In-flight tools/call requests by id, so notifications/cancelled can abort them. */
  const inFlight = new Map();

  function cancel(params) {
    const controller = inFlight.get(params?.requestId);
    if (!controller) return;
    log('info', `request ${params.requestId} cancelled${params.reason ? `: ${params.reason}` : ''}`);
    controller.abort();
  }

  const methods = {
    initialize: (params) => ({
      protocolVersion: negotiateVersion(params?.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      ...(instructions ? { instructions } : {}),
    }),
    ping: () => ({}),
    'tools/list': () => ({ tools: tools.map(toolListing) }),
    'tools/call': async (params, id) => {
      if (!params || typeof params.name !== 'string') {
        throw new RpcError(RpcCodes.INVALID_PARAMS, 'tools/call requires params.name');
      }
      const controller = new AbortController();
      inFlight.set(id, controller);
      try {
        const result = await callTool(params.name, params.arguments ?? {}, { signal: controller.signal });
        return controller.signal.aborted ? CANCELLED : result;
      } catch (err) {
        if (controller.signal.aborted) return CANCELLED;
        throw err;
      } finally {
        inFlight.delete(id);
      }
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
      if (msg.method === 'notifications/cancelled') cancel(msg.params);
      else log('debug', `notification ignored: ${msg.method}`);
      return null;
    }
    const method = methods[msg.method];
    if (!method) return rpcError(msg.id, RpcCodes.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);

    try {
      const result = await method(msg.params, msg.id);
      // A cancelled request gets no reply (MCP: the receiver SHOULD NOT respond).
      return result === CANCELLED ? null : rpcResult(msg.id, result);
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
export function serveStdio(
  handle,
  { input = process.stdin, output = process.stdout, log = () => {}, maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES } = {},
) {
  let outputBroken = false;
  output.on('error', (err) => {
    if (!outputBroken) log('warn', `output stream error (client gone?): ${err.code || ''} ${err.message}`);
    outputBroken = true;
  });
  const write = (obj) => {
    if (outputBroken) return;
    try {
      output.write(`${JSON.stringify(obj)}\n`);
    } catch (err) {
      outputBroken = true;
      log('warn', `cannot write reply: ${err.message}`);
    }
  };
  const pending = new Set();
  const rl = createInterface({ input, crlfDelay: Infinity, terminal: false });

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    if (Buffer.byteLength(text, 'utf8') > maxMessageBytes) {
      write(rpcError(null, RpcCodes.INVALID_REQUEST, `Message too large (limit ${maxMessageBytes} bytes)`));
      return;
    }
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
