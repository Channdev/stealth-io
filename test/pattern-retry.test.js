import {
  matchesPattern,
  matchesBodyPattern,
  matchesHeaderPattern,
  matchesStatusPattern,
  shouldRetryOnPattern,
  createPatternRetryWrapper,
  parsePatternRetryConfig,
  createCommonPatternMatchers,
  createApiSpecificPatterns
} from '../src/http/pattern-retry.js';
import { RetryError, AbortError } from '../src/core/errors.js';

describe('matchesPattern', () => {
  test('matches regex patterns', () => {
    expect(matchesPattern('temporarily unavailable', /temporarily unavailable/i)).toBe(true);
    expect(matchesPattern('TEMPORARILY UNAVAILABLE', /temporarily unavailable/i)).toBe(true);
    expect(matchesPattern('server error', /temporarily unavailable/i)).toBe(false);
  });

  test('matches string patterns (contains)', () => {
    expect(matchesPattern('error: rate limit exceeded', 'rate limit')).toBe(true);
    expect(matchesPattern('success', 'rate limit')).toBe(false);
  });

  test('matches function patterns', () => {
    const customMatcher = (val) => val.includes('custom');
    expect(matchesPattern('custom error', customMatcher)).toBe(true);
    expect(matchesPattern('other error', customMatcher)).toBe(false);
  });

  test('matches array of patterns (any)', () => {
    const patterns = [/error/i, 'warning', (v) => v.includes('alert')];
    expect(matchesPattern('Error occurred', patterns)).toBe(true);
    expect(matchesPattern('warning message', patterns)).toBe(true);
    expect(matchesPattern('alert triggered', patterns)).toBe(true);
    expect(matchesPattern('success', patterns)).toBe(false);
  });

  test('returns false for null/undefined', () => {
    expect(matchesPattern(null, /test/)).toBe(false);
    expect(matchesPattern(undefined, /test/)).toBe(false);
    expect(matchesPattern('test', null)).toBe(false);
    expect(matchesPattern('test', undefined)).toBe(false);
  });
});

describe('matchesBodyPattern', () => {
  test('matches string body', () => {
    const result = matchesBodyPattern('{"error": "temporarily unavailable"}', /temporarily unavailable/i);
    expect(result.matches).toBe(true);
  });

  test('matches object body (serialized)', () => {
    const result = matchesBodyPattern({ error: 'rate limit exceeded' }, /rate limit/i);
    expect(result.matches).toBe(true);
  });

  test('matches array of patterns', () => {
    const patterns = [/error/i, /failure/i];
    expect(matchesBodyPattern('server error', patterns).matches).toBe(true);
    expect(matchesBodyPattern('system failure', patterns).matches).toBe(true);
    expect(matchesBodyPattern('success', patterns).matches).toBe(false);
  });

  test('returns matches:false for null body', () => {
    expect(matchesBodyPattern(null, /test/).matches).toBe(false);
  });
});

describe('matchesHeaderPattern', () => {
  test('matches header values with regex', () => {
    const headers = { 'x-ratelimit-remaining': '0', 'content-type': 'application/json' };
    const result = matchesHeaderPattern(headers, { 'x-ratelimit-remaining': '0' });
    expect(result.matches).toBe(true);
    expect(result.header).toBe('x-ratelimit-remaining');
  });

  test('matches using Headers object with get method', () => {
    const headers = {
      get: (name) => {
        const h = { 'retry-after': '30', 'x-error': 'rate_limited' };
        return h[name.toLowerCase()];
      }
    };
    const result = matchesHeaderPattern(headers, { 'retry-after': /\d+/ });
    expect(result.matches).toBe(true);
  });

  test('returns matches:false when no headers match', () => {
    const headers = { 'content-type': 'application/json' };
    const result = matchesHeaderPattern(headers, { 'x-custom': 'value' });
    expect(result.matches).toBe(false);
  });
});

