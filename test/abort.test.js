import {
  StealthAbortSignal,
  StealthAbortController,
  createAbortController,
  linkAbortSignals,
  createTimeoutSignal,
  isAbortError,
  withAbortSignal
} from '../src/http/abort.js';
import { AbortError } from '../src/core/errors.js';

describe('StealthAbortController', () => {
  test('creates controller with signal', () => {
    const controller = new StealthAbortController();
    expect(controller.signal).toBeInstanceOf(StealthAbortSignal);
    expect(controller.signal.aborted).toBe(false);
  });

  test('abort sets signal to aborted', () => {
    const controller = new StealthAbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  test('abort with reason sets reason', () => {
    const controller = new StealthAbortController();
    const reason = new Error('Custom reason');
    controller.abort(reason);
    expect(controller.signal.reason).toBe(reason);
  });
});

describe('StealthAbortSignal', () => {
  test('addEventListener and removeEventListener', () => {
    const signal = new StealthAbortSignal();
    let called = false;
    const handler = () => { called = true; };

    signal.addEventListener('abort', handler);
    signal._abort();
    expect(called).toBe(true);
  });

  test('once option removes listener after call', () => {
    const signal = new StealthAbortSignal();
    let callCount = 0;
    signal.addEventListener('abort', () => { callCount++; }, { once: true });
    signal._abort();
    expect(callCount).toBe(1);
  });

  test('calls handler immediately if already aborted', () => {
    const signal = new StealthAbortSignal();
    signal._abort();

    let called = false;
    signal.addEventListener('abort', () => { called = true; });
    expect(called).toBe(true);
  });

  test('throwIfAborted throws when aborted', () => {
    const signal = new StealthAbortSignal();
    signal._abort();
    expect(() => signal.throwIfAborted()).toThrow(AbortError);
  });

  test('throwIfAborted does nothing when not aborted', () => {
    const signal = new StealthAbortSignal();
    expect(() => signal.throwIfAborted()).not.toThrow();
  });

  describe('timeout', () => {
    test('creates signal that aborts after timeout', async () => {
      const signal = StealthAbortSignal.timeout(50);
      expect(signal.aborted).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(signal.aborted).toBe(true);
    });
  });

  describe('abort static method', () => {
    test('creates already aborted signal', () => {
      const signal = StealthAbortSignal.abort();
      expect(signal.aborted).toBe(true);
    });

    test('accepts custom reason', () => {
      const reason = new Error('Custom');
      const signal = StealthAbortSignal.abort(reason);
      expect(signal.reason).toBe(reason);
    });
  });

  describe('any', () => {
    test('returns aborted signal if any input is aborted', () => {
      const aborted = StealthAbortSignal.abort();
      const fresh = new StealthAbortSignal();

      const combined = StealthAbortSignal.any([aborted, fresh]);
      expect(combined.aborted).toBe(true);
    });

    test('aborts when any input aborts', () => {
      const controller1 = new StealthAbortController();
      const controller2 = new StealthAbortController();

      const combined = StealthAbortSignal.any([controller1.signal, controller2.signal]);
      expect(combined.aborted).toBe(false);

      controller1.abort();
      expect(combined.aborted).toBe(true);
    });
  });
});

describe('createAbortController', () => {
  test('creates controller and cleanup function', () => {
    const { controller, signal, cleanup } = createAbortController();
    expect(controller).toBeInstanceOf(StealthAbortController);
    expect(signal).toBeInstanceOf(StealthAbortSignal);
    expect(typeof cleanup).toBe('function');
  });

  test('auto-aborts after timeout', async () => {
    const { signal, cleanup } = createAbortController({ timeout: 50 });
    expect(signal.aborted).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test('cleanup prevents timeout', async () => {
    const { signal, cleanup } = createAbortController({ timeout: 50 });
    cleanup();

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(signal.aborted).toBe(false);
  });
});

describe('linkAbortSignals', () => {
  test('links multiple signals', () => {
    const controller1 = new StealthAbortController();
    const controller2 = new StealthAbortController();

    const { signal, cleanup } = linkAbortSignals(controller1.signal, controller2.signal);
    expect(signal.aborted).toBe(false);

    controller1.abort();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test('handles already aborted signal', () => {
    const aborted = StealthAbortSignal.abort();
    const fresh = new StealthAbortSignal();

    const { signal } = linkAbortSignals(aborted, fresh);
    expect(signal.aborted).toBe(true);
  });

  test('skips null signals', () => {
    const controller = new StealthAbortController();
    const { signal } = linkAbortSignals(null, controller.signal, undefined);
    expect(signal.aborted).toBe(false);

    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe('createTimeoutSignal', () => {
  test('creates timeout signal', async () => {
    const signal = createTimeoutSignal(50);
    expect(signal.aborted).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(signal.aborted).toBe(true);
  });
});

describe('isAbortError', () => {
  test('returns true for AbortError', () => {
    expect(isAbortError(new AbortError())).toBe(true);
  });

  test('returns true for error with AbortError name', () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
  });

  test('returns true for error with ABORTED code', () => {
    const error = new Error('Aborted');
    error.code = 'ABORTED';
    expect(isAbortError(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    expect(isAbortError(new Error('Regular error'))).toBe(false);
  });
});

describe('withAbortSignal', () => {
  test('resolves normally when not aborted', async () => {
    const signal = new StealthAbortSignal();
    const result = await withAbortSignal(Promise.resolve('success'), signal);
    expect(result).toBe('success');
  });

  test('rejects immediately if already aborted', async () => {
    const signal = StealthAbortSignal.abort();
    await expect(withAbortSignal(Promise.resolve('success'), signal)).rejects.toThrow(AbortError);
  });

  test('rejects when signal aborts', async () => {
    const controller = new StealthAbortController();
    const slowPromise = new Promise(resolve => setTimeout(() => resolve('slow'), 100));

    setTimeout(() => controller.abort(), 10);

    await expect(withAbortSignal(slowPromise, controller.signal)).rejects.toThrow(AbortError);
  });

  test('returns promise directly if no signal', async () => {
    const result = await withAbortSignal(Promise.resolve('success'), null);
    expect(result).toBe('success');
  });
});
