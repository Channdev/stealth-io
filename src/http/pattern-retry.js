import { BACKOFF_STRATEGIES, RETRYABLE_STATUS_CODES } from '../core/constants.js';
import { RetryError } from '../core/errors.js';
import { METADATA, RETRY_COUNT } from '../core/symbols.js';
import { isAbortError } from './abort.js';
import { calculateRetryDelay } from './retry.js';

export function matchesPattern(value, pattern) {
  if (!pattern || value === undefined || value === null) {
    return false;
  }

  if (pattern instanceof RegExp) {
    return pattern.test(String(value));
  }

  if (typeof pattern === 'string') {
    return String(value).includes(pattern);
  }

  if (typeof pattern === 'function') {
    return pattern(value);
  }

  if (Array.isArray(pattern)) {
    return pattern.some(p => matchesPattern(value, p));
  }

  return false;
}

export function matchesBodyPattern(body, patterns) {
  if (!patterns || !body) {
    return { matches: false };
  }

  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  for (const pattern of patternList) {
    if (matchesPattern(bodyStr, pattern)) {
      return { matches: true, pattern, matchedText: bodyStr };
    }
  }

  return { matches: false };
}

export function matchesHeaderPattern(headers, patterns) {
  if (!patterns || !headers) {
    return { matches: false };
  }

  const getHeader = (name) => {
    if (headers.get) return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
  };

  for (const [headerName, pattern] of Object.entries(patterns)) {
    const headerValue = getHeader(headerName);
    if (headerValue && matchesPattern(headerValue, pattern)) {
      return { matches: true, header: headerName, pattern, value: headerValue };
    }
  }

  return { matches: false };
}

export function matchesStatusPattern(status, patterns) {
  if (!patterns) {
    return { matches: false };
  }

  if (typeof patterns === 'number') {
    return { matches: status === patterns, pattern: patterns };
  }

  if (Array.isArray(patterns)) {
    const matches = patterns.includes(status);
    return { matches, pattern: status };
  }

  if (patterns instanceof Set) {
    return { matches: patterns.has(status), pattern: status };
  }

  if (typeof patterns === 'function') {
    return { matches: patterns(status), pattern: 'custom function' };
  }

  if (typeof patterns === 'object' && patterns.min !== undefined && patterns.max !== undefined) {
    const matches = status >= patterns.min && status <= patterns.max;
    return { matches, pattern: `${patterns.min}-${patterns.max}` };
  }

  return { matches: false };
}

export async function shouldRetryOnPattern(response, options = {}) {
  const {
    matchBody,
    matchHeaders,
    matchStatus,
    matchAny = false,
    excludeBody,
    excludeHeaders,
    excludeStatus
  } = options;

  if (excludeStatus && matchesStatusPattern(response.status, excludeStatus).matches) {
    return { shouldRetry: false, reason: 'excluded by status' };
  }

  let bodyText = null;
  if (matchBody || excludeBody) {
    try {
      const cloned = response.clone ? response.clone() : response;
      bodyText = await cloned.text();
    } catch {}
  }

  if (excludeBody && bodyText) {
    const excludeMatch = matchesBodyPattern(bodyText, excludeBody);
    if (excludeMatch.matches) {
      return { shouldRetry: false, reason: 'excluded by body pattern', match: excludeMatch };
    }
  }

  if (excludeHeaders) {
    const excludeMatch = matchesHeaderPattern(response.headers, excludeHeaders);
    if (excludeMatch.matches) {
      return { shouldRetry: false, reason: 'excluded by header pattern', match: excludeMatch };
    }
  }

  const results = [];

  if (matchStatus) {
    const statusMatch = matchesStatusPattern(response.status, matchStatus);
    results.push({ type: 'status', ...statusMatch });
  }

  if (matchBody && bodyText) {
    const bodyMatch = matchesBodyPattern(bodyText, matchBody);
    results.push({ type: 'body', ...bodyMatch });
  }

  if (matchHeaders) {
    const headerMatch = matchesHeaderPattern(response.headers, matchHeaders);
    results.push({ type: 'header', ...headerMatch });
  }

  if (results.length === 0) {
    return { shouldRetry: false, reason: 'no patterns configured' };
  }

  const matchedResults = results.filter(r => r.matches);

  if (matchAny) {
    if (matchedResults.length > 0) {
      return { shouldRetry: true, reason: 'matched pattern (any)', matches: matchedResults };
    }
  } else {
    if (results.every(r => r.matches)) {
      return { shouldRetry: true, reason: 'matched all patterns', matches: matchedResults };
    }
  }

  return { shouldRetry: false, reason: 'patterns not matched', results };
}

