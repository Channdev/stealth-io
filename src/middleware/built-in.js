import { TIMING, METADATA } from '../core/symbols.js';

export function createLoggingMiddleware(options = {}) {
  const {
    logger = console.log,
    logRequest = true,
    logResponse = true,
    logErrors = true,
    formatRequest = (ctx) => `[REQUEST] ${ctx.method} ${ctx.url}`,
    formatResponse = (res, ctx, duration) => `[RESPONSE] ${ctx.method} ${ctx.url} - ${res.status}${duration !== null ? ` (${duration}ms)` : ''}`
  } = options;

  return {
    name: 'logging',
    onRequest(context) {
      if (logRequest) {
        logger(formatRequest(context));
      }
      context[METADATA] = context[METADATA] || {};
      context[METADATA].logStartTime = Date.now();
      return context;
    },
    onResponse(response, context) {
      if (logResponse) {
        const duration = context[METADATA]?.logStartTime ? Date.now() - context[METADATA].logStartTime : null;
        logger(formatResponse(response, context, duration));
      }
      return response;
    },
    onError(error, context) {
      if (logErrors) {
        const duration = context[METADATA]?.logStartTime ? Date.now() - context[METADATA].logStartTime : null;
        logger(`[ERROR] ${context.method} ${context.url} - ${error.message}${duration ? ` (${duration}ms)` : ''}`);
      }
      return null;
    }
  };
}

export function createDefaultHeadersMiddleware(headers, override = false) {
  return {
    name: 'default-headers',
    onRequest(context) {
      for (const [name, value] of Object.entries(headers)) {
        if (override || !context.headers.has(name)) {
          context.headers.set(name, value);
        }
      }
      return context;
    }
  };
}

export function createRequestTransformMiddleware(transformer) {
  return {
    name: 'request-transform',
    async onRequest(context) {
      if (context.body !== null && context.body !== undefined) {
        context.body = await transformer(context.body, context);
      }
      return context;
    }
  };
}

export function createResponseTransformMiddleware(transformer) {
  return {
    name: 'response-transform',
    async onResponse(response, context) {
      return transformer(response, context);
    }
  };
}

export function createAuthMiddleware(options) {
  const { type = 'bearer' } = options;

  return {
    name: 'auth',
    async onRequest(context) {
      let authHeader;

      switch (type) {
        case 'bearer': {
          const token = typeof options.token === 'function'
            ? await options.token()
            : (options.getToken ? await options.getToken() : options.token);
          authHeader = `Bearer ${token}`;
          break;
        }
        case 'basic': {
          const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
          authHeader = `Basic ${credentials}`;
          break;
        }
        case 'custom': {
          if (options.getHeader) {
            authHeader = await options.getHeader(context);
          }
          break;
        }
      }

      if (authHeader) {
        context.headers.set('Authorization', authHeader);
      }

      return context;
    }
  };
}

export function createTimingMiddleware() {
  return {
    name: 'timing',
    onRequest(context) {
      context[METADATA] = context[METADATA] || {};
      context[METADATA].timingStart = process.hrtime.bigint();
      return context;
    },
    onResponse(response, context) {
      if (context[METADATA]?.timingStart) {
        const end = process.hrtime.bigint();
        const start = context[METADATA].timingStart;
        const durationNs = end - start;
        const durationMs = Number(durationNs) / 1e6;
        response[TIMING] = response[TIMING] || {};
        response[TIMING].middleware = durationMs;
      }
      return response;
    }
  };
}

export function createCacheMiddleware(options = {}) {
  const {
    cache = new Map(),
    ttl = 60000,
    keyGenerator = (ctx) => `${ctx.method}:${ctx.url}`,
    shouldCache = (res) => res.ok && res.status === 200
  } = options;

  return {
    name: 'cache',
    async onRequest(context) {
      if (context.method !== 'GET') {
        return context;
      }

      const key = keyGenerator(context);
      const cached = cache.get(key);

      if (cached && Date.now() < cached.expires) {
        context._cachedResponse = cached.response;
      }

      context._cacheKey = key;
      return context;
    },
    onResponse(response, context) {
      if (context._cachedResponse) {
        return context._cachedResponse;
      }

      if (context._cacheKey && shouldCache(response, context)) {
        cache.set(context._cacheKey, {
          response: response.clone ? response.clone() : response,
          expires: Date.now() + ttl
        });
      }

      return response;
    }
  };
}

export function createErrorHandlerMiddleware(options = {}) {
  const { handler, rethrow = true } = options;

  return {
    name: 'error-handler',
    async onError(error, context) {
      if (handler) {
        try {
          const result = await handler(error, context);
          if (result !== undefined && result !== null) {
            return result;
          }
        } catch (handlerError) {
          if (rethrow) {
            throw handlerError;
          }
        }
      }

      if (rethrow) {
        throw error;
      }

      return null;
    }
  };
}

export function createConditionalMiddleware(condition, middleware) {
  return {
    name: `conditional:${middleware.name || 'anonymous'}`,
    async onRequest(context) {
      if (await condition(context) && middleware.onRequest) {
        return middleware.onRequest(context);
      }
      return context;
    },
    async onResponse(response, context) {
      if (await condition(context) && middleware.onResponse) {
        return middleware.onResponse(response, context);
      }
      return response;
    },
    async onError(error, context) {
      if (await condition(context) && middleware.onError) {
        return middleware.onError(error, context);
      }
      return null;
    }
  };
}
