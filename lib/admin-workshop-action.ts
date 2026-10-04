import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function adminWorkshopAction(
  action: 'archive' | 'delete',
  workshop: { id: string; name: string },
  email: string,
  password: string,
): Promise<void> {
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError || !current.user) throw new Error('登入狀態已失效，請重新登入後臺。');
  if (email.trim().toLowerCase() !== current.user.email?.toLowerCase()) {
    throw new Error('請輸入目前登入的系統管理者帳號。');
  }
  const verification = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verification.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session || data.user.id !== current.user.id) {
    throw new Error('帳號或密碼驗證失敗，請重新確認。');
  }
  const rpcName = action === 'archive' ? 'nptc_set_workshop_archived' : 'nptc_delete_archived_workshop';
  const body = action === 'archive'
    ? { workshopId: workshop.id, archived: true }
    : { workshopId: workshop.id, name: workshop.name };
  const response = await fetch(`${import.meta.env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.SUPABASE_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.message === 'string' ? result.message : '操作失敗，請稍後再試。');
  }
}
