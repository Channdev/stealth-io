import { createClient, createCommonPatternMatchers, createApiSpecificPatterns } from './src/index.js';

async function testRateLimiting() {
  console.log('=== Testing Rate Limiting ===\n');

  const client = createClient({
    rateLimit: {
      maxRequests: 3,
      perMs: 2000,
      queue: true,
      onThrottle: ({ waitTime, queueSize, queued }) => {
        console.log(`Throttled! Wait: ${waitTime}ms, Queue size: ${queueSize}, Queued: ${queued}`);
      },
      onDequeue: ({ waitedMs, remainingQueue }) => {
        console.log(`Dequeued after ${waitedMs}ms, Remaining in queue: ${remainingQueue}`);
      }
    }
  });

  const limiter = client.getRateLimiter();
  console.log(`Initial remaining requests: ${limiter.getRemainingRequests()}`);

  const urls = [
    'https://httpbin.org/get?req=1',
    'https://httpbin.org/get?req=2',
    'https://httpbin.org/get?req=3',
    'https://httpbin.org/get?req=4',
    'https://httpbin.org/get?req=5'
  ];

  console.log(`\nSending ${urls.length} requests with rate limit of 3 per 2 seconds...\n`);

  const startTime = Date.now();

  const promises = urls.map(async (url, index) => {
    const reqStart = Date.now();
    try {
      const response = await client.get(url);
      const elapsed = Date.now() - reqStart;
      console.log(`Request ${index + 1}: ${response.status} (took ${elapsed}ms)`);
      return response;
    } catch (error) {
      console.log(`Request ${index + 1} failed: ${error.message}`);
      return null;
    }
  });

  await Promise.all(promises);

  const totalTime = Date.now() - startTime;
  console.log(`\nTotal time: ${totalTime}ms`);
  console.log(`Remaining requests: ${limiter.getRemainingRequests()}`);

  client.destroy();
}

async function testPatternRetry() {
  console.log('\n=== Testing Pattern-Based Retry ===\n');

  const client = createClient({
    retry: {
      maxRetries: 3,
      retryDelay: 500,
      matchStatus: [500, 502, 503, 504],
      matchBody: /error|unavailable/i,
      matchAny: true,
      onRetry: ({ attempt, delay, reason }) => {
        console.log(`Retry attempt ${attempt + 1}, waiting ${delay}ms. Reason: ${reason}`);
      },
      onPatternMatch: ({ attempt, result }) => {
        console.log(`Pattern matched on attempt ${attempt}: ${result.reason}`);
      }
    }
  });

  try {
    const response = await client.get('https://httpbin.org/status/200');
    console.log(`Success: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.log(`Failed: ${error.message}`);
  }

  console.log('\nTesting with 503 status (should trigger retries)...');
  try {
    const response = await client.get('https://httpbin.org/status/503', {
      retry: {
        maxRetries: 2,
        retryDelay: 300,
        matchStatus: [503],
        onRetry: ({ attempt }) => {
          console.log(`  Retry ${attempt + 1} for 503...`);
        }
      }
    });
    console.log(`Success: ${response.status}`);
  } catch (error) {
    console.log(`Expected failure after retries: ${error.message}`);
  }

  client.destroy();
}

async function testCommonPatterns() {
  console.log('\n=== Common Pattern Matchers ===\n');

  const patterns = createCommonPatternMatchers();

  const testStrings = [
    'Service temporarily unavailable',
    'Rate limit exceeded',
    'Down for maintenance',
    'Server overloaded, try again later',
    'Success'
  ];

  testStrings.forEach(str => {
    const matches = [];
    if (patterns.temporarilyUnavailable.test(str)) matches.push('temporarilyUnavailable');
    if (patterns.rateLimited.test(str)) matches.push('rateLimited');
    if (patterns.maintenance.test(str)) matches.push('maintenance');
    if (patterns.overloaded.test(str)) matches.push('overloaded');
    if (patterns.retryLater.test(str)) matches.push('retryLater');

    console.log(`"${str}"`);
    console.log(`  Matches: ${matches.length ? matches.join(', ') : 'none'}\n`);
  });
}

async function testApiSpecificPatterns() {
  console.log('=== API-Specific Patterns ===\n');

  const apis = ['discord', 'twitter', 'shopify', 'github', 'stripe'];

  apis.forEach(api => {
    const patterns = createApiSpecificPatterns(api);
    console.log(`${api.toUpperCase()}:`);
    console.log(`  Status codes: ${JSON.stringify(patterns.matchStatus)}`);
    console.log(`  Body patterns: ${patterns.matchBody.length} pattern(s)`);
    if (patterns.matchHeaders) {
      console.log(`  Header patterns: ${Object.keys(patterns.matchHeaders).join(', ')}`);
    }
    console.log('');
  });
}

async function testRateLimitWithoutQueue() {
  console.log('=== Rate Limiting Without Queue ===\n');

  const client = createClient({
    rateLimit: {
      maxRequests: 2,
      perMs: 5000,
      queue: false
    }
  });

  console.log('Sending 3 requests with limit of 2 (no queue)...\n');

  for (let i = 1; i <= 3; i++) {
    try {
      const response = await client.get('https://httpbin.org/get');
      console.log(`Request ${i}: Success (${response.status})`);
    } catch (error) {
      console.log(`Request ${i}: ${error.name} - ${error.message}`);
      if (error.retryAfter) {
        console.log(`  Retry after: ${error.retryAfter}ms`);
      }
    }
  }

  client.destroy();
}

async function main() {
  try {
    await testRateLimiting();
    await testPatternRetry();
    await testCommonPatterns();
    await testApiSpecificPatterns();
    await testRateLimitWithoutQueue();

    console.log('\n=== All Tests Complete ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
