export function encodeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function decodeValue(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export function stringify(params, options = {}) {
  const {
    arrayFormat = 'repeat',
    skipNull = true,
    skipEmptyString = false,
    prefix = ''
  } = options;

  if (!params || typeof params !== 'object') {
    return '';
  }

  const pairs = [];

  function processValue(key, value) {
    if (value === null || value === undefined) {
      if (!skipNull) {
        pairs.push(`${encodeValue(key)}=`);
      }
      return;
    }

    if (value === '' && skipEmptyString) {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }
      switch (arrayFormat) {
        case 'bracket':
          for (const item of value) {
            processValue(`${key}[]`, item);
          }
          break;
        case 'index':
          value.forEach((item, index) => {
            processValue(`${key}[${index}]`, item);
          });
          break;
        case 'comma':
          pairs.push(`${encodeValue(key)}=${value.map(encodeValue).join(',')}`);
          break;
        case 'repeat':
        default:
          for (const item of value) {
            processValue(key, item);
          }
          break;
      }
      return;
    }

    if (value instanceof Date) {
      pairs.push(`${encodeValue(key)}=${encodeValue(value.toISOString())}`);
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        const fullKey = key ? `${key}[${nestedKey}]` : nestedKey;
        processValue(fullKey, nestedValue);
      }
      return;
    }

    pairs.push(`${encodeValue(key)}=${encodeValue(value)}`);
  }

  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    processValue(fullKey, value);
  }

  return pairs.join('&');
}

export function parse(queryString, options = {}) {
  const {
    parseNumbers = false,
    parseBooleans = false,
    parseArrays = true
  } = options;

  if (!queryString || typeof queryString !== 'string') {
    return {};
  }

  const str = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  if (!str) {
    return {};
  }

  const result = {};

  function parseValue(value) {
    if (parseNumbers && /^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    if (parseBooleans && (value === 'true' || value === 'false')) {
      return value === 'true';
    }
    return value;
  }

  function setNestedValue(obj, path, value) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextKey = path[i + 1];
      const shouldBeArray = parseArrays && (nextKey === '' || /^\d+$/.test(nextKey));
      if (!(key in current)) {
        current[key] = shouldBeArray ? [] : {};
      }
      current = current[key];
    }
    const lastKey = path[path.length - 1];
    if (parseArrays && (lastKey === '' || /^\d+$/.test(lastKey))) {
      if (!Array.isArray(current)) {
        return;
      }
      if (lastKey === '') {
        current.push(value);
      } else {
        current[parseInt(lastKey, 10)] = value;
      }
    } else {
      if (lastKey in current) {
        if (!Array.isArray(current[lastKey])) {
          current[lastKey] = [current[lastKey]];
        }
        current[lastKey].push(value);
      } else {
        current[lastKey] = value;
      }
    }
  }

  function parsePath(key) {
    if (!parseArrays) {
      return [key];
    }
    const match = key.match(/^([^[]+)(.*)$/);
    if (!match) {
      return [key];
    }
    const [, base, brackets] = match;
    const path = [base];
    const bracketRegex = /\[([^\]]*)\]/g;
    let bracketMatch;
    while ((bracketMatch = bracketRegex.exec(brackets)) !== null) {
      path.push(bracketMatch[1]);
    }
    return path;
  }

  for (const pair of str.split('&')) {
    if (!pair) continue;
    const [encodedKey, ...encodedValueParts] = pair.split('=');
    const key = decodeValue(encodedKey);
    const value = decodeValue(encodedValueParts.join('='));
    if (!key) continue;
    const path = parsePath(key);
    const parsedValue = parseValue(value);
    if (path.length === 1) {
      if (path[0] in result) {
        if (!Array.isArray(result[path[0]])) {
          result[path[0]] = [result[path[0]]];
        }
        result[path[0]].push(parsedValue);
      } else {
        result[path[0]] = parsedValue;
      }
    } else {
      setNestedValue(result, path, parsedValue);
    }
  }

  return result;
}

export function merge(...sources) {
  const result = {};
  for (const source of sources) {
    if (!source) continue;
    const params = typeof source === 'string' ? parse(source) : source;
    for (const [key, value] of Object.entries(params)) {
      result[key] = value;
    }
  }
  return result;
}

export function appendToUrl(url, params, options = {}) {
  if (!params || (typeof params === 'object' && Object.keys(params).length === 0)) {
    return url;
  }
  const paramsObj = typeof params === 'string' ? parse(params) : params;
  const queryString = stringify(paramsObj, options);
  if (!queryString) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${queryString}`;
}

export function extractFromUrl(url, options = {}) {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) {
    return {};
  }
  let queryEnd = url.indexOf('#', queryStart);
  if (queryEnd === -1) {
    queryEnd = url.length;
  }
  const queryString = url.slice(queryStart + 1, queryEnd);
  return parse(queryString, options);
}
