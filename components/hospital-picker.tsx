import { useState } from 'react';
import { Input } from '@/components/ui/input';
export type Hospital = { name: string; city: string; level: string };
export function HospitalPicker({ defaultValue, hospitals, loading, disabled = false }: { defaultValue: string; hospitals: Hospital[]; loading: boolean; disabled?: boolean }) {
  const [query,setQuery] = useState(defaultValue);
  const [selected,setSelected] = useState(defaultValue);
  const options = hospitals.filter(item=>`${item.name}${item.city}${item.level}`.includes(query)).slice(0,8);
  return <label className="hospital-picker">服務醫院／機構<Input disabled={disabled} name="hospitalQuery" value={query} onChange={event=>{setQuery(event.target.value);setSelected('');}} placeholder="輸入醫院或縣市關鍵字搜尋" autoComplete="off"/><input type="hidden" name="hospital" value={selected} disabled={disabled}/>{loading && <small>正在載入官方醫院名冊…</small>}{!disabled && query && !selected && !loading && <div className="hospital-options">{options.length ? options.map(item=><button type="button" key={`${item.city}-${item.name}`} onClick={()=>{setSelected(item.name);setQuery(item.name);}}>{item.name}<small>{item.city} · {item.level}</small></button>) : <p>找不到相符醫院，請調整關鍵字後再試。</p>}</div>}{!disabled && selected && <small>已選擇：{selected}</small>}</label>;
}
