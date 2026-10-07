import assert from 'node:assert/strict';
import { FunctionsHttpError, FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';
import { studentActivationError } from '../lib/student-access-errors.ts';
const http=status=>new FunctionsHttpError(new Response('private server details',{status}));
for(const status of [400,409]) assert.match(studentActivationError(http(status)),/核對名冊.*學員登入或忘記密碼/);
for(const status of [401,403,404,500,503]) {
 assert.match(studentActivationError(http(status)),/服務暫時無法使用/);
 assert.doesNotMatch(studentActivationError(http(status)),/核對名冊|private/);
}
assert.match(studentActivationError(http(429)),/操作過於頻繁/);
for(const failure of [new FunctionsFetchError(Error('private')),new FunctionsRelayError(Error('private'))])assert.match(studentActivationError(failure),/無法連線/);
assert.doesNotMatch(studentActivationError(Error('private credentials')),/private|credentials/);
console.log('PASS: activation errors distinguish service outages, network failures, safe validation guidance and rate limiting without exposing raw server details');

assert.match(studentActivationError(http(422)),/此資料曾啟用帳號.*直接登入.*忘記密碼/);
assert.match(studentActivationError(http(410)),/已建立帳號.*接續啟用/);
