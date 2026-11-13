/**
 * Error types shared by the bridge and the MCP layer.
 */

export const ErrorCodes = Object.freeze({
  PERMISSION_DENIED: 'permission_denied',
  APP_NOT_FOUND: 'app_not_found',
  APP_QUIT: 'app_quit',
  TIMEOUT: 'timeout',
  SCRIPT_ERROR: 'script_error',
  LOADER_ERROR: 'loader_error',
  OSASCRIPT_FAILED: 'osascript_failed',
  BAD_RESPONSE: 'bad_response',
  CONFIG: 'config',
});

/** An error raised while talking to an Adobe app. `message` is safe to show to the model. */
export class BridgeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.details = details;
  }
}

/** A JSON-RPC protocol error (becomes a JSON-RPC `error` object, not a tool result). */
export class RpcError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export const RpcCodes = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});
