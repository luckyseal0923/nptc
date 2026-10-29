import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
async function fixture(fail=false) {
 const calls=[];
 const context={supabase:{auth:{getUser:async()=>({data:{user:{id:'owner',email:'admin@example.test'}},error:null})}},createClient:(_url,_key,config)=>{
  calls.push({kind:'client',config});return {auth:{signInWithPassword:async()=>({data:{session:{access_token:'temporary-test'},user:{id:'owner'}},error:null}),signOut:async body=>{calls.push({kind:'signOut',body});}}};
 },request:async(_url,options)=>{calls.push({kind:'request',options});if(fail)throw Error('network unavailable');return {ok:true};}};
 globalThis.__workshopFixture=context;
 let code=transpileModule(readFileSync('lib/admin-workshop-action.ts','utf8'),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ESNext}}).outputText
  .replace("import { createClient } from '@supabase/supabase-js';",'const createClient=globalThis.__workshopFixture.createClient;')
  .replace("import { supabase } from './supabase';",'const supabase=globalThis.__workshopFixture.supabase;const fetch=globalThis.__workshopFixture.request;')
  .replaceAll('import.meta.env.SUPABASE_URL',JSON.stringify('https://example.test')).replaceAll('import.meta.env.SUPABASE_KEY',JSON.stringify('sb_publishable_test'));
 const module=await import(`data:text/javascript;base64,${Buffer.from(code+`\n//${crypto.randomUUID()}`).toString('base64')}`);
 return {action:module.adminWorkshopAction,calls};
}
test('workshop confirmation uses a separate temporary client, bounded request and cleanup',async()=>{
 const f=await fixture();await f.action('delete',{id:'workshop',name:'測試'},'admin@example.test','test-password',{fingerprint:'test-fingerprint',acknowledgeDataLoss:true});
 assert.equal(f.calls[0].config.auth.persistSession,false);assert.equal(f.calls[0].config.auth.storageKey,'nptc-workshop-confirm');
 const request=f.calls.find(x=>x.kind==='request');assert.ok(request.options.signal instanceof AbortSignal);assert.ok(!request.options.body.includes('test-password'));assert.equal(JSON.parse(request.options.body).body.fingerprint,'test-fingerprint');
 assert.deepEqual(f.calls.at(-1),{kind:'signOut',body:{scope:'local'}});
});
test('workshop request failure still cleans the temporary login; wrong account cannot log in',async()=>{
 let f=await fixture(true);await assert.rejects(()=>f.action('archive',{id:'workshop',name:'測試'},'admin@example.test','test'),/network/);assert.equal(f.calls.at(-1).kind,'signOut');
 f=await fixture();await assert.rejects(()=>f.action('archive',{id:'workshop',name:'測試'},'other@example.test','test'),/目前登入/);assert.equal(f.calls.length,0);delete globalThis.__workshopFixture;
});