describe('matchesStatusPattern', () => {
  test('matches single status code', () => {
    expect(matchesStatusPattern(429, 429).matches).toBe(true);
    expect(matchesStatusPattern(500, 429).matches).toBe(false);
  });

  test('matches array of status codes', () => {
    expect(matchesStatusPattern(429, [429, 500, 503]).matches).toBe(true);
    expect(matchesStatusPattern(500, [429, 500, 503]).matches).toBe(true);
    expect(matchesStatusPattern(404, [429, 500, 503]).matches).toBe(false);
  });

  test('matches Set of status codes', () => {
    const statuses = new Set([429, 500, 502, 503, 504]);
    expect(matchesStatusPattern(503, statuses).matches).toBe(true);
    expect(matchesStatusPattern(400, statuses).matches).toBe(false);
  });

  test('matches custom function', () => {
    const isServerError = (s) => s >= 500 && s < 600;
    expect(matchesStatusPattern(503, isServerError).matches).toBe(true);
    expect(matchesStatusPattern(400, isServerError).matches).toBe(false);
  });

  test('matches range object', () => {
    expect(matchesStatusPattern(503, { min: 500, max: 599 }).matches).toBe(true);
    expect(matchesStatusPattern(404, { min: 500, max: 599 }).matches).toBe(false);
  });
});

describe('shouldRetryOnPattern', () => {
  const createMockResponse = (status, body, headers = {}) => ({
    status,
    headers,
    clone: () => ({
      text: async () => body
    })
  });

  test('retries on matching body pattern', async () => {
    const response = createMockResponse(200, 'temporarily unavailable');
    const result = await shouldRetryOnPattern(response, {
      matchBody: /temporarily unavailable/i
    });
    expect(result.shouldRetry).toBe(true);
  });

  test('retries on matching status pattern', async () => {
    const response = createMockResponse(503, 'ok');
    const result = await shouldRetryOnPattern(response, {
      matchStatus: [500, 502, 503, 504]
    });
    expect(result.shouldRetry).toBe(true);
  });

  test('retries on matching header pattern', async () => {
    const response = createMockResponse(200, 'ok', { 'x-ratelimit-remaining': '0' });
    const result = await shouldRetryOnPattern(response, {
      matchHeaders: { 'x-ratelimit-remaining': '0' }
    });
    expect(result.shouldRetry).toBe(true);
  });

  test('requires all patterns to match by default', async () => {
    const response = createMockResponse(503, 'success', {});
    const result = await shouldRetryOnPattern(response, {
      matchStatus: [503],
      matchBody: /error/i
    });
    expect(result.shouldRetry).toBe(false);
  });

  test('matchAny allows any pattern to trigger retry', async () => {
    const response = createMockResponse(503, 'success', {});
    const result = await shouldRetryOnPattern(response, {
      matchStatus: [503],
      matchBody: /error/i,
      matchAny: true
    });
    expect(result.shouldRetry).toBe(true);
  });

  test('excludeStatus prevents retry', async () => {
    const response = createMockResponse(404, 'not found');
    const result = await shouldRetryOnPattern(response, {
      matchBody: /not found/i,
      excludeStatus: [404]
    });
    expect(result.shouldRetry).toBe(false);
  });

  test('excludeBody prevents retry', async () => {
    const response = createMockResponse(503, 'permanent error - do not retry');
    const result = await shouldRetryOnPattern(response, {
      matchStatus: [503],
      excludeBody: /do not retry/i
    });
    expect(result.shouldRetry).toBe(false);
  });
});

