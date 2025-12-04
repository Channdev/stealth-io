import { Headers, parseContentType, getCharset, isJsonContentType, isTextContentType } from '../src/utils/headers.js';

describe('Headers', () => {
  describe('constructor', () => {
    test('creates empty headers', () => {
      const headers = new Headers();
      expect(headers.size).toBe(0);
    });

    test('creates headers from object', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      expect(headers.get('content-type')).toBe('application/json');
    });

    test('creates headers from another Headers instance', () => {
      const original = new Headers({ 'X-Custom': 'value' });
      const copy = new Headers(original);
      expect(copy.get('x-custom')).toBe('value');
    });

    test('creates headers from array of pairs', () => {
      const headers = new Headers([['Content-Type', 'text/plain'], ['Accept', 'application/json']]);
      expect(headers.get('content-type')).toBe('text/plain');
      expect(headers.get('accept')).toBe('application/json');
    });
  });

  describe('get/set', () => {
    test('set overwrites existing value', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'text/plain');
      headers.set('Content-Type', 'application/json');
      expect(headers.get('content-type')).toBe('application/json');
    });

    test('get is case-insensitive', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      expect(headers.get('CONTENT-TYPE')).toBe('application/json');
      expect(headers.get('content-type')).toBe('application/json');
    });

    test('get returns null for missing headers', () => {
      const headers = new Headers();
      expect(headers.get('missing')).toBeNull();
    });
  });

  describe('append', () => {
    test('appends multiple values', () => {
      const headers = new Headers();
      headers.append('Accept', 'text/html');
      headers.append('Accept', 'application/json');
      expect(headers.get('accept')).toBe('text/html, application/json');
    });

    test('getAll returns array of values', () => {
      const headers = new Headers();
      headers.append('Accept', 'text/html');
      headers.append('Accept', 'application/json');
      expect(headers.getAll('accept')).toEqual(['text/html', 'application/json']);
    });
  });

  describe('has/delete', () => {
    test('has returns true for existing header', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      expect(headers.has('content-type')).toBe(true);
      expect(headers.has('missing')).toBe(false);
    });

    test('delete removes header', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.delete('content-type');
      expect(headers.has('content-type')).toBe(false);
    });
  });

  describe('iteration', () => {
    test('forEach iterates over headers', () => {
      const headers = new Headers({ 'A': '1', 'B': '2' });
      const result = [];
      headers.forEach((value, key) => result.push([key, value]));
      expect(result).toContainEqual(['a', '1']);
      expect(result).toContainEqual(['b', '2']);
    });

    test('Symbol.iterator works', () => {
      const headers = new Headers({ 'A': '1' });
      const entries = [...headers];
      expect(entries).toContainEqual(['a', '1']);
    });
  });

  describe('toObject', () => {
    test('converts to plain object', () => {
      const headers = new Headers({ 'Content-Type': 'application/json', 'Accept': 'text/plain' });
      const obj = headers.toObject();
      expect(obj['content-type']).toBe('application/json');
      expect(obj['accept']).toBe('text/plain');
    });
  });

  describe('merge', () => {
    test('merges multiple header sources', () => {
      const merged = Headers.merge(
        { 'A': '1' },
        { 'B': '2' },
        new Headers({ 'C': '3' })
      );
      expect(merged.get('a')).toBe('1');
      expect(merged.get('b')).toBe('2');
      expect(merged.get('c')).toBe('3');
    });

    test('later sources override earlier ones', () => {
      const merged = Headers.merge(
        { 'A': '1' },
        { 'A': '2' }
      );
      expect(merged.get('a')).toBe('2');
    });
  });
});

describe('parseContentType', () => {
  test('parses simple content type', () => {
    const result = parseContentType('application/json');
    expect(result.type).toBe('application');
    expect(result.subtype).toBe('json');
    expect(result.fullType).toBe('application/json');
  });

  test('parses content type with parameters', () => {
    const result = parseContentType('text/plain; charset=utf-8');
    expect(result.type).toBe('text');
    expect(result.subtype).toBe('plain');
    expect(result.parameters.charset).toBe('utf-8');
  });

  test('handles null input', () => {
    const result = parseContentType(null);
    expect(result.type).toBeNull();
  });
});

describe('getCharset', () => {
  test('extracts charset from headers', () => {
    const headers = new Headers({ 'Content-Type': 'text/plain; charset=iso-8859-1' });
    expect(getCharset(headers)).toBe('iso-8859-1');
  });

  test('defaults to utf-8', () => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    expect(getCharset(headers)).toBe('utf-8');
  });
});

describe('isJsonContentType', () => {
  test('returns true for application/json', () => {
    expect(isJsonContentType('application/json')).toBe(true);
  });

  test('returns true for +json suffix', () => {
    expect(isJsonContentType('application/vnd.api+json')).toBe(true);
  });

  test('returns false for other types', () => {
    expect(isJsonContentType('text/plain')).toBe(false);
  });
});

describe('isTextContentType', () => {
  test('returns true for text types', () => {
    expect(isTextContentType('text/plain')).toBe(true);
    expect(isTextContentType('text/html')).toBe(true);
  });

  test('returns true for json/xml subtypes', () => {
    expect(isTextContentType('application/json')).toBe(true);
    expect(isTextContentType('application/xml')).toBe(true);
  });
});
