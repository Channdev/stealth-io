import {
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
} from '../src/core/errors.js';
import { ERROR_CODES } from '../src/core/constants.js';

describe('StealthIOError', () => {
  test('creates error with message and code', () => {
    const error = new StealthIOError('Test error', ERROR_CODES.REQUEST_ERROR);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ERROR_CODES.REQUEST_ERROR);
    expect(error.name).toBe('StealthIOError');
  });

  test('includes context', () => {
    const error = new StealthIOError('Test', ERROR_CODES.REQUEST_ERROR, { url: 'https://example.com' });
    expect(error.context.url).toBe('https://example.com');
  });

  test('includes cause', () => {
    const cause = new Error('Original error');
    const error = new StealthIOError('Wrapped', ERROR_CODES.REQUEST_ERROR, {}, cause);
    expect(error.cause).toBe(cause);
  });

  test('has timestamp', () => {
    const before = Date.now();
    const error = new StealthIOError('Test');
    const after = Date.now();
    expect(error.timestamp).toBeGreaterThanOrEqual(before);
    expect(error.timestamp).toBeLessThanOrEqual(after);
  });

  test('toJSON returns serializable object', () => {
    const error = new StealthIOError('Test', ERROR_CODES.REQUEST_ERROR, { key: 'value' });
    const json = error.toJSON();
    expect(json.name).toBe('StealthIOError');
    expect(json.message).toBe('Test');
    expect(json.code).toBe(ERROR_CODES.REQUEST_ERROR);
    expect(json.context.key).toBe('value');
  });

  test('toString includes code and context', () => {
    const error = new StealthIOError('Test', ERROR_CODES.REQUEST_ERROR, { key: 'value' });
    const str = error.toString();
    expect(str).toContain('StealthIOError');
    expect(str).toContain(ERROR_CODES.REQUEST_ERROR);
    expect(str).toContain('key');
  });
});

describe('TimeoutError', () => {
  test('has TIMEOUT code', () => {
    const error = new TimeoutError('Timed out', { timeout: 5000 });
    expect(error.code).toBe(ERROR_CODES.TIMEOUT);
    expect(error.timeout).toBe(5000);
  });
});

describe('AbortError', () => {
  test('has ABORTED code', () => {
    const error = new AbortError();
    expect(error.code).toBe(ERROR_CODES.ABORTED);
    expect(error.message).toBe('Request aborted');
  });

  test('includes reason', () => {
    const error = new AbortError('Cancelled', { reason: 'user cancelled' });
    expect(error.reason).toBe('user cancelled');
  });
});

describe('NetworkError', () => {
  test('creates from system error', () => {
    const sysError = new Error('connect ECONNREFUSED');
    sysError.code = 'ECONNREFUSED';
    sysError.hostname = 'example.com';

    const error = NetworkError.fromSystemError(sysError, { url: 'https://example.com' });
    expect(error.code).toBe(ERROR_CODES.CONNECTION_REFUSED);
    expect(error.hostname).toBe('example.com');
  });

  test('handles DNS errors', () => {
    const sysError = new Error('getaddrinfo ENOTFOUND');
    sysError.code = 'ENOTFOUND';

    const error = NetworkError.fromSystemError(sysError, { hostname: 'invalid.local' });
    expect(error.code).toBe(ERROR_CODES.DNS_ERROR);
    expect(error.message).toContain('DNS lookup failed');
  });
});

describe('RedirectError', () => {
  test('includes redirect information', () => {
    const error = new RedirectError(
      'Too many redirects',
      ERROR_CODES.MAX_REDIRECTS_EXCEEDED,
      { redirectCount: 5, redirectHistory: ['url1', 'url2'] }
    );
    expect(error.redirectCount).toBe(5);
    expect(error.redirectHistory).toEqual(['url1', 'url2']);
  });
});

describe('ResponseError', () => {
  test('includes response details', () => {
    const error = new ResponseError('Parse error', ERROR_CODES.BODY_PARSE_ERROR, {
      status: 200,
      statusText: 'OK',
      body: 'invalid json'
    });
    expect(error.status).toBe(200);
    expect(error.statusText).toBe('OK');
    expect(error.body).toBe('invalid json');
  });
});

describe('HTTPError', () => {
  test('includes response object', () => {
    const mockResponse = { status: 404, statusText: 'Not Found', headers: {}, url: 'https://example.com' };
    const error = new HTTPError('Not found', mockResponse);
    expect(error.response).toBe(mockResponse);
    expect(error.status).toBe(404);
  });

  test('isClientError returns true for 4xx', () => {
    const mockResponse = { status: 404, statusText: 'Not Found', headers: {}, url: 'https://example.com' };
    const error = new HTTPError('Not found', mockResponse);
    expect(error.isClientError).toBe(true);
    expect(error.isServerError).toBe(false);
  });

  test('isServerError returns true for 5xx', () => {
    const mockResponse = { status: 500, statusText: 'Internal Server Error', headers: {}, url: 'https://example.com' };
    const error = new HTTPError('Server error', mockResponse);
    expect(error.isClientError).toBe(false);
    expect(error.isServerError).toBe(true);
  });
});

describe('MiddlewareError', () => {
  test('includes middleware information', () => {
    const error = new MiddlewareError('Failed', { middlewareName: 'auth', phase: 'request' });
    expect(error.middlewareName).toBe('auth');
    expect(error.phase).toBe('request');
  });
});

describe('RetryError', () => {
  test('includes retry information', () => {
    const errors = [new Error('Attempt 1'), new Error('Attempt 2')];
    const error = new RetryError('All retries failed', { attempts: 2, errors });
    expect(error.attempts).toBe(2);
    expect(error.errors).toEqual(errors);
  });
});

describe('URLError', () => {
  test('includes invalid URL', () => {
    const error = new URLError('Invalid URL', { url: 'not a url' });
    expect(error.url).toBe('not a url');
    expect(error.code).toBe(ERROR_CODES.INVALID_URL);
  });
});
