import {getChatGPTUser} from '@/app/chatgpt-auth';
import {teacherEmails} from './db';
export async function identity(){const user=await getChatGPTUser();return user?{...user,email:user.email.trim().toLowerCase(),isTeacher:teacherEmails().includes(user.email.trim().toLowerCase())}:null;}
export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export async function requireTeacher(){const user=await identity();if(!user)throw new HttpError(401,'請先登入。');if(!user.isTeacher)throw new HttpError(403,'此帳號沒有老師權限。');return user;}
export function verifyWrite(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new HttpError(403,'請由本站頁面送出資料。');if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'請使用 JSON 格式。');}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
export function failure(error:unknown){if(error instanceof HttpError)return json({error:error.message},error.status);if(error instanceof Error&&/UNIQUE constraint/.test(error.message))return json({error:'此梯次已有相同的學號或 Email，請確認資料。'},409);return json({error:'目前無法完成操作，請稍後再試。'},500);}
