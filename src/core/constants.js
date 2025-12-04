export const HTTP_METHODS = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS'
});

export const HTTP_STATUS = Object.freeze({
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
});

export const REDIRECT_STATUS_CODES = Object.freeze(new Set([
  HTTP_STATUS.MOVED_PERMANENTLY,
  HTTP_STATUS.FOUND,
  HTTP_STATUS.SEE_OTHER,
  HTTP_STATUS.TEMPORARY_REDIRECT,
  HTTP_STATUS.PERMANENT_REDIRECT
]));

export const RETRYABLE_STATUS_CODES = Object.freeze(new Set([
  HTTP_STATUS.REQUEST_TIMEOUT,
  HTTP_STATUS.TOO_MANY_REQUESTS,
  HTTP_STATUS.INTERNAL_SERVER_ERROR,
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT
]));

export const CONTENT_TYPES = Object.freeze({
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  FORM_DATA: 'multipart/form-data',
  OCTET_STREAM: 'application/octet-stream'
});

export const DEFAULT_CONFIG = Object.freeze({
  timeout: 30000,
  maxRedirects: 5,
  followRedirects: true,
  maxRetries: 0,
  retryDelay: 1000,
  maxRetryDelay: 30000,
  validateStatus: true,
  defaultHeaders: {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'User-Agent': 'StealthIO/1.0.0'
  }
});

export const SENSITIVE_HEADERS = Object.freeze(new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization'
]));

export const CROSS_ORIGIN_STRIP_HEADERS = Object.freeze(new Set([
  'authorization',
  'cookie',
  'host'
]));

export const ERROR_CODES = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DNS_ERROR: 'DNS_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  CONNECTION_RESET: 'CONNECTION_RESET',
  REDIRECT_ERROR: 'REDIRECT_ERROR',
  MAX_REDIRECTS_EXCEEDED: 'MAX_REDIRECTS_EXCEEDED',
  INVALID_URL: 'INVALID_URL',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  BODY_PARSE_ERROR: 'BODY_PARSE_ERROR',
  REQUEST_ERROR: 'REQUEST_ERROR',
  RESPONSE_ERROR: 'RESPONSE_ERROR',
  MIDDLEWARE_ERROR: 'MIDDLEWARE_ERROR',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED'
});

export const BACKOFF_STRATEGIES = Object.freeze({
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
  EXPONENTIAL_JITTER: 'exponential_jitter'
});
