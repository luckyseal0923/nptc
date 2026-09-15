export type RosterSort = 'original' | 'stroke-asc' | 'stroke-desc';
const strokeCollator = new Intl.Collator('zh-Hant-TW-u-co-stroke');

export function sortRoster<T extends { name: string }>(students: T[], order: RosterSort): T[] {
  if (order === 'original') return students;
  const direction = order === 'stroke-asc' ? 1 : -1;
  return [...students].sort((a, b) => direction * strokeCollator.compare(a.name.trim(), b.name.trim()));
}
