import { pathToFileURL } from 'node:url';
import { publicEnv } from './env.mjs';
import { inspectPublicKey } from './check-public-key.mjs';
export function classifyApiResponse(status, body) {
  if ([401, 403].includes(status) && body?.code === '42501') return { ok: true, message: '匿名請求已因資料權限被拒絕（42501）。' };
  if (body?.code === 'PGRST202' || status === 404) return { ok: false, message: 'RPC 不存在或資料庫尚未安裝。' };
  if ([401, 403].includes(status)) return { ok: false, message: '金鑰、JWT 或閘道驗證失敗；不能視為權限檢查通過。' };
  return { ok: false, message: `非預期 API 回應（HTTP ${status}），請核對服務及權限設定。` };
}
export async function checkSupabase({ url, key }, request = fetch) {
  if (!url || !key) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY。');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('API 必須使用 HTTPS。');
  inspectPublicKey(key);
  const response = await request(`${parsed.origin}/rest/v1/rpc/nptc_is_teacher`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(12000),
  });
  const result = classifyApiResponse(response.status, await response.json().catch(() => null));
  if (!result.ok) throw new Error(result.message);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`PASS: ${(await checkSupabase(publicEnv())).message}`); }
  catch (error) { console.error(`API 檢查未通過：${error.message}`); process.exitCode = 1; }
}
