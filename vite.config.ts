import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import {defineConfig} from 'vite';
import {sites} from '@openai/sites-vite-plugin';
export default defineConfig(async()=>{
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const {cloudflare}=await import('@cloudflare/vite-plugin');
  return {css:{postcss:{plugins:[tailwindcss()]}},plugins:[vinext(),sites(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},config:{main:'vinext/server/fetch-handler',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'workshop-scores',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'drizzle'}]}})]};
});