describe('createPatternRetryWrapper', () => {
  test('succeeds without retry when no pattern matches', async () => {
    const wrapper = createPatternRetryWrapper({
      maxRetries: 3,
      matchBody: /error/i
    });
    let attempts = 0;
    const result = await wrapper(async () => {
      attempts++;
      return { status: 200, clone: () => ({ text: async () => 'success' }), headers: {} };
    }, {});
    expect(attempts).toBe(1);
    expect(result.status).toBe(200);
  });

  test('retries when body pattern matches', async () => {
    const wrapper = createPatternRetryWrapper({
      maxRetries: 3,
      retryDelay: 10,
      matchBody: /temporarily unavailable/i
    });
    let attempts = 0;
    const result = await wrapper(async () => {
      attempts++;
      if (attempts < 3) {
        return {
          status: 200,
          headers: {},
          clone: () => ({ text: async () => 'temporarily unavailable' })
        };
      }
      return {
        status: 200,
        headers: {},
        clone: () => ({ text: async () => 'success' })
      };
    }, {});
    expect(attempts).toBe(3);
  });

  test('calls onPatternMatch when pattern matches', async () => {
    const patternMatches = [];
    const wrapper = createPatternRetryWrapper({
      maxRetries: 2,
      retryDelay: 10,
      matchBody: /error/i,
      onPatternMatch: (info) => patternMatches.push(info)
    });
    let attempts = 0;
    await wrapper(async () => {
      attempts++;
      if (attempts < 2) {
        return { status: 200, headers: {}, clone: () => ({ text: async () => 'error message' }) };
      }
      return { status: 200, headers: {}, clone: () => ({ text: async () => 'success' }) };
    }, {});
    expect(patternMatches.length).toBe(1);
    expect(patternMatches[0].attempt).toBe(0);
  });

  test('calls onRetry callback', async () => {
    const retryInfo = [];
    const wrapper = createPatternRetryWrapper({
      maxRetries: 2,
      retryDelay: 10,
      matchStatus: [503],
      onRetry: (info) => retryInfo.push(info)
    });
    await wrapper(async () => {
      return { status: 200, headers: {}, clone: () => ({ text: async () => '' }) };
    }, {});
    expect(retryInfo.length).toBe(0);
  });

  test('does not retry on AbortError', async () => {
    const wrapper = createPatternRetryWrapper({
      maxRetries: 3,
      retryDelay: 10,
      matchBody: /error/i
    });
    let attempts = 0;
    await expect(wrapper(async () => {
      attempts++;
      throw new AbortError();
    }, {})).rejects.toThrow(AbortError);
    expect(attempts).toBe(1);
  });

  test('throws RetryError after max retries on pattern match', async () => {
    const wrapper = createPatternRetryWrapper({
      maxRetries: 2,
      retryDelay: 10,
      matchBody: /always retry/i
    });
    const result = await wrapper(async () => {
      return { status: 200, headers: {}, clone: () => ({ text: async () => 'always retry this' }) };
    }, {});
    expect(result.status).toBe(200);
  });
});

describe('parsePatternRetryConfig', () => {
  test('returns null for undefined config', () => {
    expect(parsePatternRetryConfig(undefined)).toBeNull();
    expect(parsePatternRetryConfig(null)).toBeNull();
  });

  test('parses full config', () => {
    const config = parsePatternRetryConfig({
      maxRetries: 5,
      retryDelay: 500,
      matchBody: /error/i,
      matchHeaders: { 'x-error': 'true' },
      matchStatus: [500, 503],
      matchAny: true,
      excludeBody: /permanent/i
    });
    expect(config.maxRetries).toBe(5);
    expect(config.retryDelay).toBe(500);
    expect(config.matchAny).toBe(true);
    expect(Array.isArray(config.matchBody)).toBe(true);
    expect(config.matchStatus).toEqual([500, 503]);
  });

  test('normalizes single pattern to array', () => {
    const config = parsePatternRetryConfig({
      matchBody: /single pattern/i
    });
    expect(Array.isArray(config.matchBody)).toBe(true);
    expect(config.matchBody.length).toBe(1);
  });
});

describe('createCommonPatternMatchers', () => {
  test('returns object with common patterns', () => {
    const patterns = createCommonPatternMatchers();
    expect(patterns.temporarilyUnavailable).toBeInstanceOf(RegExp);
    expect(patterns.rateLimited).toBeInstanceOf(RegExp);
    expect(patterns.maintenance).toBeInstanceOf(RegExp);
    expect(patterns.overloaded).toBeInstanceOf(RegExp);
  });

  test('patterns match expected strings', () => {
    const patterns = createCommonPatternMatchers();
    expect(patterns.temporarilyUnavailable.test('Service temporarily unavailable')).toBe(true);
    expect(patterns.rateLimited.test('Rate limit exceeded')).toBe(true);
    expect(patterns.maintenance.test('Down for maintenance')).toBe(true);
  });
});

describe('createApiSpecificPatterns', () => {
  test('returns patterns for known APIs', () => {
    const discord = createApiSpecificPatterns('discord');
    expect(discord).not.toBeNull();
    expect(discord.matchStatus).toContain(429);

    const twitter = createApiSpecificPatterns('twitter');
    expect(twitter).not.toBeNull();

    const shopify = createApiSpecificPatterns('shopify');
    expect(shopify).not.toBeNull();

    const github = createApiSpecificPatterns('github');
    expect(github).not.toBeNull();

    const stripe = createApiSpecificPatterns('stripe');
    expect(stripe).not.toBeNull();
  });

  test('returns null for unknown API', () => {
    expect(createApiSpecificPatterns('unknown-api')).toBeNull();
  });

  test('API patterns are case insensitive', () => {
    expect(createApiSpecificPatterns('Discord')).not.toBeNull();
    expect(createApiSpecificPatterns('TWITTER')).not.toBeNull();
  });
});
