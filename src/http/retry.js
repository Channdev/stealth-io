import { BACKOFF_STRATEGIES, RETRYABLE_STATUS_CODES } from '../core/constants.js';
import { RetryError, NetworkError, TimeoutError } from '../core/errors.js';
import { METADATA, RETRY_COUNT } from '../core/symbols.js';
import { isAbortError } from './abort.js';

export function calculateRetryDelay(attempt, options) {
  const {
    strategy = BACKOFF_STRATEGIES.EXPONENTIAL,
    retryDelay = 1000,
    maxRetryDelay = 30000
  } = options;

  let delay;
  switch (strategy) {
    case BACKOFF_STRATEGIES.FIXED:
      delay = retryDelay;
      break;
    case BACKOFF_STRATEGIES.EXPONENTIAL:
      delay = retryDelay * Math.pow(2, attempt);
      break;
    case BACKOFF_STRATEGIES.EXPONENTIAL_JITTER:
      const baseDelay = retryDelay * Math.pow(2, attempt);
      const jitter = baseDelay * 0.25 * Math.random();
      delay = baseDelay + jitter;
      break;
    default:
      delay = retryDelay;
  }

  return Math.min(delay, maxRetryDelay);
}

export function isRetryableError(error, options = {}) {
  if (typeof options.shouldRetry === 'function') {
    return options.shouldRetry(error);
  }

  if (isAbortError(error)) {
    return false;
  }

  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof TimeoutError) {
    return true;
  }

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

export function isRetryableStatus(status, options = {}) {
  const retryableStatuses = options.retryableStatuses || RETRYABLE_STATUS_CODES;
  return retryableStatuses.has(status);
}

export function createRetryWrapper(options) {
  const {
    maxRetries = 0,
    retryDelay = 1000,
    maxRetryDelay = 30000,
    retryStrategy = BACKOFF_STRATEGIES.EXPONENTIAL,
    shouldRetry,
    onRetry
  } = options;

  return async function retryWrapper(operation, context = {}) {
    const errors = [];
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (context[METADATA]) {
          context[METADATA].retryCount = attempt;
        }
        context[RETRY_COUNT] = attempt;
        return await operation(context);
      } catch (error) {
        lastError = error;
        errors.push(error);

        const canRetry = attempt < maxRetries && isRetryableError(error, { shouldRetry });

        if (!canRetry) {
          break;
        }

        const delay = calculateRetryDelay(attempt, { strategy: retryStrategy, retryDelay, maxRetryDelay });

        if (onRetry) {
          try {
            await onRetry({ error, attempt, delay, context, willRetry: true });
          } catch (callbackError) {}
        }

        await sleep(delay);
      }
    }

    if (maxRetries > 0 && errors.length > maxRetries) {
      throw new RetryError(
        `All ${maxRetries} retry attempts failed`,
        { attempts: errors.length, errors, url: context.url, method: context.method },
        lastError
      );
    }

    throw lastError;
  };
}

export function withRetry(requestFn) {
  return async function retryableRequest(config) {
    if (!config.maxRetries || config.maxRetries <= 0) {
      return requestFn(config);
    }

    const retryWrapper = createRetryWrapper({
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      maxRetryDelay: config.maxRetryDelay,
      retryStrategy: config.retryStrategy,
      shouldRetry: config.shouldRetry,
      onRetry: config.onRetry
    });

    return retryWrapper((ctx) => requestFn(ctx), config);
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRetryAfter(headers) {
  const retryAfter = headers.get ? headers.get('retry-after') : headers['retry-after'];
  if (!retryAfter) {
    return null;
  }

  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const delay = date - Date.now();
    return delay > 0 ? delay : null;
  }

  return null;
}

export function createRetryPolicy(preset) {
  const policies = {
    aggressive: {
      maxRetries: 5,
      retryDelay: 500,
      maxRetryDelay: 10000,
      retryStrategy: BACKOFF_STRATEGIES.EXPONENTIAL_JITTER
    },
    moderate: {
      maxRetries: 3,
      retryDelay: 1000,
      maxRetryDelay: 30000,
      retryStrategy: BACKOFF_STRATEGIES.EXPONENTIAL
    },
    conservative: {
      maxRetries: 2,
      retryDelay: 2000,
      maxRetryDelay: 60000,
      retryStrategy: BACKOFF_STRATEGIES.EXPONENTIAL
    },
    none: {
      maxRetries: 0,
      retryDelay: 0,
      maxRetryDelay: 0,
      retryStrategy: BACKOFF_STRATEGIES.FIXED
    }
  };
  return policies[preset] || policies.moderate;
}
