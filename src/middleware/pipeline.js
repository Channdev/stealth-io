import { MiddlewareError } from '../core/errors.js';

export class MiddlewarePipeline {
  #middleware = [];

  constructor(initialMiddleware = []) {
    for (const mw of initialMiddleware) {
      this.use(mw);
    }
  }

  use(middleware) {
    if (typeof middleware === 'function') {
      middleware = { name: middleware.name || 'anonymous', handler: middleware };
    }

    if (!middleware || typeof middleware !== 'object') {
      throw new Error('Middleware must be an object or function');
    }

    const hasHandler = typeof middleware.handler === 'function';
    const hasOnRequest = typeof middleware.onRequest === 'function';
    const hasOnResponse = typeof middleware.onResponse === 'function';
    const hasOnError = typeof middleware.onError === 'function';

    if (!hasHandler && !hasOnRequest && !hasOnResponse && !hasOnError) {
      throw new Error('Middleware must have at least one handler function');
    }

    this.#middleware.push({
      name: middleware.name || 'anonymous',
      handler: middleware.handler,
      onRequest: middleware.onRequest,
      onResponse: middleware.onResponse,
      onError: middleware.onError
    });

    return this;
  }

  remove(name) {
    const index = this.#middleware.findIndex(mw => mw.name === name);
    if (index !== -1) {
      this.#middleware.splice(index, 1);
      return true;
    }
    return false;
  }

  clear() {
    this.#middleware = [];
  }

  get length() {
    return this.#middleware.length;
  }

  getNames() {
    return this.#middleware.map(mw => mw.name);
  }

  async executeRequest(context) {
    for (const mw of this.#middleware) {
      if (mw.onRequest) {
        try {
          const result = await mw.onRequest(context);
          if (result !== undefined) {
            context = result;
          }
        } catch (error) {
          throw new MiddlewareError(
            `Request middleware "${mw.name}" failed: ${error.message}`,
            { middlewareName: mw.name, phase: 'request' },
            error
          );
        }
      }
    }
    return context;
  }

  async executeResponse(response, context) {
    for (let i = this.#middleware.length - 1; i >= 0; i--) {
      const mw = this.#middleware[i];
      if (mw.onResponse) {
        try {
          const result = await mw.onResponse(response, context);
          if (result !== undefined) {
            response = result;
          }
        } catch (error) {
          throw new MiddlewareError(
            `Response middleware "${mw.name}" failed: ${error.message}`,
            { middlewareName: mw.name, phase: 'response' },
            error
          );
        }
      }
    }
    return response;
  }

  async executeError(error, context) {
    for (const mw of this.#middleware) {
      if (mw.onError) {
        try {
          const result = await mw.onError(error, context);
          if (result !== undefined && result !== null) {
            return result;
          }
        } catch (handlerError) {
          error = new MiddlewareError(
            `Error handler "${mw.name}" failed: ${handlerError.message}`,
            { middlewareName: mw.name, phase: 'error' },
            handlerError
          );
        }
      }
    }
    return null;
  }

  async execute(context, core) {
    const chain = this.#middleware.filter(mw => mw.handler).map(mw => mw.handler);
    const composed = compose(chain);
    return composed(context, core);
  }

  clone() {
    const cloned = new MiddlewarePipeline();
    cloned.#middleware = [...this.#middleware];
    return cloned;
  }
}

export function compose(middleware) {
  if (!Array.isArray(middleware)) {
    throw new TypeError('Middleware stack must be an array');
  }

  for (const fn of middleware) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be composed of functions');
    }
  }

  return function composedMiddleware(context, next) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      let fn = middleware[i];
      if (i === middleware.length) {
        fn = next;
      }
      if (!fn) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return dispatch(0);
  };
}

export function createPipeline(initialMiddleware = []) {
  return new MiddlewarePipeline(initialMiddleware);
}
