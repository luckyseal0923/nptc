import { useState } from 'react';
import { DOMAINS, domainTotal, readDomains, validateDomainMax, type DomainValues } from '@/lib/domains';
import { Input } from '@/components/ui/input';
import '@/app/domain-scores.css';

export function DomainMaxFields({ stationKey, maximum }: { stationKey: string; maximum: unknown }) {
  const initial=readDomains(maximum);
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(DOMAINS.map(d=>[d.key,initial ? String(initial[d.key]) : ''])));
  const complete=DOMAINS.every(d=>values[d.key]!==''),total=complete ? domainTotal(Object.fromEntries(DOMAINS.map(d=>[d.key,Number(values[d.key])])) as DomainValues) : null;
  return <div className="domain-max-fields"><h3>五大面向配分</h3><p>填寫各面向滿分，合計須為 100 分；已有分項成績後即不可變更配分。</p><div>{DOMAINS.map(d=><label key={d.key}>{d.label}滿分<Input type="number" name={`${stationKey}_max_${d.key}`} min="0.01" max="100" step="0.01" value={values[d.key]} onChange={e=>setValues({...values,[d.key]:e.target.value})} /></label>)}</div><output aria-live="polite">滿分合計：{total===null?'尚未完整填寫':`${total} / 100 分`}</output></div>;
}
export function DomainGradeFields({ studentId, studentName, stationKey, scores, maximum, legacyScore }: { studentId:string; studentName:string;stationKey:string;scores:unknown;maximum:unknown;legacyScore:unknown }) {
  const initial=readDomains(scores);
  let max:DomainValues|null=null;try{max=validateDomainMax(maximum);}catch{}
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(DOMAINS.map(d=>[d.key,initial ? String(initial[d.key]) : ''])));
  const complete=DOMAINS.every(d=>values[d.key]!==''),total=complete ? domainTotal(Object.fromEntries(DOMAINS.map(d=>[d.key,Number(values[d.key])])) as DomainValues) : null;
  return <div className="domain-grade-fields">{DOMAINS.map(d=><label key={d.key} className="domain-grade-field"><span>{d.label}</span><Input aria-label={`${studentName} ${d.label}得分`} name={`${studentId}_${stationKey}_domain_${d.key}`} type="number" min="0" max={max?.[d.key]} step="0.01" disabled={!max} value={values[d.key]} onChange={e=>setValues({...values,[d.key]:e.target.value})}/><small>滿分 {max?.[d.key] ?? '未設定'}</small></label>)}<div className="domain-total-field"><span>總得分</span><output className="domain-total" aria-label={`${studentName}總得分`} aria-live="polite">{total===null?'—':total}</output><small>自動加總 / 100</small>{!initial && typeof legacyScore==='number' && <small>原總分 {legacyScore}；尚無分項</small>}</div></div>;
}
