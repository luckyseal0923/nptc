import {loadEnvFile} from 'node:process';
loadEnvFile('.env.local');
const base=process.env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/$/,'');
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
for(const path of ['/auth/v1/settings','/rest/v1/','/rest/v1/rpc/nptc_is_teacher']){
 try{const r=await fetch(base+path,{method:path.includes('/rpc/')?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(path.includes('/rpc/')?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type');let code;try{const j=await r.json();code=j.code??j.error_code??(j.external?'auth-settings':j.swagger?'openapi':null);}catch{}console.log(JSON.stringify({path,status:r.status,contentType:type,code}));}catch(e){console.log(JSON.stringify({path,error:e.name}));}
}
