import { HTTP_METHODS, DEFAULT_CONFIG, BACKOFF_STRATEGIES } from '../core/constants.js';
import { IS_REQUEST, METADATA } from '../core/symbols.js';
import { Headers } from '../utils/headers.js';

export const DEFAULT_REQUEST_CONFIG = Object.freeze({
  method: HTTP_METHODS.GET,
  headers: {},
  params: null,
  body: null,
  timeout: DEFAULT_CONFIG.timeout,
  followRedirects: DEFAULT_CONFIG.followRedirects,
  maxRedirects: DEFAULT_CONFIG.maxRedirects,
  validateStatus: DEFAULT_CONFIG.validateStatus,
  validateStatusFn: (status) => status >= 200 && status < 300,
  responseType: 'auto',
  maxRetries: DEFAULT_CONFIG.maxRetries,
  retryDelay: DEFAULT_CONFIG.retryDelay,
  maxRetryDelay: DEFAULT_CONFIG.maxRetryDelay,
  retryStrategy: BACKOFF_STRATEGIES.EXPONENTIAL,
  shouldRetry: null,
  signal: null,
  baseURL: null,
  auth: null,
  decompress: true,
  metadata: null
});

export function createRequestConfig(configOrUrl, additionalConfig = {}) {
  let config;
  if (typeof configOrUrl === 'string') {
    config = { ...additionalConfig, url: configOrUrl };
  } else {
    config = { ...configOrUrl };
  }

  if (!config.url) {
    throw new Error('Request URL is required');
  }

  if (config.method) {
    config.method = config.method.toUpperCase();
  }

  const method = config.method || DEFAULT_REQUEST_CONFIG.method;
  if (!Object.values(HTTP_METHODS).includes(method)) {
    throw new Error(`Invalid HTTP method: ${method}`);
  }

  const normalizedConfig = {
    ...DEFAULT_REQUEST_CONFIG,
    ...config,
    method,
    headers: new Headers(Headers.merge(DEFAULT_CONFIG.defaultHeaders, config.headers))
  };

  normalizedConfig[IS_REQUEST] = true;
  normalizedConfig[METADATA] = {
    startTime: null,
    retryCount: 0,
    redirectCount: 0,
    ...config.metadata
  };

  return normalizedConfig;
}

export function validateRequestConfig(config) {
  const errors = [];

  if (!config.url) {
    errors.push('URL is required');
  } else if (typeof config.url !== 'string') {
    errors.push('URL must be a string');
  }

  if (config.method && !Object.values(HTTP_METHODS).includes(config.method.toUpperCase())) {
    errors.push(`Invalid HTTP method: ${config.method}`);
  }

  if (config.timeout !== undefined && config.timeout !== null) {
    if (typeof config.timeout !== 'number' || config.timeout < 0) {
      errors.push('Timeout must be a positive number');
    }
  }

  if (config.maxRedirects !== undefined && config.maxRedirects !== null) {
    if (typeof config.maxRedirects !== 'number' || config.maxRedirects < 0) {
      errors.push('maxRedirects must be a positive number');
    }
  }

  if (config.maxRetries !== undefined && config.maxRetries !== null) {
    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      errors.push('maxRetries must be a positive number');
    }
  }

  if (config.retryStrategy !== undefined) {
    if (!Object.values(BACKOFF_STRATEGIES).includes(config.retryStrategy)) {
      errors.push(`Invalid retry strategy: ${config.retryStrategy}`);
    }
  }

  if (config.auth) {
    if (typeof config.auth !== 'object') {
      errors.push('auth must be an object with username and password');
    } else if (!config.auth.username || !config.auth.password) {
      errors.push('auth must contain both username and password');
    }
  }

  const validResponseTypes = ['auto', 'json', 'text', 'buffer', 'stream'];
  if (config.responseType && !validResponseTypes.includes(config.responseType)) {
    errors.push(`Invalid responseType: ${config.responseType}. Must be one of: ${validResponseTypes.join(', ')}`);
  }

  return { isValid: errors.length === 0, errors };
}

export function mergeRequestConfigs(...configs) {
  const merged = {};
  for (const config of configs) {
    if (!config) continue;
    for (const [key, value] of Object.entries(config)) {
      if (key === 'headers') {
        merged.headers = Headers.merge(merged.headers, value);
      } else if (key === 'params') {
        merged.params = { ...merged.params, ...value };
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

export function isRequestConfig(obj) {
  return obj !== null && typeof obj === 'object' && (obj[IS_REQUEST] === true || (typeof obj.url === 'string'));
}

export function cloneRequestConfig(config) {
  return {
    ...config,
    headers: new Headers(config.headers),
    params: config.params ? { ...config.params } : null,
    metadata: config[METADATA] ? { ...config[METADATA] } : null,
    auth: config.auth ? { ...config.auth } : null,
    [IS_REQUEST]: true,
    [METADATA]: config[METADATA] ? { ...config[METADATA] } : {}
  };
}
