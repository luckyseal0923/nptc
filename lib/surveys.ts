export type SurveyPhase = 'pre' | 'post';
export type SurveyStatus = 'draft' | 'open' | 'closed';
export type SurveyAvailability = 'open' | 'submitted' | 'closed' | 'scheduled' | 'expired';
export type SurveyItem = { text?: string; left?: string; right?: string };
export type SurveyDefinition = { code: string; version: string; title: string; notice: string; instructions: string[]; items: SurveyItem[]; minScore?: number; maxScore?: number; leftLabel?: string; rightLabel?: string; reverseItems?: number[]; dimensions?: Record<string, number[]> };
export type SurveyInstrument = { code: string; version: string; definition: SurveyDefinition };
export type SurveyAssignment = {
  id: string; workshop_id: string; note: string; created_at?: string; phase?: SurveyPhase; status: SurveyStatus; revision: number;
  scale_code: string; scale_version: string; opens_at: string | null; closes_at: string | null;
  definition: SurveyDefinition; submitted_count?: number; availability?: SurveyAvailability; submitted_at?: string | null;
};
export type SurveySummary = Pick<SurveyAssignment, 'id' | 'workshop_id'> & { title: string; created_at: string; availability: SurveyAvailability; submitted_at: string | null };
export type SurveyScores = { total: number; flexibility?: number; structure?: number; dimensions?: Record<string, number>; itemScores: number[] };
export type SurveyResponse = { assignment_id: string; student_id: string; note?: string; phase?: SurveyPhase; scale_code: string; scale_version: string; submitted_at: string; answers: number[]; scores: SurveyScores };
export type SurveyExport = { workshop: { id: string; name: string }; participants: string[]; responses: SurveyResponse[] };
export const phaseLabel = (phase: SurveyPhase) => phase === 'pre' ? '前測' : '後測';
export const availabilityLabel: Record<SurveyAvailability, string> = { open: '開放填答', submitted: '已完成', closed: '已關閉', scheduled: '尚未開始', expired: '已截止' };
export function validateSurveyAnswers(value: unknown, count = 14, min = 1, max = 6): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== count || value.some(n => !Number.isInteger(n) || n < min || n > max)) throw new Error(`請完成每一題，並選擇 ${min}–${max} 的其中一個數字。`);
}
export function surveyLink(id: string) { return `?survey=${encodeURIComponent(id)}`; }
export function formatSurveyTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '未設定';
}
export function taipeiInput(value: string | null) {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function taipeiToUtc(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('請填寫完整的臺灣日期與時間。');
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || taipeiInput(date.toISOString()) !== value) throw new Error('日期與時間不正確。');
  return date.toISOString();
}
function csvCell(value: string | number | null) {
  let s = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@\-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
const csv = (rows: (string | number | null)[][]) => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
export function surveyResponsesCsv(data: SurveyExport) {
  const count = Math.max(0, ...data.responses.map(r => r.answers.length));
  const scoreDimensions = (r: SurveyResponse): Record<string, number> => {
    if (r.scores.dimensions) return r.scores.dimensions;
    const values: Record<string, number> = {};
    if (r.scores.flexibility !== undefined) values.flexibility = r.scores.flexibility;
    if (r.scores.structure !== undefined) values.structure = r.scores.structure;
    return values;
  };
  const dimensions = [...new Set(data.responses.flatMap(r => Object.keys(scoreDimensions(r))))];
  const headers = ['梯次編號', '學員代碼', '問卷發布編號', '量表', '版本', '教師備註', '提交時間UTC', ...Array.from({ length: count }, (_, i) => `Q${i + 1}_原答`), ...Array.from({ length: count }, (_, i) => `Q${i + 1}_換算`), ...dimensions.map(d => `構面_${d}`), '總分'];
  return csv([headers, ...data.responses.map(r => [data.workshop.id, r.student_id, r.assignment_id, r.scale_code, r.scale_version, r.note ?? '', r.submitted_at, ...Array.from({ length: count }, (_, i) => r.answers[i] ?? null), ...Array.from({ length: count }, (_, i) => r.scores.itemScores[i] ?? null), ...dimensions.map(d => scoreDimensions(r)[d] ?? null), r.scores.total])]);
}
export function surveyPairsCsv(data: SurveyExport) {
  const headers = ['梯次編號', '學員代碼', '量表', '版本', '配對狀態', '前測總分', '後測總分', '總分差', '前測思考彈性', '後測思考彈性', '思考彈性差', '前測知識結構', '後測知識結構', '知識結構差'];
  const versions = new Set(data.responses.map(r => `${r.scale_code}|${r.scale_version}`));
  const rows: (string | number | null)[][] = [];
  for (const id of data.participants) for (const key of versions) {
    const [code, version] = key.split('|');
    const records = data.responses.filter(r => r.student_id === id && r.scale_code === code && r.scale_version === version);
    const pre = records.find(r => r.phase === 'pre'), post = records.find(r => r.phase === 'post');
    const delta = (field: 'total' | 'flexibility' | 'structure') => { const before = pre?.scores[field], after = post?.scores[field]; return before !== undefined && after !== undefined ? after - before : null; };
    rows.push([data.workshop.id, id, code, version, pre && post ? '已配對' : pre ? '僅前測' : post ? '僅後測' : '未填答', pre?.scores.total ?? null, post?.scores.total ?? null, delta('total'), pre?.scores.flexibility ?? null, post?.scores.flexibility ?? null, delta('flexibility'), pre?.scores.structure ?? null, post?.scores.structure ?? null, delta('structure')]);
  }
  return csv([headers, ...rows]);
}
export function downloadSurveyCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
