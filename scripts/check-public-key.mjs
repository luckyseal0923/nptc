import { pathToFileURL } from 'node:url';
import { publicEnv } from './env.mjs';
export function inspectPublicKey(key, now = Date.now()) {
  if (!key) throw new Error('缺少公開 Supabase key。');
  if (key.startsWith('sb_publishable_')) return { type: 'publishable', daysRemaining: null, expiresAt: null };
  let payload;
  try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { throw new Error('公開 key 的 JWT 格式不正確。'); }
  if (payload.role !== 'anon') throw new Error('前端僅允許 anon 或 publishable key，禁止使用服務權限金鑰。');
  if (!Number.isFinite(payload.exp)) throw new Error('anon JWT 缺少有效的到期時間。');
  const daysRemaining = Math.floor((payload.exp * 1000 - now) / 86400000);
  if (daysRemaining < 7) throw new Error('anon JWT 已到期或不足 7 天，請依金鑰更新指引同步 API 與部署設定。');
  return { type: 'anon', daysRemaining, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = inspectPublicKey(publicEnv().key);
    console.log(JSON.stringify(result));
    if (result.daysRemaining !== null && result.daysRemaining <= 90) console.warn('::warning::公開 anon JWT 距到期不足 90 天，請依 docs/key-renewal.md 安排更新。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
