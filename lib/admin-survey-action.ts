import { createClient } from '@supabase/supabase-js';
import { DEMO_MODE } from './demo';
import { rpc, supabase } from './supabase';

export type SurveyDeletionRequest = { id: string; revision: number; expectedResponses: number; acknowledgeDataLoss: boolean };
export async function deleteSurveyWithPassword(body: SurveyDeletionRequest, email: string, password: string): Promise<void> {
  if (DEMO_MODE) { await rpc('nptc_survey_delete', { body: { ...body, demoEmail: email.trim(), demoPassword: password } }); return; }
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError || !current.user) throw new Error('登入已失效，請重新登入後臺。');
  if (email.trim().toLowerCase() !== current.user.email?.toLowerCase()) throw new Error('請輸入目前登入的管理員 Email。');
  const verification = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nptc-survey-confirm' } });
  try {
    const { data, error } = await verification.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session || data.user.id !== current.user.id) throw new Error('管理員帳號或密碼驗證失敗。');
    const response = await verification.rpc('nptc_survey_delete', { body });
    if (response.error) throw new Error(response.error.message);
  } finally { await verification.auth.signOut({ scope: 'local' }).catch(() => undefined); }
}
