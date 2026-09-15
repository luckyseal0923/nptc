import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { RosterSort } from '@/lib/roster-sort';

export function RosterSortSelect({ value, onChange }: { value: RosterSort; onChange: (value: RosterSort) => void }) {
  return <div className="flex flex-wrap items-center gap-2"><span>姓名</span>
    <NativeSelect size="sm" aria-label="姓氏筆畫排序" value={value} onChange={event => onChange(event.target.value as RosterSort)}>
      <NativeSelectOption value="original">原本順序</NativeSelectOption>
      <NativeSelectOption value="stroke-asc">姓氏筆畫：少 → 多</NativeSelectOption>
      <NativeSelectOption value="stroke-desc">姓氏筆畫：多 → 少</NativeSelectOption>
    </NativeSelect>
  </div>;
}
