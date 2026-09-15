export type AnalysisStudent = { id: string; name: string; email: string; workshop_id: string; [key: string]: unknown };
export type AnalysisStation = { key: string; title: string; testDate?: string };
export type AnalysisWorkshop = { id: string; name: string; created_at: string; stations?: AnalysisStation[] };
export type AnalysisData = { workshops: AnalysisWorkshop[]; selected: AnalysisWorkshop | null; students: AnalysisStudent[]; thresholds: { key: string; value: number | null; count: number }[] };
export type Enrollment = { student: AnalysisStudent; workshop: AnalysisWorkshop; exams: Exam[]; identity: string };
export type Exam = { key: string; title: string; date: string; workshopId: string; workshopName: string; score: number | null; rating: number | null; threshold: number | null; feedback: string };
export type Dimension = 'hospital' | 'unit' | 'exam_specialty' | 'nursing_years' | 'first_osce';
export const dimensions: [Dimension, string][] = [['exam_specialty','報考科別'],['nursing_years','護理年資'],['hospital','服務醫院'],['unit','服務單位'],['first_osce','首次報考 OSCE']];
export const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const textValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '未填寫';
export const identityKey = (s: AnalysisStudent) => s.email?.trim() ? `email:${s.email.trim().toLowerCase()}` : `record:${s.id}`;
export function background(s: AnalysisStudent, key: Dimension): string {
  if (key === 'first_osce') return s.first_osce === true ? '首次報考' : s.first_osce === false ? '非首次報考' : '未填寫';
  if (key === 'nursing_years') { const n = numeric(s.nursing_years); return n === null ? '未填寫' : n < 5 ? '未滿 5 年' : n < 10 ? '5–9 年' : n < 20 ? '10–19 年' : '20 年以上'; }
  return textValue(s[key]);
}
export function enrollments(data: AnalysisData[]): Enrollment[] {
  return data.flatMap(d => {
    if (!d.selected) return [];
    const workshop = d.selected;
    return d.students.map(student => ({ student, workshop, identity: identityKey(student), exams: (workshop.stations ?? []).map(station => ({
      key: station.key, title: station.title || '未命名題目', date: station.testDate ?? '', workshopId: workshop.id, workshopName: workshop.name,
      score: numeric(student[`${station.key}_score`]), rating: numeric(student[`${station.key}_rating`]),
      threshold: numeric(d.thresholds.find(t => t.key === station.key)?.value), feedback: typeof student[`${station.key}_feedback`] === 'string' ? student[`${station.key}_feedback`] as string : '',
    })) }));
  });
}
export function statistics(exams: Exam[]) {
  const scored = exams.filter(e => e.score !== null);
  const comparable = scored.filter(e => e.threshold !== null);
  const passed = comparable.filter(e => e.score! >= e.threshold!).length;
  return { total: exams.length, scored: scored.length, missing: exams.length - scored.length,
    mean: scored.length ? scored.reduce((n,e) => n + e.score!,0) / scored.length : null,
    comparable: comparable.length, passed, passRate: comparable.length ? passed / comparable.length * 100 : null };
}
export function distribution(exams: Exam[]) {
  return [[0,59],[60,69],[70,79],[80,89],[90,100]].map(([min,max]) => ({ label: `${min}–${max}`, count: exams.filter(e => e.score !== null && e.score >= min && (max === 100 ? e.score <= max : e.score < max+1)).length }));
}
export function learners(rows: Enrollment[]) {
  const grouped = new Map<string, Enrollment[]>();
  rows.forEach(r => grouped.set(r.identity, [...(grouped.get(r.identity) ?? []), r]));
  return [...grouped].map(([identity, records]) => ({ identity, records, names: [...new Set(records.map(r=>r.student.name))].join('／'), email: records[0].student.email, stats: statistics(records.flatMap(r=>r.exams)) }));
}
export function timeline(rows: Enrollment[], identity: string) {
  return rows.filter(r=>r.identity === identity).flatMap(r=>r.exams).sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || a.workshopName.localeCompare(b.workshopName,'zh-TW') || a.key.localeCompare(b.key));
}
// 全部梯次必須成功才交付統計，避免把局部載入誤當成完整資料。
export async function loadAnalysis(fetchData: (id?: string) => Promise<AnalysisData>): Promise<AnalysisData[]> {
  const first = await fetchData();
  if (!first.selected) return [];
  const output = [first];
  const pending = first.workshops.filter(w=>w.id !== first.selected!.id);
  for (let i=0; i<pending.length; i+=4) {
    output.push(...await Promise.all(pending.slice(i,i+4).map(async w => {
      const data = await fetchData(w.id);
      if (data.selected?.id !== w.id) throw new Error('梯次資料已變動，請重新載入分析。');
      return data;
    })));
  }
  return output;
}
