import { ERROR_CODES } from './constants.js';

export class StealthIOError extends Error {
  constructor(message, code = ERROR_CODES.REQUEST_ERROR, context = {}, cause = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.cause = cause;
    this.timestamp = Date.now();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause ? { name: this.cause.name, message: this.cause.message } : null,
      stack: this.stack
    };
  }

  toString() {
    let result = `${this.name} [${this.code}]: ${this.message}`;
    if (Object.keys(this.context).length > 0) {
      result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }
    return result;
  }
}

export class TimeoutError extends StealthIOError {
  constructor(message, context = {}, cause = null) {
    super(message, ERROR_CODES.TIMEOUT, context, cause);
    this.timeout = context.timeout;
  }
}

export class AbortError extends StealthIOError {
  constructor(message = 'Request aborted', context = {}, cause = null) {
    super(message, ERROR_CODES.ABORTED, context, cause);
    this.reason = context.reason;
  }
}

export class NetworkError extends StealthIOError {
  constructor(message, code = ERROR_CODES.NETWORK_ERROR, context = {}, cause = null) {
    super(message, code, context, cause);
    this.syscall = cause?.syscall;
    this.hostname = context.hostname;
    this.port = context.port;
  }

  static fromSystemError(error, context = {}) {
    const errorCodeMap = {
      'ENOTFOUND': ERROR_CODES.DNS_ERROR,
      'ECONNREFUSED': ERROR_CODES.CONNECTION_REFUSED,
      'ECONNRESET': ERROR_CODES.CONNECTION_RESET,
      'ETIMEDOUT': ERROR_CODES.TIMEOUT,
      'EPIPE': ERROR_CODES.CONNECTION_RESET,
      'EHOSTUNREACH': ERROR_CODES.NETWORK_ERROR,
      'ENETUNREACH': ERROR_CODES.NETWORK_ERROR
    };
    const code = errorCodeMap[error.code] || ERROR_CODES.NETWORK_ERROR;
    const message = NetworkError.getMessageForCode(error.code, context);
    return new NetworkError(message, code, {
      ...context,
      systemCode: error.code,
      hostname: error.hostname || context.hostname,
      port: error.port || context.port
    }, error);
  }

  static getMessageForCode(code, context) {
    const host = context.hostname || 'unknown host';
    const messages = {
      'ENOTFOUND': `DNS lookup failed for ${host}`,
      'ECONNREFUSED': `Connection refused by ${host}`,
      'ECONNRESET': `Connection reset by ${host}`,
      'ETIMEDOUT': `Connection timed out to ${host}`,
      'EPIPE': `Broken pipe to ${host}`,
      'EHOSTUNREACH': `Host ${host} is unreachable`,
      'ENETUNREACH': `Network is unreachable for ${host}`
    };
    return messages[code] || `Network error occurred: ${code}`;
  }
}

export class RedirectError extends StealthIOError {
  constructor(message, code = ERROR_CODES.REDIRECT_ERROR, context = {}, cause = null) {
    super(message, code, context, cause);
    this.redirectCount = context.redirectCount;
    this.redirectHistory = context.redirectHistory;
  }
}

export class ResponseError extends StealthIOError {
  constructor(message, code = ERROR_CODES.RESPONSE_ERROR, context = {}, cause = null) {
    super(message, code, context, cause);
    this.status = context.status;
    this.statusText = context.statusText;
    this.headers = context.headers;
    this.body = context.body;
  }
}

export class HTTPError extends ResponseError {
  constructor(message, response, context = {}) {
    super(message, ERROR_CODES.RESPONSE_ERROR, {
      ...context,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url: response.url
    });
    this.response = response;
    this.request = context.request;
  }

  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError() {
    return this.status >= 500 && this.status < 600;
  }
}

export class MiddlewareError extends StealthIOError {
  constructor(message, context = {}, cause = null) {
    super(message, ERROR_CODES.MIDDLEWARE_ERROR, context, cause);
    this.middlewareName = context.middlewareName;
    this.phase = context.phase;
  }
}

export class RetryError extends StealthIOError {
  constructor(message, context = {}, cause = null) {
    super(message, ERROR_CODES.RETRY_EXHAUSTED, context, cause);
    this.attempts = context.attempts;
    this.errors = context.errors;
  }
}

export class URLError extends StealthIOError {
  constructor(message, context = {}, cause = null) {
    super(message, ERROR_CODES.INVALID_URL, context, cause);
    this.url = context.url;
  }
}
