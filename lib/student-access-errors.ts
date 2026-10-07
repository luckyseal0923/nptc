import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

// 公開頁只提供操作引導，不回傳帳號查詢結果或伺服器的原始錯誤。
export function studentActivationError(error: unknown): string {
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response | undefined)?.status;
    if (status === 429) return '操作過於頻繁，請稍後再試；已有帳號者可直接登入或使用忘記密碼。';
    if (status === 400 || status === 409) {
      return '帳號建立未完成。請核對名冊中的姓名、Email 與完整手機號碼；若曾使用本平台，請改用學員登入或忘記密碼。';
    }
    return '帳號建立服務暫時無法使用，請稍後重試或聯絡管理員。';
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return '目前無法連線至帳號建立服務，請確認網路後重試；若持續失敗，請聯絡管理員。';
  }
  return '帳號建立服務暫時無法使用，請稍後重試或聯絡管理員。';
}
