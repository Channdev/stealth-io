import { StealthResponse } from '../types/response.js';
import { Headers } from '../utils/headers.js';
import { resolveUrl, isSameOrigin } from '../utils/url.js';
import { HTTPError, RedirectError } from '../core/errors.js';
import {
  HTTP_STATUS,
  REDIRECT_STATUS_CODES,
  CROSS_ORIGIN_STRIP_HEADERS,
  ERROR_CODES,
  HTTP_METHODS
} from '../core/constants.js';
import { REDIRECT_HISTORY, TIMING, METADATA } from '../core/symbols.js';

export function handleResponse(nodeResponse, requestConfig) {
  const timing = nodeResponse._timing ? { ...nodeResponse._timing, endTime: Date.now() } : null;

  if (timing && timing.startTime) {
    timing.total = timing.endTime - timing.startTime;
    if (timing.dnsTime) {
      timing.dns = timing.dnsTime - timing.startTime;
    }
    if (timing.connectTime) {
      timing.connect = timing.connectTime - (timing.dnsTime || timing.startTime);
    }
    if (timing.secureConnectTime) {
      timing.tls = timing.secureConnectTime - timing.connectTime;
    }
    if (timing.firstByteTime) {
      timing.firstByte = timing.firstByteTime - timing.startTime;
    }
  }

  const redirectHistory = requestConfig[METADATA]?.redirectHistory || [];

  return StealthResponse.fromNodeResponse(nodeResponse, {
    request: requestConfig,
    redirectHistory,
    timing,
    url: nodeResponse._url || requestConfig.url
  });
}

export function validateResponseStatus(response, requestConfig) {
  if (!requestConfig.validateStatus) {
    return;
  }
  const validateFn = requestConfig.validateStatusFn || ((status) => status >= 200 && status < 300);
  if (!validateFn(response.status)) {
    throw new HTTPError(`Request failed with status code ${response.status}`, response, { request: requestConfig });
  }
}

export function isRedirectStatus(status) {
  return REDIRECT_STATUS_CODES.has(status);
}

export function handleRedirect(nodeResponse, requestConfig) {
  const status = nodeResponse.statusCode;

  if (!requestConfig.followRedirects) {
    return null;
  }

  const metadata = requestConfig[METADATA] || {};
  const redirectCount = metadata.redirectCount || 0;
  const redirectHistory = metadata.redirectHistory || [];

  if (redirectCount >= requestConfig.maxRedirects) {
    throw new RedirectError(
      `Maximum number of redirects (${requestConfig.maxRedirects}) exceeded`,
      ERROR_CODES.MAX_REDIRECTS_EXCEEDED,
      { redirectCount, redirectHistory, url: requestConfig.url }
    );
  }

  const location = nodeResponse.headers['location'];
  if (!location) {
    throw new RedirectError('Redirect response missing Location header', ERROR_CODES.REDIRECT_ERROR, { status, url: requestConfig.url });
  }

  let redirectUrl;
  try {
    redirectUrl = resolveUrl(location, requestConfig.url);
  } catch (error) {
    throw new RedirectError(`Invalid redirect URL: ${location}`, ERROR_CODES.REDIRECT_ERROR, { location, baseUrl: requestConfig.url }, error);
  }

  const crossOrigin = !isSameOrigin(requestConfig.url, redirectUrl);
  let newHeaders = new Headers(requestConfig.headers);

  if (crossOrigin) {
    for (const header of CROSS_ORIGIN_STRIP_HEADERS) {
      newHeaders.delete(header);
    }
  }

  let newMethod = requestConfig.method;
  let newBody = requestConfig.body;

  if (status === HTTP_STATUS.SEE_OTHER) {
    newMethod = HTTP_METHODS.GET;
    newBody = null;
    newHeaders.delete('content-type');
    newHeaders.delete('content-length');
  } else if ((status === HTTP_STATUS.MOVED_PERMANENTLY || status === HTTP_STATUS.FOUND) && requestConfig.method === HTTP_METHODS.POST) {
    newMethod = HTTP_METHODS.GET;
    newBody = null;
    newHeaders.delete('content-type');
    newHeaders.delete('content-length');
  }

  const newRedirectHistory = [...redirectHistory, requestConfig.url];

  return {
    ...requestConfig,
    url: redirectUrl,
    method: newMethod,
    headers: newHeaders,
    body: newBody,
    [METADATA]: {
      ...metadata,
      redirectCount: redirectCount + 1,
      redirectHistory: newRedirectHistory
    }
  };
}

export async function parseResponseBody(response, requestConfig) {
  const responseType = requestConfig.responseType || 'auto';
  switch (responseType) {
    case 'json':
      return response.json();
    case 'text':
      return response.text();
    case 'buffer':
      return response.buffer();
    case 'stream':
      return response.stream();
    case 'auto':
    default:
      return response.auto();
  }
}

export function createResponseHandler(options = {}) {
  const { sendRequest } = options;

  return async function processResponse(nodeResponse, requestConfig) {
    const status = nodeResponse.statusCode;

    if (isRedirectStatus(status) && sendRequest) {
      const redirectConfig = handleRedirect(nodeResponse, requestConfig);
      if (redirectConfig) {
        nodeResponse.resume();
        return sendRequest(redirectConfig);
      }
    }

    const response = handleResponse(nodeResponse, requestConfig);
    validateResponseStatus(response, requestConfig);
    return response;
  };
}

export function extractResponseMetadata(response) {
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    ok: response.ok,
    redirected: response.redirected,
    headers: response.headers.toObject(),
    timing: response.timing,
    redirectHistory: response.redirectHistory
  };
}
