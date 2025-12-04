import {
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
  urlTemplate
} from '../src/utils/url.js';
import { URLError } from '../src/core/errors.js';

describe('parseUrl', () => {
  test('parses valid URL', () => {
    const url = parseUrl('https://example.com/path?query=value');
    expect(url.hostname).toBe('example.com');
    expect(url.pathname).toBe('/path');
  });

  test('throws URLError for invalid URL', () => {
    expect(() => parseUrl('not a url')).toThrow(URLError);
  });

  test('throws URLError for empty string', () => {
    expect(() => parseUrl('')).toThrow(URLError);
  });

  test('parses relative URL with base', () => {
    const url = parseUrl('/path', 'https://example.com');
    expect(url.href).toBe('https://example.com/path');
  });
});

describe('isValidUrl', () => {
  test('returns true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  test('returns false for invalid URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('resolveUrl', () => {
  test('resolves relative URL', () => {
    const result = resolveUrl('/path', 'https://example.com');
    expect(result).toBe('https://example.com/path');
  });

  test('resolves relative path', () => {
    const result = resolveUrl('child', 'https://example.com/parent/');
    expect(result).toBe('https://example.com/parent/child');
  });

  test('absolute URL overrides base', () => {
    const result = resolveUrl('https://other.com', 'https://example.com');
    expect(result).toBe('https://other.com/');
  });
});

describe('getOrigin', () => {
  test('extracts origin from URL', () => {
    expect(getOrigin('https://example.com/path')).toBe('https://example.com');
    expect(getOrigin('http://localhost:3000/test')).toBe('http://localhost:3000');
  });
});

describe('isSameOrigin', () => {
  test('returns true for same origin', () => {
    expect(isSameOrigin('https://example.com/a', 'https://example.com/b')).toBe(true);
  });

  test('returns false for different origin', () => {
    expect(isSameOrigin('https://example.com', 'https://other.com')).toBe(false);
    expect(isSameOrigin('http://example.com', 'https://example.com')).toBe(false);
  });

  test('returns false for invalid URLs', () => {
    expect(isSameOrigin('invalid', 'https://example.com')).toBe(false);
  });
});

describe('getProtocol', () => {
  test('extracts protocol without colon', () => {
    expect(getProtocol('https://example.com')).toBe('https');
    expect(getProtocol('http://example.com')).toBe('http');
  });
});

describe('isHttps', () => {
  test('returns true for HTTPS URLs', () => {
    expect(isHttps('https://example.com')).toBe(true);
  });

  test('returns false for HTTP URLs', () => {
    expect(isHttps('http://example.com')).toBe(false);
  });
});

describe('getDefaultPort', () => {
  test('returns correct default ports', () => {
    expect(getDefaultPort('http')).toBe(80);
    expect(getDefaultPort('https')).toBe(443);
  });

  test('returns 80 for unknown protocols', () => {
    expect(getDefaultPort('ftp')).toBe(80);
  });
});

describe('getPort', () => {
  test('returns explicit port', () => {
    expect(getPort('https://example.com:8080')).toBe(8080);
  });

  test('returns default port when not specified', () => {
    expect(getPort('https://example.com')).toBe(443);
    expect(getPort('http://example.com')).toBe(80);
  });
});

describe('normalizeUrl', () => {
  test('lowercases hostname', () => {
    const result = normalizeUrl('https://EXAMPLE.COM/Path');
    expect(result).toContain('example.com');
  });

  test('removes default port', () => {
    const result = normalizeUrl('https://example.com:443/path');
    expect(result).toBe('https://example.com/path');
  });

  test('removes trailing slash when enabled', () => {
    const result = normalizeUrl('https://example.com/path/', { removeTrailingSlash: true });
    expect(result).toBe('https://example.com/path');
  });

  test('keeps root path slash', () => {
    const result = normalizeUrl('https://example.com/', { removeTrailingSlash: true });
    expect(result).toBe('https://example.com/');
  });
});

describe('buildUrl', () => {
  test('builds URL from components', () => {
    const result = buildUrl({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/path'
    });
    expect(result).toBe('https://example.com/path');
  });

  test('includes non-default port', () => {
    const result = buildUrl({
      protocol: 'https',
      hostname: 'example.com',
      port: 8080,
      pathname: '/'
    });
    expect(result).toBe('https://example.com:8080/');
  });

  test('includes query parameters', () => {
    const result = buildUrl({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/',
      query: { a: '1' }
    });
    expect(result).toBe('https://example.com/?a=1');
  });

  test('includes hash', () => {
    const result = buildUrl({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/',
      hash: '#section'
    });
    expect(result).toBe('https://example.com/#section');
  });

  test('throws for missing hostname', () => {
    expect(() => buildUrl({ protocol: 'https' })).toThrow(URLError);
  });
});

describe('joinPath', () => {
  test('joins path segments', () => {
    expect(joinPath('a', 'b', 'c')).toBe('a/b/c');
  });

  test('handles leading slashes', () => {
    expect(joinPath('/a', '/b')).toBe('/a/b');
  });

  test('handles trailing slashes', () => {
    expect(joinPath('a/', 'b/')).toBe('a/b/');
  });

  test('filters empty segments', () => {
    expect(joinPath('a', '', 'b')).toBe('a/b');
  });
});

describe('combineUrl', () => {
  test('combines base URL with path', () => {
    const result = combineUrl('https://example.com/api', '/users');
    expect(result).toBe('https://example.com/api/users');
  });

  test('combines base URL with query', () => {
    const result = combineUrl('https://example.com', null, { page: '1' });
    expect(result).toBe('https://example.com/?page=1');
  });

  test('merges existing query with new query', () => {
    const result = combineUrl('https://example.com?existing=true', null, { new: 'param' });
    expect(result).toContain('existing=true');
    expect(result).toContain('new=param');
  });
});

describe('toRequestOptions', () => {
  test('extracts request options from URL', () => {
    const result = toRequestOptions('https://example.com:8080/path?query=value');
    expect(result.protocol).toBe('https:');
    expect(result.hostname).toBe('example.com');
    expect(result.port).toBe(8080);
    expect(result.path).toBe('/path?query=value');
  });
});

describe('urlTemplate', () => {
  test('encodes interpolated values', () => {
    const id = 'user/123';
    const result = urlTemplate`https://example.com/users/${id}`;
    expect(result).toBe('https://example.com/users/user%2F123');
  });

  test('handles multiple values', () => {
    const a = 'foo';
    const b = 'bar';
    const result = urlTemplate`https://example.com/${a}/${b}`;
    expect(result).toBe('https://example.com/foo/bar');
  });
});
