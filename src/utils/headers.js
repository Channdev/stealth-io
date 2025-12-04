export class Headers {
  #headers;

  constructor(init = {}) {
    this.#headers = new Map();
    if (init instanceof Headers) {
      for (const [key, values] of init.entries()) {
        this.#headers.set(key, [...values]);
      }
    } else if (Array.isArray(init)) {
      for (const [key, value] of init) {
        this.append(key, value);
      }
    } else if (init && typeof init === 'object') {
      for (const [key, value] of Object.entries(init)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            this.append(key, v);
          }
        } else if (value !== undefined && value !== null) {
          this.set(key, value);
        }
      }
    }
  }

  #normalizeKey(name) {
    if (typeof name !== 'string') {
      throw new TypeError('Header name must be a string');
    }
    return name.toLowerCase().trim();
  }

  #normalizeValue(value) {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value).trim();
  }

  append(name, value) {
    const key = this.#normalizeKey(name);
    const normalizedValue = this.#normalizeValue(value);
    if (!this.#headers.has(key)) {
      this.#headers.set(key, []);
    }
    this.#headers.get(key).push(normalizedValue);
  }

  delete(name) {
    const key = this.#normalizeKey(name);
    this.#headers.delete(key);
  }

  entries() {
    return this.#headers.entries();
  }

  forEach(callback, thisArg) {
    for (const [key, values] of this.#headers) {
      callback.call(thisArg, values.join(', '), key, this);
    }
  }

  get(name) {
    const key = this.#normalizeKey(name);
    const values = this.#headers.get(key);
    return values ? values.join(', ') : null;
  }

  getAll(name) {
    const key = this.#normalizeKey(name);
    return this.#headers.get(key) || [];
  }

  has(name) {
    const key = this.#normalizeKey(name);
    return this.#headers.has(key);
  }

  keys() {
    return this.#headers.keys();
  }

  set(name, value) {
    const key = this.#normalizeKey(name);
    const normalizedValue = this.#normalizeValue(value);
    this.#headers.set(key, [normalizedValue]);
  }

  values() {
    return this.#headers.values();
  }

  get size() {
    return this.#headers.size;
  }

  *[Symbol.iterator]() {
    for (const [key, values] of this.#headers) {
      yield [key, values.join(', ')];
    }
  }

  toObject() {
    const result = {};
    for (const [key, values] of this.#headers) {
      result[key] = values.length === 1 ? values[0] : values.join(', ');
    }
    return result;
  }

  toRawArray() {
    const result = [];
    for (const [key, values] of this.#headers) {
      for (const value of values) {
        result.push(key, value);
      }
    }
    return result;
  }

  static fromNodeResponse(headers) {
    const instance = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          instance.append(key, v);
        }
      } else {
        instance.set(key, value);
      }
    }
    return instance;
  }

  static merge(...sources) {
    const result = new Headers();
    for (const source of sources) {
      if (!source) continue;
      const headers = source instanceof Headers ? source : new Headers(source);
      for (const [key, values] of headers.entries()) {
        result.delete(key);
        for (const value of values) {
          result.append(key, value);
        }
      }
    }
    return result;
  }

  toString() {
    const lines = [];
    for (const [key, values] of this.#headers) {
      lines.push(`${key}: ${values.join(', ')}`);
    }
    return lines.join('\n');
  }

  toJSON() {
    return this.toObject();
  }
}

export function parseContentType(contentType) {
  if (!contentType) {
    return { type: null, subtype: null, parameters: {} };
  }
  const parts = contentType.split(';').map(p => p.trim());
  const [type, subtype] = (parts[0] || '').split('/');
  const parameters = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].split('=').map(p => p.trim());
    if (key && value) {
      parameters[key.toLowerCase()] = value.replace(/^["']|["']$/g, '');
    }
  }
  return {
    type: type || null,
    subtype: subtype || null,
    fullType: parts[0] || null,
    parameters
  };
}

export function getCharset(headers) {
  const headersObj = headers instanceof Headers ? headers : new Headers(headers);
  const contentType = headersObj.get('content-type');
  if (!contentType) {
    return 'utf-8';
  }
  const { parameters } = parseContentType(contentType);
  return parameters.charset || 'utf-8';
}

export function isJsonContentType(contentType) {
  if (!contentType) return false;
  const { fullType, subtype } = parseContentType(contentType);
  return fullType === 'application/json' || (subtype && subtype.endsWith('+json'));
}

export function isTextContentType(contentType) {
  if (!contentType) return false;
  const { type, subtype } = parseContentType(contentType);
  return type === 'text' || subtype === 'json' || subtype === 'xml' ||
         (subtype && subtype.endsWith('+json')) || (subtype && subtype.endsWith('+xml'));
}
