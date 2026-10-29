import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {transpileModule,ScriptTarget,ModuleKind} from 'typescript';

async function load(options={}) {
  const calls=[];
  const fixture={
    current:{auth:{getUser:async()=>({data:{user:{id:'current',email:'admin@example.test'}},error:null})}},
    createClient:(url,key,config)=>{
      calls.push({kind:'client',url,key,config});
      return {
        auth:{signInWithPassword:async(credentials)=>{calls.push({kind:'login',credentials});return options.login ?? {data:{session:{},user:{id:'current'}},error:null};},signOut:async(body)=>{calls.push({kind:'signout',body});return {error:null};}},
        rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});return {error:options.rpcError ?? null};},
      };
    }
  };
  globalThis.__surveyActionTest=fixture;
  let code=transpileModule(readFileSync('lib/admin-survey-action.ts','utf8'),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ESNext}}).outputText;
  code=code.replace("import { createClient } from '@supabase/supabase-js';",'const createClient=globalThis.__surveyActionTest.createClient;')
    .replace("import { DEMO_MODE } from './demo';",'const DEMO_MODE=false;')
    .replace("import { rpc, supabase } from './supabase';",'const supabase=globalThis.__surveyActionTest.current;const rpc=()=>{throw Error("unexpected parent RPC");};')
    .replaceAll('import.meta.env.SUPABASE_URL',JSON.stringify('https://auth.example.test')).replaceAll('import.meta.env.SUPABASE_KEY',JSON.stringify('sb_publishable_test'));
  const mod=await import(`data:text/javascript;base64,${Buffer.from(code+`\n// ${crypto.randomUUID()}`).toString('base64')}`);
  return {delete:mod.deleteSurveyWithPassword,calls};
}
const body={id:'assignment',revision:0,expectedResponses:1,acknowledgeDataLoss:true};
test('deletion reauthenticates the same admin in a separate nonpersistent session; password never enters RPC',async()=>{
  const f=await load();await f.delete(body,' ADMIN@example.test ','secret-test');
  assert.deepEqual(f.calls.map(c=>c.kind),['client','login','rpc','signout']);
  assert.deepEqual(f.calls[0].config.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'nptc-survey-confirm'});
  assert.deepEqual(f.calls[2].args,{body});assert.ok(!JSON.stringify(f.calls[2]).includes('secret-test'));
  assert.deepEqual(f.calls[3].body,{scope:'local'});
});
test('wrong current email, failed password or a different authenticated user never reaches deletion',async()=>{
  let f=await load();await assert.rejects(()=>f.delete(body,'different@example.test','test'),/目前登入/);assert.equal(f.calls.length,0);
  for(const login of [{data:{session:null,user:null},error:{message:'bad'}},{data:{session:{},user:{id:'different'}},error:null}]){
    f=await load({login});await assert.rejects(()=>f.delete(body,'admin@example.test','bad'),/驗證失敗/);assert.ok(!f.calls.some(c=>c.kind==='rpc'));assert.equal(f.calls.at(-1).kind,'signout');
  }
});
test('backend rejection is shown and the temporary session is signed out',async()=>{
  const f=await load({rpcError:{message:'作答筆數已變更'}});await assert.rejects(()=>f.delete(body,'admin@example.test','test'),/筆數已變更/);assert.equal(f.calls.at(-1).kind,'signout');
  delete globalThis.__surveyActionTest;
});
