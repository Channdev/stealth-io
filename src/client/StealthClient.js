import { HTTP_METHODS, DEFAULT_CONFIG } from '../core/constants.js';
import { CONFIG, MIDDLEWARE, TRANSPORT, METADATA } from '../core/symbols.js';
import { Headers } from '../utils/headers.js';
import { NodeTransport } from '../http/transport.js';
import { buildRequest, createRequestBuilder } from '../http/request-builder.js';
import { isRedirectStatus, handleRedirect } from '../http/response-handler.js';
import { MiddlewarePipeline } from '../middleware/pipeline.js';
import { StealthResponse } from '../types/response.js';
import { StealthAbortController } from '../http/abort.js';
import { createRetryWrapper } from '../http/retry.js';
import { HTTPError } from '../core/errors.js';

export class StealthClient {
  constructor(config = {}) {
    this[CONFIG] = {
      baseURL: config.baseURL || null,
      headers: new Headers(Headers.merge(DEFAULT_CONFIG.defaultHeaders, config.headers)),
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      followRedirects: config.followRedirects ?? DEFAULT_CONFIG.followRedirects,
      maxRedirects: config.maxRedirects ?? DEFAULT_CONFIG.maxRedirects,
      validateStatus: config.validateStatus ?? DEFAULT_CONFIG.validateStatus,
      validateStatusFn: config.validateStatusFn || ((status) => status >= 200 && status < 300),
      maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
      maxRetryDelay: config.maxRetryDelay ?? DEFAULT_CONFIG.maxRetryDelay,
      retryStrategy: config.retryStrategy || 'exponential',
      responseType: config.responseType || 'auto',
      decompress: config.decompress !== false
    };

    this[MIDDLEWARE] = new MiddlewarePipeline();
    const transportOptions = config.transport || {};
    this[TRANSPORT] = config.customTransport || new NodeTransport(transportOptions);
  }

  get config() {
    return { ...this[CONFIG], headers: new Headers(this[CONFIG].headers) };
  }

  get baseURL() {
    return this[CONFIG].baseURL;
  }

  set baseURL(url) {
    this[CONFIG].baseURL = url;
  }

  get headers() {
    return this[CONFIG].headers;
  }

  use(middleware) {
    this[MIDDLEWARE].use(middleware);
    return this;
  }

  removeMiddleware(name) {
    return this[MIDDLEWARE].remove(name);
  }

  builder() {
    return createRequestBuilder(this[CONFIG]);
  }

  async request(configOrUrl, additionalConfig = {}) {
    let config;
    if (typeof configOrUrl === 'string') {
      config = buildRequest({ url: configOrUrl, ...additionalConfig }, this[CONFIG]);
    } else {
      config = buildRequest(configOrUrl, this[CONFIG]);
    }

    config[METADATA] = config[METADATA] || {};
    config[METADATA].startTime = Date.now();
    config[METADATA].redirectHistory = [];
    config[METADATA].retryCount = 0;

    if (config.maxRetries > 0) {
      const retryWrapper = createRetryWrapper({
        maxRetries: config.maxRetries,
        retryDelay: config.retryDelay,
        maxRetryDelay: config.maxRetryDelay,
        retryStrategy: config.retryStrategy,
        shouldRetry: config.shouldRetry
      });

      return retryWrapper((ctx) => this._executeRequest(ctx), config);
    }

    return this._executeRequest(config);
  }

  async _executeRequest(config) {
    let processedConfig = await this[MIDDLEWARE].executeRequest(config);

    try {
      const nodeResponse = await this[TRANSPORT].send(processedConfig);

      if (isRedirectStatus(nodeResponse.statusCode) && processedConfig.followRedirects) {
        const redirectConfig = handleRedirect(nodeResponse, processedConfig);
        if (redirectConfig) {
          nodeResponse.resume();
          return this._executeRequest(redirectConfig);
        }
      }

      const response = StealthResponse.fromNodeResponse(nodeResponse, {
        request: processedConfig,
        redirectHistory: processedConfig[METADATA]?.redirectHistory || [],
        timing: nodeResponse._timing,
        url: nodeResponse._url || processedConfig.url
      });

      if (processedConfig.validateStatus) {
        const validateFn = processedConfig.validateStatusFn || ((status) => status >= 200 && status < 300);
        if (!validateFn(response.status)) {
          throw new HTTPError(`Request failed with status code ${response.status}`, response, { request: processedConfig });
        }
      }

      const finalResponse = await this[MIDDLEWARE].executeResponse(response, processedConfig);
      return finalResponse;

    } catch (error) {
      const recovered = await this[MIDDLEWARE].executeError(error, processedConfig);
      if (recovered) {
        return recovered;
      }
      throw error;
    }
  }

  get(url, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.GET });
  }

  post(url, body, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.POST, body });
  }

  put(url, body, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.PUT, body });
  }

  patch(url, body, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.PATCH, body });
  }

  delete(url, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.DELETE });
  }

  head(url, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.HEAD });
  }

  options(url, config = {}) {
    return this.request({ ...config, url, method: HTTP_METHODS.OPTIONS });
  }

  extend(config = {}) {
    const mergedConfig = {
      baseURL: config.baseURL ?? this[CONFIG].baseURL,
      headers: Headers.merge(this[CONFIG].headers, config.headers),
      timeout: config.timeout ?? this[CONFIG].timeout,
      followRedirects: config.followRedirects ?? this[CONFIG].followRedirects,
      maxRedirects: config.maxRedirects ?? this[CONFIG].maxRedirects,
      validateStatus: config.validateStatus ?? this[CONFIG].validateStatus,
      validateStatusFn: config.validateStatusFn ?? this[CONFIG].validateStatusFn,
      maxRetries: config.maxRetries ?? this[CONFIG].maxRetries,
      retryDelay: config.retryDelay ?? this[CONFIG].retryDelay,
      maxRetryDelay: config.maxRetryDelay ?? this[CONFIG].maxRetryDelay,
      retryStrategy: config.retryStrategy ?? this[CONFIG].retryStrategy,
      responseType: config.responseType ?? this[CONFIG].responseType,
      decompress: config.decompress ?? this[CONFIG].decompress
    };

    const newClient = new StealthClient(mergedConfig);
    const middlewareClone = this[MIDDLEWARE].clone();
    newClient[MIDDLEWARE] = middlewareClone;
    return newClient;
  }

  createAbortController() {
    return new StealthAbortController();
  }

  setTransport(transport) {
    if (this[TRANSPORT] && typeof this[TRANSPORT].destroy === 'function') {
      this[TRANSPORT].destroy();
    }
    this[TRANSPORT] = transport;
  }

  destroy() {
    if (this[TRANSPORT] && typeof this[TRANSPORT].destroy === 'function') {
      this[TRANSPORT].destroy();
    }
    this[MIDDLEWARE].clear();
  }
}

export function createClient(config = {}) {
  return new StealthClient(config);
}

let defaultClient = null;

export function getDefaultClient() {
  if (!defaultClient) {
    defaultClient = new StealthClient();
  }
  return defaultClient;
}

export function resetDefaultClient() {
  if (defaultClient) {
    defaultClient.destroy();
    defaultClient = null;
  }
}
