import type { SurveyAssignment, SurveyDefinition, SurveyScores, SurveyAnswer } from './surveys';

export type SurveyAnalysisWorkshop = { id: string; name: string; archived_at?: string | null };
export type SurveyAnalysisStudent = { id: string; workshop_id: string; name: string; identity: string };
export type SurveyAnalysisResponse = { assignment_id: string; student_id: string; identity: string; submitted_at: string; answers: SurveyAnswer[]; scores: SurveyScores };
export type SurveyAnalysisData = { includesArchived: boolean; workshops: SurveyAnalysisWorkshop[]; students: SurveyAnalysisStudent[]; assignments: SurveyAssignment[]; responses: SurveyAnalysisResponse[] };
export type SurveyPerson = { identity: string; names: string; studentIds: string[]; workshopIds: string[] };
export type SurveyTrendPoint = { id: string; label: string; date: string; workshop: string; value: number | null; count: number };
export const scaleKey = (a: Pick<SurveyAssignment, 'scale_code' | 'scale_version'>) => JSON.stringify([a.scale_code, a.scale_version]);
export const dimensionLabel = (name: string) => name === 'flexibility' ? '思考彈性' : name === 'structure' ? '記憶中的知識結構' : name;
export function metricValue(scores: SurveyScores, metric: string): number | null {
  const name = metric.startsWith('dimension:') ? metric.slice(10) : metric;
  const value = metric === 'total' ? scores.total : scores.dimensions?.[name] ?? (name === 'flexibility' ? scores.flexibility : name === 'structure' ? scores.structure : undefined);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function metricRange(definition: SurveyDefinition, metric: string) {
  const name = metric.startsWith('dimension:') ? metric.slice(10) : metric;
  const count = metric === 'total' ? definition.items.length : definition.dimensions?.[name]?.length ?? definition.items.length;
  return { min: count * (definition.minScore ?? 1), max: count * (definition.maxScore ?? 6) };
}
export function orderedAssignments(assignments: SurveyAssignment[]) {
  // Equal timestamps retain the supplied publication order; UUID order is not chronology.
  return [...assignments].sort((a, b) => (Date.parse(a.created_at ?? '') || 0) - (Date.parse(b.created_at ?? '') || 0));
}
export function surveyPeople(data: SurveyAnalysisData, assignments: SurveyAssignment[]): SurveyPerson[] {
  const workshops = new Set(assignments.map(a => a.workshop_id));
  const assignmentIds = new Set(assignments.map(a => a.id));
  const groups = new Map<string, { names: Set<string>; students: Set<string>; workshops: Set<string> }>();
  const add = (identity: string, s: SurveyAnalysisStudent) => {
    const group = groups.get(identity) ?? { names: new Set<string>(), students: new Set<string>(), workshops: new Set<string>() };
    group.names.add(s.name); group.students.add(s.id); group.workshops.add(s.workshop_id); groups.set(identity, group);
  };
  data.students.filter(s => workshops.has(s.workshop_id)).forEach(s => add(s.identity, s));
  // A historical response keeps its original account identity even if an account is later replaced.
  data.responses.filter(r => assignmentIds.has(r.assignment_id)).forEach(r => { const s = data.students.find(s => s.id === r.student_id); if (s) add(r.identity, s); });
  return [...groups].map(([identity, group]) => ({ identity, names: [...group.names].join('／'), studentIds: [...group.students], workshopIds: [...group.workshops] })).sort((a, b) => a.names.localeCompare(b.names, 'zh-Hant-TW-u-co-stroke') || a.identity.localeCompare(b.identity));
}
export function surveyTrend(data: SurveyAnalysisData, assignments: SurveyAssignment[], people: SurveyPerson[], metric: string): SurveyTrendPoint[] {
  const identities = new Set(people.map(p => p.identity));
  return orderedAssignments(assignments).map((a, i) => {
    const values = data.responses.filter(r => r.assignment_id === a.id && identities.has(r.identity)).map(r => metricValue(r.scores, metric)).filter((n): n is number => n !== null);
    return { id: a.id, label: a.note || `第 ${i + 1} 次發布`, date: a.created_at ?? '', workshop: data.workshops.find(w => w.id === a.workshop_id)?.name ?? '', value: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null, count: values.length };
  });
}
