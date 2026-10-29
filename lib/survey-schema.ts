import { rpc } from './supabase';
export const REQUIRED_SURVEY_SCHEMA_VERSION = 2026103001;
export async function requireSurveySchema(signal?: AbortSignal) {
  const version = await rpc<number>('nptc_schema_version', {}, signal);
  if (version < REQUIRED_SURVEY_SCHEMA_VERSION) throw new Error('量表功能的資料庫尚未更新，請聯絡系統管理者；OSCE 成績功能仍可使用。');
}
