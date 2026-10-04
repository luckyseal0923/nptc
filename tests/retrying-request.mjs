import assert from 'node:assert/strict';
import { retryingRequest, RequestTimeout } from '../lib/retrying-request.ts';

let calls = 0;
let retries = 0;
const result = await retryingRequest(async signal => {
  calls++;
  if (calls === 1) return new Promise(resolve => signal.addEventListener('abort', () => resolve('late')));
  return 'ready';
}, { timeoutMs: 15, onRetry: () => retries++ });
assert.equal(result, 'ready');
assert.equal(calls, 2);
assert.equal(retries, 1);

calls = 0;
await assert.rejects(
  () => retryingRequest(() => { calls++; return new Promise(() => {}); }, { timeoutMs: 15 }),
  RequestTimeout,
);
assert.equal(calls, 2);

calls = 0;
await assert.rejects(
  () => retryingRequest(() => { calls++; throw Error('permission denied'); }),
  /permission denied/,
);
assert.equal(calls, 1, 'non-timeout errors must not retry');

const controller = new AbortController();
const pending = retryingRequest(() => new Promise(() => {}), { signal: controller.signal, timeoutMs: 1000 });
controller.abort();
await assert.rejects(() => pending, { name: 'AbortError' });
console.log('PASS: timeout retry, bounded failure, non-timeout failure, cancellation');
