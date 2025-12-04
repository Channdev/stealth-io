import {
  IS_RESPONSE,
  RAW_BODY,
  BODY_CONSUMED,
  ORIGINAL_REQUEST,
  REDIRECT_HISTORY,
  TIMING,
  RESOLVED_URL
} from '../core/symbols.js';
import { ResponseError } from '../core/errors.js';
import { ERROR_CODES } from '../core/constants.js';
import { Headers, getCharset, isJsonContentType, isTextContentType } from '../utils/headers.js';
import { collectStream, decompressStream } from '../utils/streams.js';

export class StealthResponse {
  constructor(options) {
    const {
      status,
      statusText,
      headers,
      body,
      url,
      request = null,
      redirectHistory = [],
      timing = null
    } = options;

    this.status = status;
    this.statusText = statusText || getStatusText(status);
    this.headers = headers instanceof Headers ? headers : new Headers(headers);
    this.url = url;
    this.ok = status >= 200 && status < 300;
    this.redirected = redirectHistory.length > 0;

    this[IS_RESPONSE] = true;
    this[RAW_BODY] = body;
    this[BODY_CONSUMED] = false;
    this[ORIGINAL_REQUEST] = request;
    this[REDIRECT_HISTORY] = redirectHistory;
    this[TIMING] = timing;
    this[RESOLVED_URL] = url;
  }

  get request() {
    return this[ORIGINAL_REQUEST];
  }

  get redirectHistory() {
    return [...this[REDIRECT_HISTORY]];
  }

  get timing() {
    return this[TIMING] ? { ...this[TIMING] } : null;
  }

  get bodyUsed() {
    return this[BODY_CONSUMED];
  }

  get body() {
    return this[RAW_BODY];
  }

  #ensureBodyNotConsumed() {
    if (this[BODY_CONSUMED]) {
      throw new ResponseError(
        'Response body has already been consumed',
        ERROR_CODES.BODY_PARSE_ERROR,
        { url: this.url, status: this.status }
      );
    }
  }

  #markBodyConsumed() {
    this[BODY_CONSUMED] = true;
  }

  #getBodyStream() {
    const encoding = this.headers.get('content-encoding');
    const request = this[ORIGINAL_REQUEST];
    const shouldDecompress = request?.decompress !== false;
    if (shouldDecompress && encoding) {
      return decompressStream(this[RAW_BODY], encoding);
    }
    return this[RAW_BODY];
  }

  async buffer() {
    this.#ensureBodyNotConsumed();
    this.#markBodyConsumed();
    try {
      const stream = this.#getBodyStream();
      return await collectStream(stream);
    } catch (error) {
      throw new ResponseError(
        `Failed to read response body as buffer: ${error.message}`,
        ERROR_CODES.BODY_PARSE_ERROR,
        { url: this.url, status: this.status },
        error
      );
    }
  }

  async text(encoding) {
    const buffer = await this.buffer();
    const charset = encoding || getCharset(this.headers);
    try {
      return buffer.toString(charset);
    } catch (error) {
      return buffer.toString('utf-8');
    }
  }

  async json() {
    const text = await this.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ResponseError(
        `Failed to parse response body as JSON: ${error.message}`,
        ERROR_CODES.BODY_PARSE_ERROR,
        { url: this.url, status: this.status, body: text.slice(0, 500) },
        error
      );
    }
  }

  stream() {
    this.#ensureBodyNotConsumed();
    this.#markBodyConsumed();
    return this.#getBodyStream();
  }

  async auto() {
    const contentType = this.headers.get('content-type');
    if (isJsonContentType(contentType)) {
      return this.json();
    }
    if (isTextContentType(contentType)) {
      return this.text();
    }
    return this.buffer();
  }

  clone() {
    this.#ensureBodyNotConsumed();
    return new StealthResponse({
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      body: this[RAW_BODY],
      url: this.url,
      request: this[ORIGINAL_REQUEST],
      redirectHistory: [...this[REDIRECT_HISTORY]],
      timing: this[TIMING] ? { ...this[TIMING] } : null
    });
  }

  toJSON() {
    return {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers.toObject(),
      url: this.url,
      ok: this.ok,
      redirected: this.redirected,
      redirectHistory: this[REDIRECT_HISTORY],
      bodyUsed: this[BODY_CONSUMED],
      timing: this[TIMING]
    };
  }

  toString() {
    return `StealthResponse { status: ${this.status}, statusText: "${this.statusText}", url: "${this.url}", ok: ${this.ok} }`;
  }

  static fromNodeResponse(nodeResponse, options = {}) {
    const { request, redirectHistory = [], timing = null, url } = options;
    return new StealthResponse({
      status: nodeResponse.statusCode,
      statusText: nodeResponse.statusMessage,
      headers: Headers.fromNodeResponse(nodeResponse.headers),
      body: nodeResponse,
      url: url || request?.url,
      request,
      redirectHistory,
      timing
    });
  }

  static create(body, options = {}) {
    const { status = 200, statusText, headers = {} } = options;
    const { Readable } = require('stream');

    let bodyBuffer;
    let contentType;

    if (Buffer.isBuffer(body)) {
      bodyBuffer = body;
      contentType = 'application/octet-stream';
    } else if (typeof body === 'string') {
      bodyBuffer = Buffer.from(body, 'utf-8');
      contentType = 'text/plain; charset=utf-8';
    } else if (body !== null && typeof body === 'object') {
      bodyBuffer = Buffer.from(JSON.stringify(body), 'utf-8');
      contentType = 'application/json; charset=utf-8';
    } else {
      bodyBuffer = Buffer.alloc(0);
      contentType = null;
    }

    const responseHeaders = new Headers(headers);
    if (contentType && !responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', contentType);
    }
    responseHeaders.set('content-length', String(bodyBuffer.length));

    return new StealthResponse({
      status,
      statusText: statusText || getStatusText(status),
      headers: responseHeaders,
      body: Readable.from([bodyBuffer]),
      url: options.url || ''
    });
  }
}

function getStatusText(status) {
  const statusTexts = {
    100: 'Continue',
    101: 'Switching Protocols',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Payload Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    418: "I'm a teapot",
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported'
  };
  return statusTexts[status] || 'Unknown Status';
}

export function isStealthResponse(obj) {
  return obj !== null && typeof obj === 'object' && obj[IS_RESPONSE] === true;
}
