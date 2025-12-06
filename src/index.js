export {
  StealthClient,
  createClient,
  getDefaultClient,
  resetDefaultClient
} from './client/StealthClient.js';

export { StealthResponse, isStealthResponse } from './types/response.js';

export {
  createRequestConfig,
  validateRequestConfig,
  mergeRequestConfigs,
  isRequestConfig,
  cloneRequestConfig,
  DEFAULT_REQUEST_CONFIG
} from './types/request.js';

export {
  BaseTransport,
  NodeTransport,
  TransportFactory,
  createDefaultTransport,
  RequestBuilder,
  buildRequest,
  createRequestBuilder,
  buildGet,
  buildPost,
  buildPut,
  buildDelete,
  buildPatch,
  buildHead,
  handleResponse,
  validateResponseStatus,
  isRedirectStatus,
  handleRedirect,
  parseResponseBody,
  createResponseHandler,
  StealthAbortSignal,
  StealthAbortController,
  createAbortController,
  linkAbortSignals,
  createTimeoutSignal,
  isAbortError,
  withAbortSignal,
  calculateRetryDelay,
  isRetryableError,
  isRetryableStatus,
  createRetryWrapper,
  withRetry,
  getRetryAfter,
  createRetryPolicy,
  RateLimiter,
  RateLimitError,
  createRateLimiter,
  createRateLimitedWrapper,
  parseRateLimitConfig,
  matchesPattern,
  matchesBodyPattern,
  matchesHeaderPattern,
  matchesStatusPattern,
  shouldRetryOnPattern,
  createPatternRetryWrapper,
  parsePatternRetryConfig,
  createCommonPatternMatchers,
  createApiSpecificPatterns
} from './http/index.js';

export {
  MiddlewarePipeline,
  compose,
  createPipeline,
  createLoggingMiddleware,
  createDefaultHeadersMiddleware,
  createRequestTransformMiddleware,
  createResponseTransformMiddleware,
  createAuthMiddleware,
  createTimingMiddleware,
  createCacheMiddleware,
  createErrorHandlerMiddleware,
  createConditionalMiddleware
} from './middleware/index.js';

export {
  Headers,
  parseContentType,
  getCharset,
  isJsonContentType,
  isTextContentType,
  stringify as stringifyQuery,
  parse as parseQuery,
  merge as mergeQuery,
  appendToUrl,
  extractFromUrl,
  encodeValue,
  decodeValue,
  parseUrl,
  isValidUrl,
  resolveUrl,
  getOrigin,
  isSameOrigin,
  getProtocol,
  isHttps,
  getDefaultPort,
  getPort,
  normalizeUrl,
  buildUrl,
  joinPath,
  combineUrl,
  toRequestOptions,
  urlTemplate,
  collectStream,
  collectStreamAsString,
  createReadableStream,
  createDecompressor,
  decompressStream,
  createInspectorStream,
  limitStream,
  fromAsyncIterable,
  drainStream,
  isReadableStream
} from './utils/index.js';

export {
  StealthIOError,
  TimeoutError,
  AbortError,
  NetworkError,
  RedirectError,
  ResponseError,
  HTTPError,
  MiddlewareError,
  RetryError,
  URLError
} from './core/errors.js';

export {
  HTTP_METHODS,
  HTTP_STATUS,
  REDIRECT_STATUS_CODES,
  RETRYABLE_STATUS_CODES,
  CONTENT_TYPES,
  DEFAULT_CONFIG,
  SENSITIVE_HEADERS,
  CROSS_ORIGIN_STRIP_HEADERS,
  ERROR_CODES,
  BACKOFF_STRATEGIES
} from './core/constants.js';

import { StealthClient } from './client/StealthClient.js';

const defaultInstance = new StealthClient();

export default defaultInstance;
