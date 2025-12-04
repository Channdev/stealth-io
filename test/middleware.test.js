import {
  MiddlewarePipeline,
  compose,
  createPipeline,
  createLoggingMiddleware,
  createDefaultHeadersMiddleware,
  createAuthMiddleware,
  createTimingMiddleware,
  createCacheMiddleware,
  createErrorHandlerMiddleware,
  createConditionalMiddleware
} from '../src/middleware/index.js';
import { Headers } from '../src/utils/headers.js';
import { METADATA } from '../src/core/symbols.js';

describe('MiddlewarePipeline', () => {
  describe('use', () => {
    test('adds object middleware', () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use({ name: 'test', onRequest: () => {} });
      expect(pipeline.length).toBe(1);
      expect(pipeline.getNames()).toContain('test');
    });

    test('adds function middleware', () => {
      const pipeline = new MiddlewarePipeline();
      const fn = function testMiddleware() {};
      pipeline.use(fn);
      expect(pipeline.length).toBe(1);
    });

    test('throws for invalid middleware', () => {
      const pipeline = new MiddlewarePipeline();
      expect(() => pipeline.use({})).toThrow();
      expect(() => pipeline.use(null)).toThrow();
    });

    test('supports chaining', () => {
      const pipeline = new MiddlewarePipeline();
      const result = pipeline
        .use({ name: 'a', onRequest: () => {} })
        .use({ name: 'b', onRequest: () => {} });
      expect(result).toBe(pipeline);
      expect(pipeline.length).toBe(2);
    });
  });

  describe('remove', () => {
    test('removes middleware by name', () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use({ name: 'test', onRequest: () => {} });
      expect(pipeline.remove('test')).toBe(true);
      expect(pipeline.length).toBe(0);
    });

    test('returns false for non-existent middleware', () => {
      const pipeline = new MiddlewarePipeline();
      expect(pipeline.remove('nonexistent')).toBe(false);
    });
  });

  describe('executeRequest', () => {
    test('executes onRequest handlers in order', async () => {
      const order = [];
      const pipeline = new MiddlewarePipeline();
      pipeline.use({ name: 'a', onRequest: () => { order.push('a'); } });
      pipeline.use({ name: 'b', onRequest: () => { order.push('b'); } });

      await pipeline.executeRequest({});
      expect(order).toEqual(['a', 'b']);
    });

    test('allows modifying context', async () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use({
        name: 'modifier',
        onRequest: (ctx) => ({ ...ctx, modified: true })
      });

      const result = await pipeline.executeRequest({ original: true });
      expect(result.modified).toBe(true);
    });
  });

  describe('executeResponse', () => {
    test('executes onResponse handlers in reverse order', async () => {
      const order = [];
      const pipeline = new MiddlewarePipeline();
      pipeline.use({ name: 'a', onResponse: () => { order.push('a'); } });
      pipeline.use({ name: 'b', onResponse: () => { order.push('b'); } });

      await pipeline.executeResponse({}, {});
      expect(order).toEqual(['b', 'a']);
    });
  });

  describe('executeError', () => {
    test('executes onError handlers', async () => {
      let errorHandled = false;
      const pipeline = new MiddlewarePipeline();
      pipeline.use({
        name: 'errorHandler',
        onError: () => { errorHandled = true; return null; }
      });

      await pipeline.executeError(new Error('test'), {});
      expect(errorHandled).toBe(true);
    });

    test('returns recovery response when provided', async () => {
      const recovery = { recovered: true };
      const pipeline = new MiddlewarePipeline();
      pipeline.use({
        name: 'errorHandler',
        onError: () => recovery
      });

      const result = await pipeline.executeError(new Error('test'), {});
      expect(result).toBe(recovery);
    });
  });

  describe('clone', () => {
    test('creates independent copy', () => {
      const pipeline = new MiddlewarePipeline();
      pipeline.use({ name: 'test', onRequest: () => {} });

      const clone = pipeline.clone();
      clone.use({ name: 'another', onRequest: () => {} });

      expect(pipeline.length).toBe(1);
      expect(clone.length).toBe(2);
    });
  });
});

describe('compose', () => {
  test('composes middleware functions', async () => {
    const order = [];
    const middleware = [
      async (ctx, next) => { order.push('a-before'); await next(); order.push('a-after'); },
      async (ctx, next) => { order.push('b-before'); await next(); order.push('b-after'); }
    ];

    const composed = compose(middleware);
    await composed({}, () => { order.push('core'); });

    expect(order).toEqual(['a-before', 'b-before', 'core', 'b-after', 'a-after']);
  });

  test('throws for non-array input', () => {
    expect(() => compose('not an array')).toThrow(TypeError);
  });

  test('throws for non-function middleware', () => {
    expect(() => compose([() => {}, 'not a function'])).toThrow(TypeError);
  });
});

