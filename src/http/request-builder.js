import { HTTP_METHODS, CONTENT_TYPES } from '../core/constants.js';
import { IS_REQUEST, METADATA } from '../core/symbols.js';
import { Headers } from '../utils/headers.js';
import { parseUrl, combineUrl, isValidUrl } from '../utils/url.js';
import { stringify as stringifyQuery } from '../utils/query.js';
import { createRequestConfig, validateRequestConfig } from '../types/request.js';

export class RequestBuilder {
  #config;
  #defaults;

  constructor(defaults = {}) {
    this.#defaults = defaults;
    this.#config = {};
  }

  url(url) {
    this.#config.url = url;
    return this;
  }

  method(method) {
    this.#config.method = method.toUpperCase();
    return this;
  }

  headers(headers) {
    this.#config.headers = headers;
    return this;
  }

  header(name, value) {
    if (!this.#config.headers) {
      this.#config.headers = {};
    }
    if (this.#config.headers instanceof Headers) {
      this.#config.headers.set(name, value);
    } else {
      this.#config.headers[name] = value;
    }
    return this;
  }

  params(params) {
    this.#config.params = params;
    return this;
  }

  param(name, value) {
    if (!this.#config.params) {
      this.#config.params = {};
    }
    this.#config.params[name] = value;
    return this;
  }

  body(body) {
    this.#config.body = body;
    return this;
  }

  json(data) {
    this.#config.body = data;
    return this.header('Content-Type', CONTENT_TYPES.JSON);
  }

  form(data) {
    this.#config.body = stringifyQuery(data);
    return this.header('Content-Type', CONTENT_TYPES.FORM_URLENCODED);
  }

  text(text) {
    this.#config.body = text;
    return this.header('Content-Type', CONTENT_TYPES.TEXT);
  }

  timeout(ms) {
    this.#config.timeout = ms;
    return this;
  }

  signal(signal) {
    this.#config.signal = signal;
    return this;
  }

  auth(username, password) {
    this.#config.auth = { username, password };
    return this;
  }

  bearer(token) {
    return this.header('Authorization', `Bearer ${token}`);
  }

  redirects(follow) {
    if (typeof follow === 'boolean') {
      this.#config.followRedirects = follow;
    } else if (typeof follow === 'number') {
      this.#config.followRedirects = follow > 0;
      this.#config.maxRedirects = follow;
    }
    return this;
  }

  retry(config) {
    if (typeof config === 'number') {
      this.#config.maxRetries = config;
    } else if (typeof config === 'object') {
      this.#config.maxRetries = config.maxRetries ?? this.#config.maxRetries;
      this.#config.retryDelay = config.retryDelay ?? this.#config.retryDelay;
      this.#config.maxRetryDelay = config.maxRetryDelay ?? this.#config.maxRetryDelay;
      this.#config.retryStrategy = config.strategy ?? this.#config.retryStrategy;
      this.#config.shouldRetry = config.shouldRetry ?? this.#config.shouldRetry;
    }
    return this;
  }

  responseType(type) {
    this.#config.responseType = type;
    return this;
  }

  validateStatus(validate) {
    if (typeof validate === 'function') {
      this.#config.validateStatus = true;
      this.#config.validateStatusFn = validate;
    } else {
      this.#config.validateStatus = validate;
    }
    return this;
  }

  metadata(metadata) {
    this.#config.metadata = metadata;
    return this;
  }

  build() {
    return buildRequest(this.#config, this.#defaults);
  }

  reset() {
    this.#config = {};
    return this;
  }
}

export function buildRequest(config, defaults = {}) {
  let mergedConfig = { ...defaults };
  let url = config.url;

  if (defaults.baseURL && url && !isValidUrl(url)) {
    url = combineUrl(defaults.baseURL, url);
  }

  const headers = Headers.merge(defaults.headers, config.headers);

  if (config.auth || defaults.auth) {
    const auth = config.auth || defaults.auth;
    const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    headers.set('Authorization', `Basic ${credentials}`);
  }

  let body = config.body;
  if (body !== null && body !== undefined) {
    if (!headers.has('content-type')) {
      if (typeof body === 'object' && !Buffer.isBuffer(body) && !isStream(body)) {
        headers.set('Content-Type', CONTENT_TYPES.JSON);
        body = JSON.stringify(body);
      } else if (typeof body === 'string') {
        headers.set('Content-Type', CONTENT_TYPES.TEXT);
      }
    } else {
      const contentType = headers.get('content-type');
      if (contentType && contentType.includes('application/json') &&
          typeof body === 'object' && !Buffer.isBuffer(body) && !isStream(body)) {
        body = JSON.stringify(body);
      }
    }
  }

  if (config.params || defaults.params) {
    const params = { ...defaults.params, ...config.params };
    const queryString = stringifyQuery(params);
    if (queryString) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${queryString}`;
    }
  }

  const finalConfig = createRequestConfig({
    ...mergedConfig,
    ...config,
    url,
    headers,
    body
  });

  const validation = validateRequestConfig(finalConfig);
  if (!validation.isValid) {
    throw new Error(`Invalid request configuration: ${validation.errors.join(', ')}`);
  }

  return finalConfig;
}

export function createRequestBuilder(defaults = {}) {
  return new RequestBuilder(defaults);
}

export function buildGet(url, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.GET });
}

export function buildPost(url, body, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.POST, body });
}

export function buildPut(url, body, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.PUT, body });
}

export function buildDelete(url, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.DELETE });
}

export function buildPatch(url, body, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.PATCH, body });
}

export function buildHead(url, config = {}) {
  return buildRequest({ ...config, url, method: HTTP_METHODS.HEAD });
}

function isStream(value) {
  return value !== null && typeof value === 'object' && typeof value.pipe === 'function';
}
