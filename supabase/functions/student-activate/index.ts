import { createClient } from 'npm:@supabase/supabase-js@2';

// 此檔僅在 Supabase Edge Runtime 執行；service role 不可放入前端。
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (request: Request) => {
 if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
 if (request.method !== 'POST') return reply(405, '不支援的操作。');
 try {
  const raw = await request.text();
  if (raw.length > 4096) return reply(400, '資料格式不正確。');
  const body = JSON.parse(raw);
  if (typeof body.name !== 'string' || body.name.length > 100 || typeof body.email !== 'string' || body.email.length > 254 ||
   typeof body.phone !== 'string' || !/^09\d{8}$/.test(body.phone) || typeof body.code !== 'string' || !/^[a-f0-9]{64}$/.test(body.code) ||
   typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return reply(400, '請完整填寫有效資料與至少八個字元的密碼。');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('nptc_consume_student_invitation', { body: { name: body.name.trim(), email: body.email.trim().toLowerCase(), phone: body.phone, code: body.code } });
  if (error) return reply(503, '啟用服務暫時無法使用，請聯絡管理員。');
  if (!data?.ok) return reply(400, '資料或啟用碼不符、已過期，或此帳號已存在。請確認或聯絡管理員。');
  // 僅建立新帳號；絕不覆寫既有帳號密碼或管理員權限。
  const { error: createError } = await admin.auth.admin.createUser({ email: data.email, password: body.password, email_confirm: true });
  if (createError) return reply(409, '帳號建立未完成。若帳號已存在請直接登入，否則請管理員重新產生啟用碼。');
  return reply(200, '帳號已建立，請登入完成個人資料。');
 } catch { return reply(400, '啟用未完成，請確認資料或聯絡管理員。'); }
});
