import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { inspectPublicKey } from '../scripts/check-public-key.mjs';
import { classifyApiResponse, checkSupabase } from '../scripts/check-supabase.mjs';
const compile=path=>transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ESNext}}).outputText;
const data=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const shortCode=data(compile('lib/survey-short-link.ts'));
const {encodeSurveyId}=await import(shortCode);
const {studentReturnUrl}=await import(data(compile('lib/student-return.ts').replace("'./survey-short-link'",JSON.stringify(shortCode))));
const id='58a1716d-05b0-46fc-98fe-83cf10d86fe3';
test('password recovery preserves only a valid same-origin publication across root and Pages paths',()=>{
 for(const base of ['/','/nptc/']) {
  for(const search of [`?survey=${id}`,`?s=${encodeSurveyId(id)}`]) {
   const reset=new URL(studentReturnUrl('https://example.test',base,search,true));
   assert.equal(reset.pathname,`${base}student/`);assert.equal(reset.searchParams.get('reset'),'1');assert.equal(reset.searchParams.get('survey'),id);
   const done=new URL(studentReturnUrl(reset.origin,base,reset.search));assert.equal(done.searchParams.has('reset'),false);assert.equal(done.searchParams.get('survey'),id);
  }
 }
 for(const search of ['?survey=https://evil.test','?s=../teacher','?next=https://evil.test',`?survey=${id}&survey=${id}`]) {
  const url=new URL(studentReturnUrl('https://example.test','/',search));assert.equal(url.origin,'https://example.test');assert.equal(url.search,'');
 }
});
const key=(role,days)=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+days*86400})).toString('base64url')}.test`;
test('public key check detects service-role keys and the renewal deadline without printing secrets',()=>{
 assert.equal(inspectPublicKey(key('anon',120)).type,'anon');assert.equal(inspectPublicKey('sb_publishable_test').expiresAt,null);
 for(const value of [undefined,'bad',key('service_role',120),key('anon',-1),key('anon',6)])assert.throws(()=>inspectPublicKey(value));
});
test('API diagnostic separates expected permissions from bad JWT, missing RPC and network failure',async()=>{
 assert.equal(classifyApiResponse(401,{code:'42501'}).ok,true);
 for(const [status,body] of [[401,{code:'PGRST301'}],[401,{message:'Invalid API key'}],[403,null],[404,{code:'PGRST202'}],[200,false],[503,{}]])assert.equal(classifyApiResponse(status,body).ok,false);
 const config={url:'https://example.test',key:key('anon',120)};
 await assert.rejects(()=>checkSupabase(config,async()=>{throw Error('network down');}),/network/);
 await assert.rejects(()=>checkSupabase({}));
 await assert.rejects(()=>checkSupabase(config,async()=>new Response(JSON.stringify({code:'PGRST301'}),{status:401})),/JWT/);
 assert.equal((await checkSupabase(config,async()=>new Response(JSON.stringify({code:'42501'}),{status:401}))).ok,true);
});
test('staged secret scan handles large source files and never prints matched credentials',async()=>{
 const script=resolve('scripts/check-secrets.mjs');
 const folder=await mkdtemp(join(tmpdir(),'nptc-secret-scan-'));
 try {
  execFileSync('git',['init','-q'],{cwd:folder});
  await writeFile(join(folder,'large.ts'),'// safe source\n'.repeat(100000));execFileSync('git',['add','large.ts'],{cwd:folder});
  let result=spawnSync(process.execPath,[script,'--staged'],{cwd:folder,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const token=key('service_role',120);await writeFile(join(folder,'large.ts'),'// safe source\n'.repeat(100000)+token);execFileSync('git',['add','large.ts'],{cwd:folder});
  result=spawnSync(process.execPath,[script,'--staged'],{cwd:folder,encoding:'utf8'});assert.equal(result.status,1);assert.ok(!`${result.stdout}${result.stderr}`.includes(token));assert.ok(result.stderr.includes('large.ts'));
 } finally {
  assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('nptc-secret-scan-'));await rm(folder,{recursive:true,force:true});
 }
});
