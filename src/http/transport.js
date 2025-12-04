import http from 'http';
import https from 'https';
import { parseUrl, getProtocol, toRequestOptions } from '../utils/url.js';
import { NetworkError, TimeoutError, AbortError } from '../core/errors.js';
import { createReadableStream } from '../utils/streams.js';

export class BaseTransport {
  constructor(options = {}) {
    this.options = options;
  }

  async send(requestConfig) {
    throw new Error('Transport.send() must be implemented by subclass');
  }

  destroy() {}
}

export class NodeTransport extends BaseTransport {
  constructor(options = {}) {
    super(options);
    const {
      httpAgent,
      httpsAgent,
      keepAlive = true,
      keepAliveMsecs = 1000,
      maxSockets = 50,
      rejectUnauthorized = true
    } = options;

    this.httpAgent = httpAgent || new http.Agent({ keepAlive, keepAliveMsecs, maxSockets });
    this.httpsAgent = httpsAgent || new https.Agent({ keepAlive, keepAliveMsecs, maxSockets, rejectUnauthorized });
    this.rejectUnauthorized = rejectUnauthorized;
  }

  send(requestConfig) {
    return new Promise((resolve, reject) => {
      const { url, method, headers, body, timeout, signal } = requestConfig;

      const parsedUrl = parseUrl(url);
      const protocol = getProtocol(url);
      const isSecure = protocol === 'https';

      const httpModule = isSecure ? https : http;
      const agent = isSecure ? this.httpsAgent : this.httpAgent;

      const requestOptions = {
        ...toRequestOptions(url),
        method,
        headers: headers.toObject(),
        agent,
        timeout
      };

      if (isSecure) {
        requestOptions.rejectUnauthorized = this.rejectUnauthorized;
      }

      const timing = {
        startTime: Date.now(),
        socketTime: null,
        dnsTime: null,
        connectTime: null,
        secureConnectTime: null,
        firstByteTime: null,
        endTime: null
      };

      const req = httpModule.request(requestOptions);

      let aborted = false;
      const abortHandler = () => {
        aborted = true;
        req.destroy();
        reject(new AbortError('Request aborted', { url, method, reason: signal?.reason }));
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      const cleanupAbort = () => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      if (timeout) {
        req.setTimeout(timeout, () => {
          req.destroy();
          cleanupAbort();
          reject(new TimeoutError(`Request timed out after ${timeout}ms`, { url, method, timeout }));
        });
      }

      req.on('socket', (socket) => {
        timing.socketTime = Date.now();
        socket.on('lookup', () => { timing.dnsTime = Date.now(); });
        socket.on('connect', () => { timing.connectTime = Date.now(); });
        socket.on('secureConnect', () => { timing.secureConnectTime = Date.now(); });
      });

      req.on('error', (error) => {
        if (aborted) return;
        cleanupAbort();
        const networkError = NetworkError.fromSystemError(error, {
          url,
          method,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port
        });
        reject(networkError);
      });

      req.on('response', (res) => {
        timing.firstByteTime = Date.now();
        cleanupAbort();
        res._timing = timing;
        res._url = url;
        resolve(res);
      });

      if (body !== null && body !== undefined) {
        const { stream: bodyStream, length, contentType } = createReadableStream(body);
        if (length !== null && !headers.has('content-length')) {
          req.setHeader('Content-Length', length);
        }
        if (contentType && !headers.has('content-type')) {
          req.setHeader('Content-Type', contentType);
        }
        bodyStream.pipe(req);
        bodyStream.on('error', (error) => { req.destroy(error); });
      } else {
        req.end();
      }
    });
  }

  destroy() {
    if (this.httpAgent && typeof this.httpAgent.destroy === 'function') {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent && typeof this.httpsAgent.destroy === 'function') {
      this.httpsAgent.destroy();
    }
  }
}

export class TransportFactory {
  static #transports = new Map([['node', NodeTransport]]);

  static register(name, TransportClass) {
    if (!(TransportClass.prototype instanceof BaseTransport)) {
      throw new Error('Transport must extend BaseTransport');
    }
    this.#transports.set(name, TransportClass);
  }

  static create(type = 'node', options = {}) {
    const TransportClass = this.#transports.get(type);
    if (!TransportClass) {
      throw new Error(`Unknown transport type: ${type}`);
    }
    return new TransportClass(options);
  }

  static getTypes() {
    return [...this.#transports.keys()];
  }
}

export function createDefaultTransport(options = {}) {
  return new NodeTransport(options);
}
