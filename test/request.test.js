import {
  createRequestConfig,
  validateRequestConfig,
  mergeRequestConfigs,
  isRequestConfig,
  cloneRequestConfig,
  DEFAULT_REQUEST_CONFIG
} from '../src/types/request.js';
import { IS_REQUEST, METADATA } from '../src/core/symbols.js';
import { Headers } from '../src/utils/headers.js';

describe('createRequestConfig', () => {
  test('creates config from URL string', () => {
    const config = createRequestConfig('https://example.com');
    expect(config.url).toBe('https://example.com');
    expect(config.method).toBe('GET');
  });

  test('creates config from object', () => {
    const config = createRequestConfig({ url: 'https://example.com', method: 'POST' });
    expect(config.url).toBe('https://example.com');
    expect(config.method).toBe('POST');
  });

  test('normalizes method to uppercase', () => {
    const config = createRequestConfig({ url: 'https://example.com', method: 'post' });
    expect(config.method).toBe('POST');
  });

  test('throws for missing URL', () => {
    expect(() => createRequestConfig({})).toThrow('Request URL is required');
  });

  test('throws for invalid HTTP method', () => {
    expect(() => createRequestConfig({ url: 'https://example.com', method: 'INVALID' })).toThrow();
  });

  test('marks config with IS_REQUEST symbol', () => {
    const config = createRequestConfig('https://example.com');
    expect(config[IS_REQUEST]).toBe(true);
  });

  test('initializes METADATA', () => {
    const config = createRequestConfig('https://example.com');
    expect(config[METADATA]).toBeDefined();
    expect(config[METADATA].retryCount).toBe(0);
    expect(config[METADATA].redirectCount).toBe(0);
  });

  test('converts headers to Headers instance', () => {
    const config = createRequestConfig({
      url: 'https://example.com',
      headers: { 'X-Custom': 'value' }
    });
    expect(config.headers).toBeInstanceOf(Headers);
    expect(config.headers.get('x-custom')).toBe('value');
  });

  test('applies default values', () => {
    const config = createRequestConfig('https://example.com');
    expect(config.timeout).toBe(DEFAULT_REQUEST_CONFIG.timeout);
    expect(config.followRedirects).toBe(DEFAULT_REQUEST_CONFIG.followRedirects);
    expect(config.maxRedirects).toBe(DEFAULT_REQUEST_CONFIG.maxRedirects);
  });
});

describe('validateRequestConfig', () => {
  test('valid config passes validation', () => {
    const result = validateRequestConfig({
      url: 'https://example.com',
      method: 'GET',
      timeout: 5000
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing URL fails validation', () => {
    const result = validateRequestConfig({});
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('URL is required');
  });

  test('invalid method fails validation', () => {
    const result = validateRequestConfig({ url: 'https://example.com', method: 'INVALID' });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid HTTP method'))).toBe(true);
  });

  test('negative timeout fails validation', () => {
    const result = validateRequestConfig({ url: 'https://example.com', timeout: -1 });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Timeout'))).toBe(true);
  });

  test('invalid auth fails validation', () => {
    const result = validateRequestConfig({ url: 'https://example.com', auth: { username: 'user' } });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('auth'))).toBe(true);
  });

  test('invalid responseType fails validation', () => {
    const result = validateRequestConfig({ url: 'https://example.com', responseType: 'invalid' });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('responseType'))).toBe(true);
  });
});

describe('mergeRequestConfigs', () => {
  test('merges simple properties', () => {
    const result = mergeRequestConfigs(
      { url: 'https://example.com' },
      { timeout: 5000 },
      { method: 'POST' }
    );
    expect(result.url).toBe('https://example.com');
    expect(result.timeout).toBe(5000);
    expect(result.method).toBe('POST');
  });

  test('later values override earlier ones', () => {
    const result = mergeRequestConfigs(
      { timeout: 1000 },
      { timeout: 2000 }
    );
    expect(result.timeout).toBe(2000);
  });

  test('merges headers', () => {
    const result = mergeRequestConfigs(
      { headers: { 'A': '1' } },
      { headers: { 'B': '2' } }
    );
    expect(result.headers.get('a')).toBe('1');
    expect(result.headers.get('b')).toBe('2');
  });

  test('merges params', () => {
    const result = mergeRequestConfigs(
      { params: { a: '1' } },
      { params: { b: '2' } }
    );
    expect(result.params).toEqual({ a: '1', b: '2' });
  });

  test('skips null configs', () => {
    const result = mergeRequestConfigs(
      { url: 'https://example.com' },
      null,
      { timeout: 5000 }
    );
    expect(result.url).toBe('https://example.com');
    expect(result.timeout).toBe(5000);
  });
});

describe('isRequestConfig', () => {
  test('returns true for valid config', () => {
    const config = createRequestConfig('https://example.com');
    expect(isRequestConfig(config)).toBe(true);
  });

  test('returns true for object with url', () => {
    expect(isRequestConfig({ url: 'https://example.com' })).toBe(true);
  });

  test('returns false for null', () => {
    expect(isRequestConfig(null)).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isRequestConfig('string')).toBe(false);
    expect(isRequestConfig(123)).toBe(false);
  });
});

describe('cloneRequestConfig', () => {
  test('creates independent copy', () => {
    const original = createRequestConfig({ url: 'https://example.com', headers: { 'A': '1' } });
    const clone = cloneRequestConfig(original);

    clone.url = 'https://other.com';
    clone.headers.set('B', '2');

    expect(original.url).toBe('https://example.com');
    expect(original.headers.has('b')).toBe(false);
  });

  test('clones params', () => {
    const original = createRequestConfig({ url: 'https://example.com', params: { a: '1' } });
    const clone = cloneRequestConfig(original);

    clone.params.b = '2';
    expect(original.params.b).toBeUndefined();
  });

  test('preserves IS_REQUEST symbol', () => {
    const original = createRequestConfig('https://example.com');
    const clone = cloneRequestConfig(original);
    expect(clone[IS_REQUEST]).toBe(true);
  });
});
