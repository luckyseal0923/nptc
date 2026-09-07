import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import {defineConfig,loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'NEXT_PUBLIC_SUPABASE_');
 const url=env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
 if(!url||!key)throw new Error('請在 .env.local 設定 Supabase URL 與 anon key。');
 if(new URL(url).protocol!=='https:')throw new Error('Supabase URL 必須使用 HTTPS。');
 const role=key.startsWith('eyJ')?JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role:null;
 if(!key.startsWith('sb_publishable_')&&role!=='anon')throw new Error('前端僅接受 publishable 或 anon key。');
 return {plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},css:{postcss:{plugins:[tailwindcss()]}},define:{'import.meta.env.SUPABASE_URL':JSON.stringify(url),'import.meta.env.SUPABASE_KEY':JSON.stringify(key)}};
});
