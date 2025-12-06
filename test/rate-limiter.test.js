import {
  RateLimiter,
  RateLimitError,
  createRateLimiter,
  createRateLimitedWrapper,
  parseRateLimitConfig
} from '../src/http/rate-limiter.js';

describe('RateLimiter', () => {
  describe('basic rate limiting', () => {
    test('allows requests within limit', async () => {
      const limiter = new RateLimiter({ maxRequests: 5, perMs: 1000 });
      for (let i = 0; i < 5; i++) {
        await expect(limiter.acquire()).resolves.toBe(true);
      }
    });

    test('throws RateLimitError when limit exceeded without queue', async () => {
      const limiter = new RateLimiter({ maxRequests: 2, perMs: 1000, queue: false });
      await limiter.acquire();
      await limiter.acquire();
      await expect(limiter.acquire()).rejects.toThrow(RateLimitError);
    });

    test('returns correct remaining requests', async () => {
      const limiter = new RateLimiter({ maxRequests: 5, perMs: 1000 });
      expect(limiter.getRemainingRequests()).toBe(5);
      await limiter.acquire();
      expect(limiter.getRemainingRequests()).toBe(4);
      await limiter.acquire();
      expect(limiter.getRemainingRequests()).toBe(3);
    });
  });

  describe('queue functionality', () => {
    test('queues requests when limit exceeded with queue enabled', async () => {
      const limiter = new RateLimiter({ maxRequests: 1, perMs: 50, queue: true });
      await limiter.acquire();
      const startTime = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    test('rejects when queue is full', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 10000,
        queue: true,
        maxQueueSize: 1
      });
      await limiter.acquire();
      limiter.acquire().catch(() => {});
      await expect(limiter.acquire()).rejects.toThrow('queue is full');
    });

    test('timeout rejects queued requests', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 10000,
        queue: true,
        queueTimeout: 50
      });
      await limiter.acquire();
      await expect(limiter.acquire()).rejects.toThrow('timeout');
    });

    test('clearQueue rejects all pending requests', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 10000,
        queue: true
      });
      await limiter.acquire();
      const pendingPromises = [
        limiter.acquire().catch(e => e),
        limiter.acquire().catch(e => e)
      ];
      limiter.clearQueue();
      const results = await Promise.all(pendingPromises);
      expect(results[0]).toBeInstanceOf(RateLimitError);
      expect(results[1]).toBeInstanceOf(RateLimitError);
    });

    test('getQueueSize returns correct value', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 10000,
        queue: true
      });
      await limiter.acquire();
      expect(limiter.getQueueSize()).toBe(0);
      limiter.acquire().catch(() => {});
      await new Promise(r => setTimeout(r, 10));
      expect(limiter.getQueueSize()).toBe(1);
      limiter.clearQueue();
    });
  });

  describe('callbacks', () => {
    test('calls onThrottle when rate limited', async () => {
      const throttleInfo = [];
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 1000,
        queue: false,
        onThrottle: (info) => throttleInfo.push(info)
      });
      await limiter.acquire();
      try {
        await limiter.acquire();
      } catch {}
      expect(throttleInfo.length).toBe(1);
      expect(throttleInfo[0].waitTime).toBeGreaterThan(0);
    });

    test('calls onDequeue when request is dequeued', async () => {
      const dequeueInfo = [];
      const limiter = new RateLimiter({
        maxRequests: 1,
        perMs: 50,
        queue: true,
        onDequeue: (info) => dequeueInfo.push(info)
      });
      await limiter.acquire();
      await limiter.acquire();
      expect(dequeueInfo.length).toBe(1);
      expect(dequeueInfo[0].waitedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('token bucket algorithm', () => {
    test('allows burst requests', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        perMs: 1000,
        algorithm: 'token-bucket',
        burstLimit: 10
      });
      for (let i = 0; i < 10; i++) {
        await expect(limiter.acquire()).resolves.toBe(true);
      }
    });

    test('refills tokens over time', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        perMs: 50,
        algorithm: 'token-bucket'
      });
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }
      expect(limiter.getRemainingRequests()).toBe(0);
      await new Promise(r => setTimeout(r, 60));
      expect(limiter.getRemainingRequests()).toBeGreaterThan(0);
    });
  });

  describe('reset functionality', () => {
    test('reset clears queue and restores capacity', async () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        perMs: 10000,
        queue: true
      });
      await limiter.acquire();
      await limiter.acquire();
      limiter.acquire().catch(() => {});
      await new Promise(r => setTimeout(r, 10));
      expect(limiter.getQueueSize()).toBe(1);
      limiter.reset();
      expect(limiter.getQueueSize()).toBe(0);
      expect(limiter.getRemainingRequests()).toBe(2);
    });
  });
});

describe('createRateLimiter', () => {
  test('creates a RateLimiter instance', () => {
    const limiter = createRateLimiter({ maxRequests: 10 });
    expect(limiter).toBeInstanceOf(RateLimiter);
  });
});

describe('createRateLimitedWrapper', () => {
  test('wraps operation with rate limiting', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, perMs: 1000 });
    const wrapper = createRateLimitedWrapper(limiter);
    const results = [];
    await wrapper(() => results.push(1));
    await wrapper(() => results.push(2));
    expect(results).toEqual([1, 2]);
  });

  test('throws when rate limit exceeded', async () => {
    const limiter = new RateLimiter({ maxRequests: 1, perMs: 1000, queue: false });
    const wrapper = createRateLimitedWrapper(limiter);
    await wrapper(() => 'first');
    await expect(wrapper(() => 'second')).rejects.toThrow(RateLimitError);
  });
});

describe('parseRateLimitConfig', () => {
  test('returns null for undefined config', () => {
    expect(parseRateLimitConfig(undefined)).toBeNull();
    expect(parseRateLimitConfig(null)).toBeNull();
  });

  test('parses number as maxRequests', () => {
    const config = parseRateLimitConfig(100);
    expect(config.maxRequests).toBe(100);
    expect(config.perMs).toBe(1000);
  });

  test('parses perSecond config', () => {
    const config = parseRateLimitConfig({ perSecond: 10 });
    expect(config.maxRequests).toBe(10);
    expect(config.perMs).toBe(1000);
  });

  test('parses perMinute config', () => {
    const config = parseRateLimitConfig({ perMinute: 60 });
    expect(config.maxRequests).toBe(60);
    expect(config.perMs).toBe(60000);
  });

  test('parses perHour config', () => {
    const config = parseRateLimitConfig({ perHour: 1000 });
    expect(config.maxRequests).toBe(1000);
    expect(config.perMs).toBe(3600000);
  });

  test('parses full config object', () => {
    const config = parseRateLimitConfig({
      maxRequests: 50,
      perMs: 2000,
      queue: true,
      maxQueueSize: 200,
      queueTimeout: 30000,
      algorithm: 'token-bucket',
      burstLimit: 100
    });
    expect(config.maxRequests).toBe(50);
    expect(config.perMs).toBe(2000);
    expect(config.queue).toBe(true);
    expect(config.maxQueueSize).toBe(200);
    expect(config.queueTimeout).toBe(30000);
    expect(config.algorithm).toBe('token-bucket');
    expect(config.burstLimit).toBe(100);
  });
});

describe('RateLimitError', () => {
  test('has correct properties', () => {
    const error = new RateLimitError('Rate limited', { retryAfter: 1000, queueSize: 5 });
    expect(error.name).toBe('RateLimitError');
    expect(error.message).toBe('Rate limited');
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.retryAfter).toBe(1000);
    expect(error.queueSize).toBe(5);
  });
});
