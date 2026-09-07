import {createClient} from '@supabase/supabase-js';
export const supabase=createClient(import.meta.env.SUPABASE_URL,import.meta.env.SUPABASE_KEY);
export async function rpc<T>(name:string,args:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 let query=supabase.rpc(name,args);if(signal)query=query.abortSignal(signal);
 const {data,error}=await query;
 if(error){if(signal?.aborted)throw new DOMException('Aborted','AbortError');throw new Error(error.code==='PGRST202'?'資料庫尚未完成設定，請聯絡管理員。':error.message);}
 return data as T;
}
