import { stringify, parse, merge, appendToUrl, extractFromUrl, encodeValue, decodeValue } from '../src/utils/query.js';

describe('encodeValue', () => {
  test('encodes special characters', () => {
    expect(encodeValue('hello world')).toBe('hello%20world');
    expect(encodeValue('a=b&c=d')).toBe('a%3Db%26c%3Dd');
  });

  test('handles null and undefined', () => {
    expect(encodeValue(null)).toBe('');
    expect(encodeValue(undefined)).toBe('');
  });
});

describe('decodeValue', () => {
  test('decodes encoded values', () => {
    expect(decodeValue('hello%20world')).toBe('hello world');
  });

  test('replaces + with space', () => {
    expect(decodeValue('hello+world')).toBe('hello world');
  });
});

describe('stringify', () => {
  test('stringifies simple object', () => {
    const result = stringify({ a: '1', b: '2' });
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });

  test('handles arrays with repeat format', () => {
    const result = stringify({ tags: ['a', 'b'] }, { arrayFormat: 'repeat' });
    expect(result).toBe('tags=a&tags=b');
  });

  test('handles arrays with bracket format', () => {
    const result = stringify({ tags: ['a', 'b'] }, { arrayFormat: 'bracket' });
    expect(result).toBe('tags%5B%5D=a&tags%5B%5D=b');
  });

  test('handles arrays with comma format', () => {
    const result = stringify({ tags: ['a', 'b'] }, { arrayFormat: 'comma' });
    expect(result).toBe('tags=a,b');
  });

  test('handles nested objects', () => {
    const result = stringify({ filter: { status: 'active' } });
    expect(result).toContain('filter%5Bstatus%5D=active');
  });

  test('skips null values by default', () => {
    const result = stringify({ a: '1', b: null });
    expect(result).toBe('a=1');
  });

  test('includes null values when skipNull is false', () => {
    const result = stringify({ a: '1', b: null }, { skipNull: false });
    expect(result).toContain('b=');
  });

  test('handles Date objects', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = stringify({ date });
    expect(result).toContain('2024-01-01');
  });

  test('returns empty string for null/undefined input', () => {
    expect(stringify(null)).toBe('');
    expect(stringify(undefined)).toBe('');
  });
});

describe('parse', () => {
  test('parses simple query string', () => {
    const result = parse('a=1&b=2');
    expect(result).toEqual({ a: '1', b: '2' });
  });

  test('handles leading ?', () => {
    const result = parse('?a=1&b=2');
    expect(result).toEqual({ a: '1', b: '2' });
  });

  test('handles duplicate keys', () => {
    const result = parse('a=1&a=2');
    expect(result.a).toEqual(['1', '2']);
  });

  test('parses numbers when enabled', () => {
    const result = parse('a=123&b=45.67', { parseNumbers: true });
    expect(result.a).toBe(123);
    expect(result.b).toBe(45.67);
  });

  test('parses booleans when enabled', () => {
    const result = parse('a=true&b=false', { parseBooleans: true });
    expect(result.a).toBe(true);
    expect(result.b).toBe(false);
  });

  test('handles bracket notation for arrays', () => {
    const result = parse('tags[]=a&tags[]=b');
    expect(result.tags).toEqual(['a', 'b']);
  });

  test('returns empty object for empty input', () => {
    expect(parse('')).toEqual({});
    expect(parse(null)).toEqual({});
  });
});

describe('merge', () => {
  test('merges multiple sources', () => {
    const result = merge({ a: '1' }, { b: '2' }, { c: '3' });
    expect(result).toEqual({ a: '1', b: '2', c: '3' });
  });

  test('later values override earlier ones', () => {
    const result = merge({ a: '1' }, { a: '2' });
    expect(result.a).toBe('2');
  });

  test('handles string input', () => {
    const result = merge('a=1', { b: '2' });
    expect(result).toEqual({ a: '1', b: '2' });
  });

  test('skips null sources', () => {
    const result = merge({ a: '1' }, null, { b: '2' });
    expect(result).toEqual({ a: '1', b: '2' });
  });
});

describe('appendToUrl', () => {
  test('appends params to URL without query', () => {
    const result = appendToUrl('https://example.com', { a: '1' });
    expect(result).toBe('https://example.com?a=1');
  });

  test('appends params to URL with existing query', () => {
    const result = appendToUrl('https://example.com?existing=true', { a: '1' });
    expect(result).toBe('https://example.com?existing=true&a=1');
  });

  test('returns original URL for empty params', () => {
    expect(appendToUrl('https://example.com', {})).toBe('https://example.com');
    expect(appendToUrl('https://example.com', null)).toBe('https://example.com');
  });
});

describe('extractFromUrl', () => {
  test('extracts query params from URL', () => {
    const result = extractFromUrl('https://example.com?a=1&b=2');
    expect(result).toEqual({ a: '1', b: '2' });
  });

  test('returns empty object for URL without query', () => {
    const result = extractFromUrl('https://example.com');
    expect(result).toEqual({});
  });

  test('handles URL with fragment', () => {
    const result = extractFromUrl('https://example.com?a=1#section');
    expect(result).toEqual({ a: '1' });
  });
});
