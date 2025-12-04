import { Readable, PassThrough } from 'stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'zlib';

export function collectStream(stream, options = {}) {
  const { maxSize, timeout } = options;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let timeoutId = null;

    if (timeout) {
      timeoutId = setTimeout(() => {
        stream.destroy(new Error(`Stream collection timed out after ${timeout}ms`));
      }, timeout);
    }

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    stream.on('data', (chunk) => {
      totalSize += chunk.length;
      if (maxSize && totalSize > maxSize) {
        cleanup();
        stream.destroy(new Error(`Stream exceeded maximum size of ${maxSize} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    stream.on('end', () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', (error) => {
      cleanup();
      reject(error);
    });
  });
}

export async function collectStreamAsString(stream, options = {}) {
  const { encoding = 'utf-8', ...restOptions } = options;
  const buffer = await collectStream(stream, restOptions);
  return buffer.toString(encoding);
}

export function createReadableStream(data, options = {}) {
  const { contentType } = options;

  if (data === null || data === undefined) {
    return { stream: Readable.from([]), length: 0, contentType: null };
  }

  if (data instanceof Readable || (data && typeof data.pipe === 'function')) {
    return { stream: data, length: null, contentType: contentType || 'application/octet-stream' };
  }

  if (Buffer.isBuffer(data)) {
    return { stream: Readable.from([data]), length: data.length, contentType: contentType || 'application/octet-stream' };
  }

  if (typeof data === 'string') {
    const buffer = Buffer.from(data, 'utf-8');
    return { stream: Readable.from([buffer]), length: buffer.length, contentType: contentType || 'text/plain; charset=utf-8' };
  }

  if (typeof data === 'object') {
    const json = JSON.stringify(data);
    const buffer = Buffer.from(json, 'utf-8');
    return { stream: Readable.from([buffer]), length: buffer.length, contentType: contentType || 'application/json; charset=utf-8' };
  }

  const str = String(data);
  const buffer = Buffer.from(str, 'utf-8');
  return { stream: Readable.from([buffer]), length: buffer.length, contentType: contentType || 'text/plain; charset=utf-8' };
}

export function createDecompressor(encoding) {
  if (!encoding) {
    return null;
  }
  const normalizedEncoding = encoding.toLowerCase().trim();
  switch (normalizedEncoding) {
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
    case 'brotli':
      return createBrotliDecompress();
    case 'identity':
    case 'none':
      return null;
    default:
      return null;
  }
}

export function decompressStream(stream, encoding) {
  const decompressor = createDecompressor(encoding);
  if (!decompressor) {
    return stream;
  }
  const output = stream.pipe(decompressor);
  stream.on('error', (err) => output.destroy(err));
  decompressor.on('error', (err) => output.destroy(err));
  return output;
}

export function createInspectorStream(stream, inspector) {
  const passThrough = new PassThrough();
  stream.on('data', (chunk) => {
    inspector(chunk);
    passThrough.push(chunk);
  });
  stream.on('end', () => {
    passThrough.push(null);
  });
  stream.on('error', (err) => {
    passThrough.destroy(err);
  });
  return passThrough;
}

export function limitStream(stream, maxSize) {
  const passThrough = new PassThrough();
  let totalSize = 0;
  stream.on('data', (chunk) => {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      const error = new Error(`Stream exceeded maximum size of ${maxSize} bytes`);
      error.code = 'ERR_STREAM_SIZE_EXCEEDED';
      stream.destroy(error);
      passThrough.destroy(error);
      return;
    }
    passThrough.push(chunk);
  });
  stream.on('end', () => {
    passThrough.push(null);
  });
  stream.on('error', (err) => {
    passThrough.destroy(err);
  });
  return passThrough;
}

export function fromAsyncIterable(iterable) {
  return Readable.from(iterable);
}

export function drainStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('data', () => {});
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.resume();
  });
}

export function isReadableStream(value) {
  return value !== null &&
         typeof value === 'object' &&
         typeof value.pipe === 'function' &&
         typeof value.on === 'function' &&
         (value.readable !== false);
}
