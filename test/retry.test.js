import {
  calculateRetryDelay,
  isRetryableError,
  isRetryableStatus,
  createRetryWrapper,
  getRetryAfter,
  createRetryPolicy
} from '../src/http/retry.js';
import { NetworkError, TimeoutError, RetryError, AbortError } from '../src/core/errors.js';
import { BACKOFF_STRATEGIES } from '../src/core/constants.js';

describe('calculateRetryDelay', () => {
  test('fixed strategy returns constant delay', () => {
    const options = { strategy: BACKOFF_STRATEGIES.FIXED, retryDelay: 1000, maxRetryDelay: 30000 };
    expect(calculateRetryDelay(0, options)).toBe(1000);
    expect(calculateRetryDelay(1, options)).toBe(1000);
    expect(calculateRetryDelay(5, options)).toBe(1000);
  });

  test('exponential strategy doubles delay', () => {
    const options = { strategy: BACKOFF_STRATEGIES.EXPONENTIAL, retryDelay: 1000, maxRetryDelay: 30000 };
    expect(calculateRetryDelay(0, options)).toBe(1000);
    expect(calculateRetryDelay(1, options)).toBe(2000);
    expect(calculateRetryDelay(2, options)).toBe(4000);
    expect(calculateRetryDelay(3, options)).toBe(8000);
  });

  test('respects maxRetryDelay', () => {
    const options = { strategy: BACKOFF_STRATEGIES.EXPONENTIAL, retryDelay: 1000, maxRetryDelay: 5000 };
    expect(calculateRetryDelay(10, options)).toBe(5000);
  });

  test('exponential_jitter adds randomness', () => {
    const options = { strategy: BACKOFF_STRATEGIES.EXPONENTIAL_JITTER, retryDelay: 1000, maxRetryDelay: 30000 };
    const delays = new Set();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateRetryDelay(1, options));
    }
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe('isRetryableError', () => {
  test('returns true for NetworkError', () => {
    const error = new NetworkError('Connection failed');
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns true for TimeoutError', () => {
    const error = new TimeoutError('Timed out');
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns false for AbortError', () => {
    const error = new AbortError();
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns true for retryable status codes', () => {
    const error = new Error('Server error');
    error.status = 503;
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns false for non-retryable status codes', () => {
    const error = new Error('Not found');
    error.status = 404;
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns true for retryable system codes', () => {
    const error = new Error('Connection reset');
    error.code = 'ECONNRESET';
    expect(isRetryableError(error)).toBe(true);
  });

  test('uses custom shouldRetry function', () => {
    const error = new Error('Custom error');
    expect(isRetryableError(error, { shouldRetry: () => true })).toBe(true);
    expect(isRetryableError(error, { shouldRetry: () => false })).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  test('returns true for retryable status codes', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
  });

  test('returns false for non-retryable status codes', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('createRetryWrapper', () => {
  test('succeeds without retry on first attempt', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 3 });
    let attempts = 0;
    const result = await wrapper(async () => {
      attempts++;
      return 'success';
    }, {});
    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  test('retries on failure', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 3, retryDelay: 10 });
    let attempts = 0;
    const result = await wrapper(async () => {
      attempts++;
      if (attempts < 3) {
        const error = new NetworkError('Failed');
        throw error;
      }
      return 'success';
    }, {});
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  test('throws RetryError after max retries', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 2, retryDelay: 10 });
    let attempts = 0;
    await expect(wrapper(async () => {
      attempts++;
      throw new NetworkError('Always fails');
    }, {})).rejects.toThrow(RetryError);
    expect(attempts).toBe(3);
  });

  test('calls onRetry callback', async () => {
    const retryInfo = [];
    const wrapper = createRetryWrapper({
      maxRetries: 2,
      retryDelay: 10,
      onRetry: (info) => { retryInfo.push(info); }
    });

    let attempts = 0;
    await expect(wrapper(async () => {
      attempts++;
      throw new NetworkError('Fails');
    }, {})).rejects.toThrow();

    expect(retryInfo.length).toBe(2);
    expect(retryInfo[0].attempt).toBe(0);
    expect(retryInfo[1].attempt).toBe(1);
  });

  test('does not retry non-retryable errors', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 3, retryDelay: 10 });
    let attempts = 0;
    await expect(wrapper(async () => {
      attempts++;
      throw new AbortError();
    }, {})).rejects.toThrow(AbortError);
    expect(attempts).toBe(1);
  });
});

describe('getRetryAfter', () => {
  test('parses seconds value', () => {
    const headers = { get: (name) => name === 'retry-after' ? '30' : null };
    expect(getRetryAfter(headers)).toBe(30000);
  });

  test('parses HTTP date', () => {
    const futureDate = new Date(Date.now() + 60000).toUTCString();
    const headers = { get: (name) => name === 'retry-after' ? futureDate : null };
    const delay = getRetryAfter(headers);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(61000);
  });

  test('returns null for missing header', () => {
    const headers = { get: () => null };
    expect(getRetryAfter(headers)).toBeNull();
  });

  test('returns null for past date', () => {
    const pastDate = new Date(Date.now() - 60000).toUTCString();
    const headers = { get: (name) => name === 'retry-after' ? pastDate : null };
    expect(getRetryAfter(headers)).toBeNull();
  });

  test('handles plain object headers', () => {
    const headers = { 'retry-after': '10' };
    expect(getRetryAfter(headers)).toBe(10000);
  });
});

describe('createRetryPolicy', () => {
  test('aggressive policy', () => {
    const policy = createRetryPolicy('aggressive');
    expect(policy.maxRetries).toBe(5);
    expect(policy.retryDelay).toBe(500);
    expect(policy.retryStrategy).toBe(BACKOFF_STRATEGIES.EXPONENTIAL_JITTER);
  });

  test('moderate policy', () => {
    const policy = createRetryPolicy('moderate');
    expect(policy.maxRetries).toBe(3);
    expect(policy.retryDelay).toBe(1000);
  });

  test('conservative policy', () => {
    const policy = createRetryPolicy('conservative');
    expect(policy.maxRetries).toBe(2);
    expect(policy.retryDelay).toBe(2000);
  });

  test('none policy', () => {
    const policy = createRetryPolicy('none');
    expect(policy.maxRetries).toBe(0);
  });

  test('unknown policy returns moderate', () => {
    const policy = createRetryPolicy('unknown');
    expect(policy.maxRetries).toBe(3);
  });
});
