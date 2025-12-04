import { URL as NodeURL } from 'url';
import { URLError } from '../core/errors.js';
import { stringify as stringifyQuery, merge as mergeQuery } from './query.js';

export function parseUrl(urlString, base) {
  if (!urlString || typeof urlString !== 'string') {
    throw new URLError('URL must be a non-empty string', { url: urlString });
  }
  try {
    return new NodeURL(urlString, base);
  } catch (error) {
    throw new URLError(`Invalid URL: ${urlString}`, { url: urlString, base }, error);
  }
}

export function isValidUrl(urlString, base) {
  try {
    new NodeURL(urlString, base);
    return true;
  } catch {
    return false;
  }
}

export function resolveUrl(relativeUrl, baseUrl) {
  try {
    const base = new NodeURL(baseUrl);
    const resolved = new NodeURL(relativeUrl, base);
    return resolved.href;
  } catch (error) {
    throw new URLError(`Failed to resolve URL: ${relativeUrl} against ${baseUrl}`, { relativeUrl, baseUrl }, error);
  }
}

export function getOrigin(urlString) {
  const url = parseUrl(urlString);
  return url.origin;
}

export function isSameOrigin(url1, url2) {
  try {
    const origin1 = getOrigin(url1);
    const origin2 = getOrigin(url2);
    return origin1 === origin2;
  } catch {
    return false;
  }
}

export function getProtocol(urlString) {
  const url = parseUrl(urlString);
  return url.protocol.replace(':', '');
}

export function isHttps(urlString) {
  return getProtocol(urlString) === 'https';
}

export function getDefaultPort(protocol) {
  const defaults = { 'http': 80, 'https': 443 };
  return defaults[protocol] || 80;
}

export function getPort(urlString) {
  const url = parseUrl(urlString);
  if (url.port) {
    return parseInt(url.port, 10);
  }
  return getDefaultPort(getProtocol(urlString));
}

export function normalizeUrl(urlString, options = {}) {
  const {
    removeTrailingSlash = false,
    removeDefaultPort = true,
    sortQueryParams = false,
    lowercaseHost = true
  } = options;

  const url = parseUrl(urlString);

  if (lowercaseHost) {
    url.hostname = url.hostname.toLowerCase();
  }

  if (removeDefaultPort) {
    const defaultPort = getDefaultPort(url.protocol.replace(':', ''));
    if (parseInt(url.port, 10) === defaultPort) {
      url.port = '';
    }
  }

  if (removeTrailingSlash && url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  if (sortQueryParams && url.search) {
    const params = new URLSearchParams(url.search);
    const sorted = new URLSearchParams([...params].sort((a, b) => a[0].localeCompare(b[0])));
    url.search = sorted.toString();
  }

  return url.href;
}

export function buildUrl(components) {
  const {
    protocol = 'https',
    hostname,
    port,
    pathname = '/',
    query,
    hash
  } = components;

  if (!hostname) {
    throw new URLError('Hostname is required to build a URL', { components });
  }

  let url = `${protocol}://${hostname}`;

  if (port) {
    const defaultPort = getDefaultPort(protocol);
    if (port !== defaultPort) {
      url += `:${port}`;
    }
  }

  url += pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (query) {
    const queryString = typeof query === 'string' ? query : stringifyQuery(query);
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  if (hash) {
    url += hash.startsWith('#') ? hash : `#${hash}`;
  }

  return url;
}

export function joinPath(...segments) {
  return segments
    .map((segment, index) => {
      if (index > 0 && segment.startsWith('/')) {
        segment = segment.slice(1);
      }
      if (index < segments.length - 1 && segment.endsWith('/')) {
        segment = segment.slice(0, -1);
      }
      return segment;
    })
    .filter(Boolean)
    .join('/');
}

export function combineUrl(baseUrl, path, query) {
  const url = parseUrl(baseUrl);

  if (path) {
    url.pathname = joinPath(url.pathname, path);
  }

  if (query) {
    const existingQuery = Object.fromEntries(url.searchParams);
    const mergedQuery = mergeQuery(existingQuery, query);
    url.search = stringifyQuery(mergedQuery);
  }

  return url.href;
}

export function toRequestOptions(urlString) {
  const url = parseUrl(urlString);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? parseInt(url.port, 10) : getDefaultPort(url.protocol.replace(':', '')),
    path: url.pathname + url.search,
    hash: url.hash
  };
}

export function urlTemplate(strings, ...values) {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const encodedValue = encodeURIComponent(String(value));
    result += encodedValue + strings[i + 1];
  }
  return result;
}
