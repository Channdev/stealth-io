<div align="center">
	<h1>Stealth-IO</h1>
	<p>A production-ready HTTP client library built entirely from Node.js core modules. Zero external dependencies.</p>
	<a href="https://github.com/channdev/stealth-io/actions"><img src="https://github.com/channdev/stealth-io/workflows/CI/badge.svg?branch=main" alt="Build status"></a>
	<a href="https://www.npmjs.com/package/stealth-io"><img src="https://img.shields.io/npm/v/stealth-io" alt="npm version"></a>
	<a href="https://packagephobia.now.sh/result?p=stealth-io"><img src="https://badgen.net/packagephobia/install/stealth-io" alt="Install size"></a>
	<a href="https://github.com/channdev/stealth-io/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/stealth-io" alt="License"></a>
	<br>
	<br>
</div>

---

<!-- TOC -->

- [Motivation](#motivation)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Loading and configuring the module](#loading-and-configuring-the-module)
- [Quick Start](#quick-start)
- [Common Usage](#common-usage)
	- [Plain text or HTML](#plain-text-or-html)
	- [JSON](#json)
	- [Simple Post](#simple-post)
	- [Post with JSON](#post-with-json)
	- [Post with form parameters](#post-with-form-parameters)
	- [Handling exceptions](#handling-exceptions)
	- [Handling client and server errors](#handling-client-and-server-errors)
- [Advanced Usage](#advanced-usage)
	- [Creating a Client Instance](#creating-a-client-instance)
	- [Streams](#streams)
	- [Accessing Headers and other Metadata](#accessing-headers-and-other-metadata)
	- [Request cancellation with AbortSignal](#request-cancellation-with-abortsignal)
	- [Middleware](#middleware)
	- [Retry Logic](#retry-logic)
- [API](#api)
	- [stealthIO(url[, options])](#stealthiourl-options)
	- [Options](#options)
	- [Class: StealthClient](#class-stealthclient)
	- [Class: StealthResponse](#class-stealthresponse)
	- [Class: Headers](#class-headers)
	- [Class: StealthIOError](#class-stealthioerror)
	- [Class: TimeoutError](#class-timeouterror)
	- [Class: AbortError](#class-aborterror)
	- [Class: NetworkError](#class-networkerror)
	- [Class: HTTPError](#class-httperror)
	- [Class: RetryError](#class-retryerror)
- [Middleware](#middleware-1)
	- [Built-in Middleware](#built-in-middleware)
	- [Custom Middleware](#custom-middleware)
- [Testing](#testing)
- [Architecture](#architecture)
- [Team](#team)
- [Contributing](#contributing)
- [License](#license)

<!-- /TOC -->

## Motivation

Why build another HTTP client when so many exist? Because sometimes you need full control without the baggage of external dependencies. Stealth-IO is built entirely from Node.js core modules (`http`, `https`, `url`, `stream`, `zlib`, `events`), making it:

- **Lightweight**: Zero external runtime dependencies
- **Secure**: No supply chain vulnerabilities from third-party packages
- **Predictable**: Behavior determined solely by Node.js internals
- **Portable**: Works anywhere Node.js runs

## Features

- **Zero Dependencies**: Built entirely from Node.js core modules
- **Full HTTP Method Support**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Automatic JSON Handling**: Serialize/deserialize JSON request and response bodies
- **Response Body Processing**: Support for JSON, text, buffer, and stream responses
- **Middleware Pipeline**: Koa-style onion model for request/response interception
- **Configurable Retry Logic**: Exponential backoff with jitter support
- **Request Timeout**: Configurable timeout with proper cleanup
- **Abort/Cancellation**: Full AbortController/AbortSignal support
- **Automatic Redirects**: Follow redirects with configurable limits
- **Response Decompression**: Automatic gzip, deflate, and brotli decompression
- **Case-Insensitive Headers**: Headers class with normalized key access
- **Query String Handling**: Parse and serialize query parameters
- **Connection Pooling**: Leverage Node.js built-in HTTP agents
- **Pluggable Transport**: Custom transport interface for advanced use cases

## Requirements

- Node.js >= 18.0.0

## Installation

```sh
npm install stealth-io
```

## Loading and configuring the module

### ES Modules (ESM)

```js
import stealthIO from 'stealth-io';
```

### Named Exports

```js
import { StealthClient, createClient, Headers } from 'stealth-io';
```

### CommonJS

Stealth-IO is an ESM-only module. For CommonJS projects, use dynamic import:

```js
const stealthIO = (...args) => import('stealth-io').then(({default: stealthIO}) => stealthIO(...args));
```

## Quick Start

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://api.example.com/users');
const data = await response.json();

console.log(data);
```

## Common Usage

### Plain text or HTML

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://github.com/');
const body = await response.text();

console.log(body);
```

### JSON

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://api.github.com/users/github');
const data = await response.json();

console.log(data);
```

### Simple Post

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.post('https://httpbin.org/post', 'a=1');
const data = await response.json();

console.log(data);
```

### Post with JSON

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.post('https://httpbin.org/post', {
	name: 'John Doe',
	email: 'john@example.com'
});
const data = await response.json();

console.log(data);
```

### Post with form parameters

```js
import stealthIO from 'stealth-io';

const params = new URLSearchParams();
params.append('username', 'john');
params.append('password', 'secret');

const response = await stealthIO.post('https://httpbin.org/post', params.toString(), {
	headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
const data = await response.json();

console.log(data);
```

### Handling exceptions

```js
import stealthIO, { TimeoutError, NetworkError, AbortError } from 'stealth-io';

try {
	const response = await stealthIO.get('https://domain.invalid/');
} catch (error) {
	if (error instanceof TimeoutError) {
		console.log('Request timed out:', error.timeout);
	} else if (error instanceof NetworkError) {
		console.log('Network error:', error.code);
	} else if (error instanceof AbortError) {
		console.log('Request was aborted');
	} else {
		console.log('Unknown error:', error);
	}
}
```

### Handling client and server errors

```js
import stealthIO, { HTTPError } from 'stealth-io';

try {
	const response = await stealthIO.get('https://httpbin.org/status/404');
} catch (error) {
	if (error instanceof HTTPError) {
		console.log('HTTP Error:', error.status, error.statusText);
		const body = await error.response.text();
		console.log('Response body:', body);
	}
}
```

Or disable automatic status validation:

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://httpbin.org/status/404', {
	validateStatus: false
});

if (!response.ok) {
	console.log('Request failed with status:', response.status);
}
```

## Advanced Usage

### Creating a Client Instance

For repeated requests to the same API, create a client instance with shared configuration:

```js
import { StealthClient, createClient } from 'stealth-io';

const client = new StealthClient({
	baseURL: 'https://api.example.com',
	timeout: 10000,
	headers: {
		'Authorization': 'Bearer your-token',
		'X-API-Key': 'your-api-key'
	}
});

const users = await client.get('/users');
const user = await client.post('/users', { name: 'John' });
```

Or use the factory function:

```js
const client = createClient({
	baseURL: 'https://api.example.com',
	timeout: 10000
});
```

### Streams

Stream responses for large files or real-time data:

```js
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://example.com/large-file.zip');

if (!response.ok) throw new Error(`Unexpected response: ${response.statusText}`);

await pipeline(response.stream(), createWriteStream('./large-file.zip'));
```

### Accessing Headers and other Metadata

```js
import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://github.com/');

console.log(response.ok);
console.log(response.status);
console.log(response.statusText);
console.log(response.url);
console.log(response.headers.get('content-type'));
console.log(response.headers.entries());
```

### Request cancellation with AbortSignal

```js
import stealthIO, { AbortError } from 'stealth-io';

const controller = new AbortController();

setTimeout(() => controller.abort(), 150);

try {
	const response = await stealthIO.get('https://example.com/slow-endpoint', {
		signal: controller.signal
	});
	const data = await response.json();
} catch (error) {
	if (error instanceof AbortError) {
		console.log('Request was aborted');
	}
}
```

Using the built-in abort controller:

```js
import { StealthClient } from 'stealth-io';

const client = new StealthClient();
const controller = client.createAbortController();

const promise = client.get('https://example.com/slow-endpoint', {
	signal: controller.signal
});

setTimeout(() => controller.abort(), 1000);

try {
	const response = await promise;
} catch (error) {
	if (error.code === 'ABORTED') {
		console.log('Request was cancelled');
	}
}
```

### Middleware

Add middleware to intercept requests and responses:

```js
import { StealthClient, createLoggingMiddleware, createAuthMiddleware } from 'stealth-io';

const client = new StealthClient({
	baseURL: 'https://api.example.com'
});

client.use(createLoggingMiddleware({
	logger: console.log
}));

client.use(createAuthMiddleware({
	type: 'bearer',
	token: 'your-token'
}));

const response = await client.get('/users');
```

### Retry Logic

Configure automatic retries with exponential backoff:

```js
import { StealthClient, createRetryPolicy } from 'stealth-io';

const client = new StealthClient({
	maxRetries: 3,
	retryDelay: 1000,
	retryStrategy: 'exponential_jitter'
});

const response = await client.get('/flaky-endpoint');
```

Using preset retry policies:

```js
import { StealthClient, createRetryPolicy } from 'stealth-io';

const client = new StealthClient({
	...createRetryPolicy('aggressive')
});
```

Available policies:
- `aggressive`: 5 retries, 500ms delay, exponential jitter
- `moderate`: 3 retries, 1000ms delay, exponential
- `conservative`: 2 retries, 2000ms delay, exponential
- `none`: No retries

## API

### stealthIO(url[, options])

- `url` A string representing the URL for the request
- `options` [Options](#options) for the HTTP(S) request
- Returns: `Promise<StealthResponse>`

Perform an HTTP(S) request.

### Options

The default values are shown after each option key.

```js
{
	method: 'GET',
	headers: {},
	body: null,
	timeout: 30000,
	followRedirects: true,
	maxRedirects: 5,
	validateStatus: true,
	maxRetries: 0,
	retryDelay: 1000,
	retryStrategy: 'exponential',
	responseType: 'auto',
	signal: null,
	params: {},
	auth: null,
	baseURL: null
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | `string` | `'GET'` | HTTP method |
| `headers` | `object` | `{}` | Request headers |
| `body` | `any` | `null` | Request body |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `followRedirects` | `boolean` | `true` | Whether to follow redirects |
| `maxRedirects` | `number` | `5` | Maximum redirects to follow |
| `validateStatus` | `boolean` | `true` | Throw HTTPError on 4xx/5xx status |
| `maxRetries` | `number` | `0` | Number of retry attempts |
| `retryDelay` | `number` | `1000` | Base retry delay in milliseconds |
| `retryStrategy` | `string` | `'exponential'` | Retry strategy: `'fixed'`, `'exponential'`, `'exponential_jitter'` |
| `responseType` | `string` | `'auto'` | Response type: `'auto'`, `'json'`, `'text'`, `'buffer'`, `'stream'` |
| `signal` | `AbortSignal` | `null` | AbortSignal for cancellation |
| `params` | `object` | `{}` | URL query parameters |
| `auth` | `object` | `null` | Authentication `{ username, password }` |
| `baseURL` | `string` | `null` | Base URL prepended to relative URLs |

<a id="class-stealthclient"></a>

### Class: StealthClient

The main client class for making HTTP requests.

#### new StealthClient([options])

- `options` Default [Options](#options) for all requests

Creates a new StealthClient instance with default options.

```js
const client = new StealthClient({
	baseURL: 'https://api.example.com',
	timeout: 10000,
	headers: { 'Authorization': 'Bearer token' }
});
```

#### client.get(url[, options])

- `url` Request URL
- `options` Request [Options](#options)
- Returns: `Promise<StealthResponse>`

#### client.post(url[, body[, options]])

- `url` Request URL
- `body` Request body (automatically serialized if object)
- `options` Request [Options](#options)
- Returns: `Promise<StealthResponse>`

#### client.put(url[, body[, options]])

#### client.patch(url[, body[, options]])

#### client.delete(url[, options])

#### client.head(url[, options])

#### client.use(middleware)

- `middleware` Middleware object or function
- Returns: `StealthClient` (for chaining)

Add middleware to the request pipeline.

<a id="class-stealthresponse"></a>

### Class: StealthResponse

An HTTP response object.

#### response.ok

- `boolean`

`true` if status is 200-299.

#### response.status

- `number`

HTTP status code.

#### response.statusText

- `string`

HTTP status message.

#### response.headers

- `Headers`

Response headers.

#### response.url

- `string`

Final URL after redirects.

#### response.json()

- Returns: `Promise<any>`

Parse response body as JSON.

#### response.text()

- Returns: `Promise<string>`

Get response body as string.

#### response.buffer()

- Returns: `Promise<Buffer>`

Get response body as Buffer.

#### response.stream()

- Returns: `Readable`

Get response body as Node.js Readable stream.

<a id="class-headers"></a>

### Class: Headers

HTTP headers with case-insensitive key access.

#### new Headers([init])

- `init` Optional object, Headers instance, or entries array

```js
import { Headers } from 'stealth-io';

const headers = new Headers({
	'Content-Type': 'application/json',
	'X-Custom-Header': 'value'
});

headers.get('content-type');
headers.set('Authorization', 'Bearer token');
headers.has('x-custom-header');
headers.delete('X-Custom-Header');
```

<a id="class-stealthioerror"></a>

### Class: StealthIOError

Base error class for all Stealth-IO errors.

<a id="class-timeouterror"></a>

### Class: TimeoutError

Thrown when a request times out.

- `error.timeout` - The timeout value in milliseconds

<a id="class-aborterror"></a>

### Class: AbortError

Thrown when a request is aborted via AbortSignal.

<a id="class-networkerror"></a>

### Class: NetworkError

Thrown for network-level errors (DNS, connection refused, etc).

- `error.code` - System error code (e.g., `'ECONNREFUSED'`)

<a id="class-httperror"></a>

### Class: HTTPError

Thrown for HTTP error status codes when `validateStatus` is enabled.

- `error.status` - HTTP status code
- `error.statusText` - HTTP status message
- `error.response` - The StealthResponse object

<a id="class-retryerror"></a>

### Class: RetryError

Thrown when all retry attempts are exhausted.

- `error.attempts` - Number of attempts made
- `error.lastError` - The last error encountered

## Middleware

### Built-in Middleware

```js
import {
	createLoggingMiddleware,
	createAuthMiddleware,
	createCacheMiddleware,
	createTimingMiddleware,
	createHeadersMiddleware,
	createErrorMiddleware
} from 'stealth-io';
```

**Logging Middleware**

```js
client.use(createLoggingMiddleware({
	logger: console.log,
	logRequest: true,
	logResponse: true
}));
```

**Auth Middleware**

```js
client.use(createAuthMiddleware({
	type: 'bearer',
	token: 'your-token'
}));

client.use(createAuthMiddleware({
	type: 'basic',
	username: 'user',
	password: 'pass'
}));
```

**Cache Middleware**

```js
client.use(createCacheMiddleware({
	ttl: 60000,
	maxSize: 100
}));
```

**Timing Middleware**

```js
client.use(createTimingMiddleware({
	onTiming: (timing) => console.log(`Request took ${timing.duration}ms`)
}));
```

### Custom Middleware

```js
client.use({
	name: 'custom-middleware',
	onRequest(config) {
		config.headers.set('X-Request-ID', generateUUID());
		return config;
	},
	onResponse(response, config) {
		console.log(`Response received: ${response.status}`);
		return response;
	},
	onError(error, config) {
		console.error(`Request failed: ${error.message}`);
		return null;
	}
});
```

## Testing

```sh
npm test
npm run test:coverage
```

## Architecture

```
stealth-io/
  src/
    core/           # Constants, symbols, and error classes
    utils/          # Utility functions (headers, query, url, streams)
    types/          # Request and response type definitions
    http/           # Transport, abort, retry, request/response handling
    middleware/     # Middleware pipeline and built-in middleware
    client/         # Main StealthClient class
    index.js        # Main entry point
  test/             # Jest tests
```

## Team

| [![channdev](https://github.com/channdev.png?size=100)](https://github.com/channdev) |
| ------------------------------------------------------------------------------------ |
| [channdev](https://github.com/channdev)                                              |

**Lead Author**

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## License

[MIT](LICENSE)
