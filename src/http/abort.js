import { EventEmitter } from 'events';
import { AbortError } from '../core/errors.js';

export class StealthAbortSignal extends EventEmitter {
  #aborted = false;
  #reason = undefined;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  get aborted() {
    return this.#aborted;
  }

  get reason() {
    return this.#reason;
  }

  addEventListener(type, listener, options = {}) {
    if (type === 'abort') {
      if (options.once) {
        this.once('abort', listener);
      } else {
        this.on('abort', listener);
      }
      if (this.#aborted) {
        listener.call(this, { type: 'abort', target: this });
      }
    }
  }

  removeEventListener(type, listener) {
    if (type === 'abort') {
      this.off('abort', listener);
    }
  }

  _abort(reason) {
    if (this.#aborted) {
      return;
    }
    this.#aborted = true;
    this.#reason = reason;
    this.emit('abort', { type: 'abort', target: this });
  }

  throwIfAborted() {
    if (this.#aborted) {
      throw new AbortError(this.#reason?.message || 'The operation was aborted', { reason: this.#reason });
    }
  }

  static timeout(ms) {
    const controller = new StealthAbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new AbortError('The operation timed out', { timeout: ms }));
    }, ms);
    controller.signal.addEventListener('abort', () => { clearTimeout(timeoutId); }, { once: true });
    return controller.signal;
  }

  static abort(reason) {
    const signal = new StealthAbortSignal();
    signal._abort(reason || new AbortError('The operation was aborted'));
    return signal;
  }

  static any(signals) {
    const controller = new StealthAbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener('abort', () => { controller.abort(signal.reason); }, { once: true });
    }
    return controller.signal;
  }
}

export class StealthAbortController {
  #signal;

  constructor() {
    this.#signal = new StealthAbortSignal();
  }

  get signal() {
    return this.#signal;
  }

  abort(reason) {
    this.#signal._abort(reason || new AbortError('The operation was aborted'));
  }
}

export function createAbortController(options = {}) {
  const controller = new StealthAbortController();
  const cleanupFns = [];

  if (options.timeout) {
    const timeoutId = setTimeout(() => {
      controller.abort(new AbortError(`Request timed out after ${options.timeout}ms`, { timeout: options.timeout }));
    }, options.timeout);
    cleanupFns.push(() => clearTimeout(timeoutId));
  }

  const cleanup = () => {
    for (const fn of cleanupFns) {
      fn();
    }
  };

  return { controller, signal: controller.signal, cleanup };
}

export function linkAbortSignals(...signals) {
  const controller = new StealthAbortController();
  const cleanupFns = [];

  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      return { signal: controller.signal, cleanup: () => {} };
    }
    const handler = () => { controller.abort(signal.reason); };
    signal.addEventListener('abort', handler, { once: true });
    cleanupFns.push(() => signal.removeEventListener('abort', handler));
  }

  const cleanup = () => {
    for (const fn of cleanupFns) {
      fn();
    }
  };

  return { signal: controller.signal, cleanup };
}

export function createTimeoutSignal(ms) {
  return StealthAbortSignal.timeout(ms);
}

export function isAbortError(error) {
  return error instanceof AbortError ||
         error?.name === 'AbortError' ||
         error?.code === 'ABORTED' ||
         error?.code === 'ERR_ABORTED';
}

export function withAbortSignal(promise, signal) {
  if (!signal) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AbortError('The operation was aborted', { reason: signal.reason }));
      return;
    }

    const abortHandler = () => {
      reject(new AbortError('The operation was aborted', { reason: signal.reason }));
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    promise
      .then((result) => {
        signal.removeEventListener('abort', abortHandler);
        resolve(result);
      })
      .catch((error) => {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
  });
}