describe('createLoggingMiddleware', () => {
  test('logs requests and responses', async () => {
    const logs = [];
    const middleware = createLoggingMiddleware({
      logger: (msg) => logs.push(msg)
    });

    const ctx = { method: 'GET', url: 'https://example.com', [METADATA]: {} };
    await middleware.onRequest(ctx);
    await middleware.onResponse({ status: 200 }, ctx);

    expect(logs.length).toBe(2);
    expect(logs[0]).toContain('REQUEST');
    expect(logs[1]).toContain('RESPONSE');
  });
});

describe('createDefaultHeadersMiddleware', () => {
  test('adds default headers', async () => {
    const middleware = createDefaultHeadersMiddleware({ 'X-Custom': 'value' });
    const ctx = { headers: new Headers() };

    await middleware.onRequest(ctx);
    expect(ctx.headers.get('x-custom')).toBe('value');
  });

  test('does not override existing headers by default', async () => {
    const middleware = createDefaultHeadersMiddleware({ 'X-Custom': 'new' });
    const ctx = { headers: new Headers({ 'X-Custom': 'existing' }) };

    await middleware.onRequest(ctx);
    expect(ctx.headers.get('x-custom')).toBe('existing');
  });

  test('overrides when specified', async () => {
    const middleware = createDefaultHeadersMiddleware({ 'X-Custom': 'new' }, true);
    const ctx = { headers: new Headers({ 'X-Custom': 'existing' }) };

    await middleware.onRequest(ctx);
    expect(ctx.headers.get('x-custom')).toBe('new');
  });
});

describe('createAuthMiddleware', () => {
  test('adds bearer token', async () => {
    const middleware = createAuthMiddleware({ type: 'bearer', token: 'secret' });
    const ctx = { headers: new Headers() };

    await middleware.onRequest(ctx);
    expect(ctx.headers.get('authorization')).toBe('Bearer secret');
  });

  test('adds basic auth', async () => {
    const middleware = createAuthMiddleware({ type: 'basic', username: 'user', password: 'pass' });
    const ctx = { headers: new Headers() };

    await middleware.onRequest(ctx);
    const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
    expect(ctx.headers.get('authorization')).toBe(expected);
  });

  test('supports async token function', async () => {
    const middleware = createAuthMiddleware({
      type: 'bearer',
      token: async () => 'async-token'
    });
    const ctx = { headers: new Headers() };

    await middleware.onRequest(ctx);
    expect(ctx.headers.get('authorization')).toBe('Bearer async-token');
  });
});

describe('createCacheMiddleware', () => {
  test('caches GET responses', async () => {
    const cache = new Map();
    const middleware = createCacheMiddleware({ cache, ttl: 60000 });

    const ctx = { method: 'GET', url: 'https://example.com' };
    await middleware.onRequest(ctx);

    const mockResponse = { ok: true, status: 200, clone: () => ({ ...mockResponse }) };
    await middleware.onResponse(mockResponse, ctx);

    expect(cache.size).toBe(1);
  });

  test('returns cached response', async () => {
    const cache = new Map();
    const cachedResponse = { cached: true };
    cache.set('GET:https://example.com', {
      response: cachedResponse,
      expires: Date.now() + 60000
    });

    const middleware = createCacheMiddleware({ cache });
    const ctx = { method: 'GET', url: 'https://example.com' };

    await middleware.onRequest(ctx);
    const result = await middleware.onResponse({}, ctx);

    expect(result).toBe(cachedResponse);
  });

  test('does not cache non-GET requests', async () => {
    const cache = new Map();
    const middleware = createCacheMiddleware({ cache });

    const ctx = { method: 'POST', url: 'https://example.com' };
    await middleware.onRequest(ctx);

    expect(ctx._cacheKey).toBeUndefined();
  });
});

describe('createConditionalMiddleware', () => {
  test('applies middleware when condition is true', async () => {
    let applied = false;
    const inner = { name: 'inner', onRequest: () => { applied = true; } };
    const middleware = createConditionalMiddleware(() => true, inner);

    await middleware.onRequest({});
    expect(applied).toBe(true);
  });

  test('skips middleware when condition is false', async () => {
    let applied = false;
    const inner = { name: 'inner', onRequest: () => { applied = true; } };
    const middleware = createConditionalMiddleware(() => false, inner);

    await middleware.onRequest({});
    expect(applied).toBe(false);
  });
});
