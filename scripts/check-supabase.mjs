import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const content = readFileSync(file, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, '$1');
      env[key] = val;
    }
  }
  return env;
}

const envLocal = loadEnvFile(resolve(process.cwd(), '.env.local'));
const envDefault = loadEnvFile(resolve(process.cwd(), '.env'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || envDefault.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY || envDefault.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('ℹ 尚未設定 Supabase 環境變數（可於 .env.local 中設定 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY）。');
  process.exit(0);
}

console.log(`🔍 檢查 Supabase 設定：`);
try {
  const parsedUrl = new URL(url);
  console.log(`- API URL 格式正確: ${parsedUrl.origin}`);
} catch {
  console.error(`❌ API URL 格式無效: ${url}`);
  process.exit(1);
}

const maskedKey = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
console.log(`- Anon Key: ${maskedKey}`);

try {
  const resp = await fetch(`${url}/rest/v1/rpc/nptc_is_teacher`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  console.log(`- 未登入呼叫 nptc_is_teacher HTTP 狀態碼: ${resp.status}`);
  if (resp.status === 401 || resp.status === 403) {
    console.log('✔ 安全性驗證成功：未登入請求已被 Supabase 正確拒絕。');
  } else if (resp.status === 404 || resp.status === 400) {
    console.log('ℹ 注意：RPC 可能尚未於 Supabase SQL Editor 執行安裝。');
  } else {
    console.log(`- 回應狀態: ${resp.statusText}`);
  }
} catch (err) {
  console.log(`ℹ 無法連線至 Supabase: ${err.message}`);
}
