import { StealthIOError } from '../core/errors.js';

export class RateLimitError extends StealthIOError {
  constructor(message, context = {}) {
    super(message, 'RATE_LIMIT_EXCEEDED', context);
    this.name = 'RateLimitError';
    this.retryAfter = context.retryAfter || null;
    this.queueSize = context.queueSize || 0;
  }
}

class TokenBucket {
  constructor(maxTokens, refillRate, refillInterval) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.refillRate;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  tryConsume(count = 1) {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  getWaitTime(count = 1) {
    this.refill();
    if (this.tokens >= count) {
      return 0;
    }
    const tokensNeeded = count - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    return intervalsNeeded * this.refillInterval;
  }

  getAvailableTokens() {
    this.refill();
    return this.tokens;
  }
}

class SlidingWindowCounter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  cleanOldRequests() {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }

  tryConsume() {
    this.cleanOldRequests();
    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return true;
    }
    return false;
  }

  getWaitTime() {
    this.cleanOldRequests();
    if (this.requests.length < this.maxRequests) {
      return 0;
    }
    const oldestRequest = this.requests[0];
    return oldestRequest + this.windowMs - Date.now();
  }

  getRemainingRequests() {
    this.cleanOldRequests();
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

export class RateLimiter {
  constructor(options = {}) {
    const {
      maxRequests = 50,
      perMs = 1000,
      queue = false,
      maxQueueSize = 100,
      queueTimeout = 60000,
      algorithm = 'sliding-window',
      burstLimit = null,
      onThrottle = null,
      onDequeue = null
    } = options;

    this.maxRequests = maxRequests;
    this.perMs = perMs;
    this.queueEnabled = queue;
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.algorithm = algorithm;
    this.onThrottle = onThrottle;
    this.onDequeue = onDequeue;

    if (algorithm === 'token-bucket') {
      this.bucket = new TokenBucket(
        burstLimit || maxRequests,
        maxRequests,
        perMs
      );
    } else {
      this.counter = new SlidingWindowCounter(maxRequests, perMs);
    }

    this.queue = [];
    this.processing = false;
  }

  async acquire() {
    const canProceed = this.algorithm === 'token-bucket'
      ? this.bucket.tryConsume()
      : this.counter.tryConsume();

    if (canProceed) {
      return true;
    }

    if (!this.queueEnabled) {
      const waitTime = this.getWaitTime();
      if (this.onThrottle) {
        this.onThrottle({ waitTime, queueSize: this.queue.length });
      }
      throw new RateLimitError('Rate limit exceeded', {
        retryAfter: waitTime,
        queueSize: this.queue.length
      });
    }

    return this._enqueue();
  }

  async _enqueue() {
    if (this.queue.length >= this.maxQueueSize) {
      throw new RateLimitError('Rate limit queue is full', {
        queueSize: this.queue.length
      });
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new RateLimitError('Rate limit queue timeout', {
          queueSize: this.queue.length
        }));
      }, this.queueTimeout);

      this.queue.push({
        resolve,
        reject,
        timeoutId,
        enqueuedAt: Date.now()
      });

      if (this.onThrottle) {
        this.onThrottle({
          waitTime: this.getWaitTime(),
          queueSize: this.queue.length,
          queued: true
        });
      }

      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const waitTime = this.getWaitTime();
      if (waitTime > 0) {
        await sleep(waitTime);
      }

      const canProceed = this.algorithm === 'token-bucket'
        ? this.bucket.tryConsume()
        : this.counter.tryConsume();

      if (canProceed && this.queue.length > 0) {
        const item = this.queue.shift();
        clearTimeout(item.timeoutId);
        if (this.onDequeue) {
          this.onDequeue({
            waitedMs: Date.now() - item.enqueuedAt,
            remainingQueue: this.queue.length
          });
        }
        item.resolve(true);
      }
    }

    this.processing = false;
  }

  getWaitTime() {
    return this.algorithm === 'token-bucket'
      ? this.bucket.getWaitTime()
      : this.counter.getWaitTime();
  }

  getRemainingRequests() {
    return this.algorithm === 'token-bucket'
      ? Math.floor(this.bucket.getAvailableTokens())
      : this.counter.getRemainingRequests();
  }

  getQueueSize() {
    return this.queue.length;
  }

  clearQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      clearTimeout(item.timeoutId);
      item.reject(new RateLimitError('Queue cleared'));
    }
  }

  reset() {
    this.clearQueue();
    if (this.algorithm === 'token-bucket') {
      this.bucket = new TokenBucket(
        this.bucket.maxTokens,
        this.maxRequests,
        this.perMs
      );
    } else {
      this.counter = new SlidingWindowCounter(this.maxRequests, this.perMs);
    }
  }
}

export function createRateLimiter(options) {
  return new RateLimiter(options);
}

export function createRateLimitedWrapper(rateLimiter) {
  return async function rateLimitedWrapper(operation) {
    await rateLimiter.acquire();
    return operation();
  };
}

export function parseRateLimitConfig(config) {
  if (!config) return null;

  if (typeof config === 'number') {
    return { maxRequests: config, perMs: 1000, queue: false };
  }

  const {
    maxRequests = 50,
    perMs = 1000,
    perSecond,
    perMinute,
    perHour,
    queue = false,
    maxQueueSize = 100,
    queueTimeout = 60000,
    algorithm = 'sliding-window',
    burstLimit = null
  } = config;

  let effectivePerMs = perMs;
  let effectiveMaxRequests = maxRequests;

  if (perSecond !== undefined) {
    effectiveMaxRequests = perSecond;
    effectivePerMs = 1000;
  } else if (perMinute !== undefined) {
    effectiveMaxRequests = perMinute;
    effectivePerMs = 60000;
  } else if (perHour !== undefined) {
    effectiveMaxRequests = perHour;
    effectivePerMs = 3600000;
  }

  return {
    maxRequests: effectiveMaxRequests,
    perMs: effectivePerMs,
    queue,
    maxQueueSize,
    queueTimeout,
    algorithm,
    burstLimit
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
