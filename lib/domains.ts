export const DOMAINS = [
  { key: 'currentHistory', label: '現在病史' },
  { key: 'pastHistory', label: '過去病史' },
  { key: 'ros', label: 'ROS' },
  { key: 'physicalExam', label: '身體評估' },
  { key: 'differentialDiagnosis', label: '鑑別診斷' },
] as const;
export type DomainKey = typeof DOMAINS[number]['key'];
export type DomainValues = Record<DomainKey, number>;
const validNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-7;
export function readDomains(value: unknown): DomainValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== DOMAINS.length || !DOMAINS.every(d => validNumber(data[d.key]))) return null;
  return Object.fromEntries(DOMAINS.map(d => [d.key,data[d.key]])) as DomainValues;
}
export const domainTotal = (values: DomainValues) => Math.round(DOMAINS.reduce((sum,d)=>sum+values[d.key],0)*100)/100;
export function validateDomainMax(value: unknown): DomainValues {
  const result = readDomains(value);
  if (!result || DOMAINS.some(d=>result[d.key]<=0) || domainTotal(result)!==100) throw new Error('五個面向滿分都須大於 0，最多兩位小數，合計必須為 100 分。');
  return result;
}
export function validateDomainScores(value: unknown, maximum: unknown): DomainValues {
  const max = validateDomainMax(maximum), scores = readDomains(value);
  if (!scores || DOMAINS.some(d=>scores[d.key]<0 || scores[d.key]>max[d.key])) throw new Error('請完整填寫五個面向得分（最多兩位小數），各項須介於 0 與該面向滿分之間。');
  return scores;
}
export function radarValues(value: unknown, maximum: unknown): number[] | null {
  try { const max=validateDomainMax(maximum),scores=validateDomainScores(value,max); return DOMAINS.map(d=>scores[d.key]/max[d.key]*5); } catch { return null; }
}
export function domainFormValues(fields: FormData, prefix: string): DomainValues | null {
  const values=DOMAINS.map(d=>String(fields.get(`${prefix}_${d.key}`) ?? '').trim());
  if (values.every(v=>v==='')) return null;
  if (values.some(v=>v==='')) throw new Error('請完整填寫五個面向，或將五個面向全部留空。');
  return Object.fromEntries(DOMAINS.map((d,i)=>[d.key,Number(values[i])])) as DomainValues;
}