export function createPatternRetryWrapper(options) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    maxRetryDelay = 30000,
    retryStrategy = BACKOFF_STRATEGIES.EXPONENTIAL,
    matchBody,
    matchHeaders,
    matchStatus,
    matchAny = false,
    excludeBody,
    excludeHeaders,
    excludeStatus,
    shouldRetry: customShouldRetry,
    onRetry,
    onPatternMatch
  } = options;

  const patternOptions = {
    matchBody,
    matchHeaders,
    matchStatus,
    matchAny,
    excludeBody,
    excludeHeaders,
    excludeStatus
  };

  return async function patternRetryWrapper(operation, context = {}) {
    const errors = [];
    let lastError;
    let lastResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (context[METADATA]) {
          context[METADATA].retryCount = attempt;
        }
        context[RETRY_COUNT] = attempt;

        const response = await operation(context);
        lastResponse = response;

        if (attempt < maxRetries) {
          const patternResult = await shouldRetryOnPattern(response, patternOptions);

          if (patternResult.shouldRetry) {
            if (onPatternMatch) {
              onPatternMatch({
                response,
                attempt,
                result: patternResult,
                context
              });
            }

            const delay = calculateRetryDelay(attempt, {
              strategy: retryStrategy,
              retryDelay,
              maxRetryDelay
            });

            if (onRetry) {
              await onRetry({
                response,
                attempt,
                delay,
                context,
                reason: patternResult.reason,
                willRetry: true
              });
            }

            await sleep(delay);
            continue;
          }
        }

        return response;

      } catch (error) {
        lastError = error;
        errors.push(error);

        if (isAbortError(error)) {
          throw error;
        }

        const canRetry = attempt < maxRetries &&
          (customShouldRetry ? customShouldRetry(error) : isRetryableErrorForPattern(error));

        if (!canRetry) {
          break;
        }

        const delay = calculateRetryDelay(attempt, {
          strategy: retryStrategy,
          retryDelay,
          maxRetryDelay
        });

        if (onRetry) {
          await onRetry({ error, attempt, delay, context, willRetry: true });
        }

        await sleep(delay);
      }
    }

    if (lastError) {
      if (maxRetries > 0 && errors.length > maxRetries) {
        throw new RetryError(
          `All ${maxRetries} retry attempts failed`,
          { attempts: errors.length, errors, url: context.url, method: context.method },
          lastError
        );
      }
      throw lastError;
    }

    return lastResponse;
  };
}

function isRetryableErrorForPattern(error) {
  if (error.status && RETRYABLE_STATUS_CODES.has(error.status)) {
    return true;
  }

  const retryableSystemCodes = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
    'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'
  ]);

  if (error.code && retryableSystemCodes.has(error.code)) {
    return true;
  }

  return false;
}

export function parsePatternRetryConfig(config) {
  if (!config) return null;

  const {
    maxRetries = 3,
    retryDelay = 1000,
    maxRetryDelay = 30000,
    retryStrategy = 'exponential',
    matchBody,
    matchHeaders,
    matchStatus,
    matchAny = false,
    excludeBody,
    excludeHeaders,
    excludeStatus,
    onRetry,
    onPatternMatch
  } = config;

  return {
    maxRetries,
    retryDelay,
    maxRetryDelay,
    retryStrategy,
    matchBody: normalizePattern(matchBody),
    matchHeaders: normalizeHeaderPatterns(matchHeaders),
    matchStatus: normalizeStatusPattern(matchStatus),
    matchAny,
    excludeBody: normalizePattern(excludeBody),
    excludeHeaders: normalizeHeaderPatterns(excludeHeaders),
    excludeStatus: normalizeStatusPattern(excludeStatus),
    onRetry,
    onPatternMatch
  };
}

function normalizePattern(pattern) {
  if (!pattern) return undefined;
  if (Array.isArray(pattern)) return pattern;
  return [pattern];
}

function normalizeHeaderPatterns(patterns) {
  if (!patterns) return undefined;
  return patterns;
}

function normalizeStatusPattern(pattern) {
  if (!pattern) return undefined;
  return pattern;
}

export function createCommonPatternMatchers() {
  return {
    temporarilyUnavailable: /temporarily unavailable/i,
    rateLimited: /rate limit|too many requests|throttle/i,
    maintenance: /maintenance|down for maintenance|under maintenance/i,
    overloaded: /overloaded|capacity|try again later/i,
    serviceUnavailable: /service unavailable|503|temporarily down/i,
    timeout: /timeout|timed out|request timeout/i,
    internalError: /internal (server )?error|unexpected error/i,
    badGateway: /bad gateway|502/i,
    gatewayTimeout: /gateway timeout|504/i,
    connectionError: /connection (refused|reset|error)/i,
    retryLater: /retry|try again|come back later/i
  };
}

export function createApiSpecificPatterns(apiName) {
  const patterns = {
    discord: {
      matchBody: [/rate limit|You are being rate limited/i],
      matchHeaders: { 'x-ratelimit-remaining': '0' },
      matchStatus: [429, 500, 502, 503, 504]
    },
    twitter: {
      matchBody: [/rate limit|Over capacity/i],
      matchHeaders: { 'x-rate-limit-remaining': '0' },
      matchStatus: [429, 500, 502, 503, 504]
    },
    shopify: {
      matchBody: [/throttled|exceeded.*limit/i],
      matchHeaders: { 'retry-after': /.+/ },
      matchStatus: [429, 500, 502, 503, 504]
    },
    github: {
      matchBody: [/rate limit|API rate limit exceeded/i],
      matchHeaders: { 'x-ratelimit-remaining': '0' },
      matchStatus: [403, 429, 500, 502, 503, 504]
    },
    stripe: {
      matchBody: [/rate_limit|too_many_requests/i],
      matchStatus: [429, 500, 502, 503, 504]
    }
  };

  return patterns[apiName.toLowerCase()] || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
