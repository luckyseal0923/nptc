import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { RosterSort } from '@/lib/roster-sort';

export function RosterSortSelect({ value, onChange }: { value: RosterSort; onChange: (value: RosterSort) => void }) {
  const ascending = value === 'stroke-asc';
  const descending = value === 'stroke-desc';
  const label = ascending ? '目前依姓氏筆畫由少到多；點擊改為由多到少' : descending ? '目前依姓氏筆畫由多到少；點擊改為由少到多' : '點擊後依姓氏筆畫由少到多排序';
  return <button type="button" className={`roster-sort-button${value === 'original' ? '' : ' active'}`} aria-label={label} title={label} onClick={() => onChange(ascending ? 'stroke-desc' : 'stroke-asc')}>
    <span>姓名</span>
    {ascending ? <ArrowUp size={16} aria-hidden="true" /> : descending ? <ArrowDown size={16} aria-hidden="true" /> : <ArrowUpDown size={16} aria-hidden="true" />}
  </button>;
}
