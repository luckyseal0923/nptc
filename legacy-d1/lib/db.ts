import {env} from 'cloudflare:workers';
export function db(){return (env as unknown as {DB:D1Database}).DB;}
export function teacherEmails(){return ((env as unknown as {TEACHER_EMAILS?:string}).TEACHER_EMAILS??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);}
