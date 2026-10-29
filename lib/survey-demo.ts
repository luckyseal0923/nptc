import definition from './dti-sk.json';
import vpirsDefinition from './vpirs-e.json';
import satisfactionDefinition from './learning-satisfaction.json';
import { scoreSurvey } from './survey-scoring';
import { validateSurveyResponse, type SurveyAssignment, type SurveyDefinition, type SurveyInstrument, type SurveyResponse } from './surveys';

type Context = { user: { role: string; email: string }; workshops: { id: string; name: string; archived_at?: string | null }[]; students: { id: string; workshop_id: string; email: string; name: string }[] };
type DemoResponse = SurveyResponse & { requestId: string; userEmail: string };
type StoredAssignment = SurveyAssignment & { requestId?: string; createdBy?: string };
type State = { library: SurveyInstrument[]; assignments: StoredAssignment[]; responses: DemoResponse[] };
const key = 'nptc-surveys-demo-v1';
const publicDefinition = (d: SurveyDefinition) => { const { reverseItems: _reverse, dimensions: _dimensions, negativeItems: _negative, ...visible } = d; return visible; };

export function demoSurveyRpc(name: string, args: Record<string, unknown>, ctx: Context) {
  const stored = localStorage.getItem(key);
  const data: State = stored ? JSON.parse(stored) : { library: [], assignments: [], responses: [] };
  let migrated = false;
  if (!data.library?.length) { data.library = [{ code: definition.code, version: definition.version, definition }]; migrated = true; }
  if (!data.library.some(i => i.code === vpirsDefinition.code && i.version === vpirsDefinition.version)) {
    data.library.push({ code: vpirsDefinition.code, version: vpirsDefinition.version, definition: vpirsDefinition }); migrated = true;
  }
  if (!data.library.some(i => i.code === satisfactionDefinition.code && i.version === satisfactionDefinition.version)) {
    data.library.push({ code: satisfactionDefinition.code, version: satisfactionDefinition.version, definition: satisfactionDefinition as SurveyDefinition }); migrated = true;
  }
  data.assignments.forEach(a => {
    if (a.note === undefined) { a.note = a.phase === 'pre' ? '前測' : a.phase === 'post' ? '後測' : ''; delete a.phase; migrated = true; }
    if (!a.created_at) { a.created_at = new Date().toISOString(); migrated = true; }
  });
  const save = () => localStorage.setItem(key, JSON.stringify(data));
  if (migrated) save();
  const body = (args.body ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const teacher = () => { if (ctx.user.role !== 'teacher') throw new Error('此帳號沒有量表管理權限。'); };
  const workshopId = String(args.requested_workshop ?? body.workshopId ?? '');
  const requireWorkshop = (id: string, write = false) => { const workshop = ctx.workshops.find(w => w.id === id); if (!workshop || write && workshop.archived_at) throw new Error('找不到可修改的梯次，或梯次已封存。'); return workshop; };
  if (name === 'nptc_survey_library') { teacher(); return { instruments: data.library }; }
  if (name === 'nptc_survey_analysis_workshops') { teacher(); return { includesArchived: false, workshops: ctx.workshops.filter(w => !w.archived_at) }; }
  if (name === 'nptc_survey_response_detail') {
    teacher();
    const a = data.assignments.find(a => a.id === args.requested_assignment); if (!a) throw new Error('找不到問卷。'); requireWorkshop(a.workshop_id);
    const r = data.responses.find(r => r.assignment_id === a.id && r.student_id === args.requested_student); if (!r) throw new Error('找不到這筆作答。');
    return { ...r, identity: `email:${r.userEmail.trim().toLowerCase()}` };
  }
  if (name === 'nptc_survey_analysis' || name === 'nptc_survey_analysis_summary') {
    teacher();
    const requested = args.requested_workshop ? String(args.requested_workshop) : null;
    if (requested) requireWorkshop(requested);
    const workshops = ctx.workshops.filter(w => !w.archived_at);
    const ids = new Set(workshops.filter(w => !requested || w.id === requested).map(w => w.id));
    const assignments = data.assignments.filter(a => ids.has(a.workshop_id));
    const students = ctx.students.filter(s => ids.has(s.workshop_id)).map(s => ({ id: s.id, workshop_id: s.workshop_id, name: s.name, identity: `email:${s.email.trim().toLowerCase()}` }));
    const responses = data.responses.filter(r => assignments.some(a => a.id === r.assignment_id)).map(r => ({ assignment_id: r.assignment_id, student_id: r.student_id, identity: `email:${r.userEmail.trim().toLowerCase()}`, submitted_at: r.submitted_at, answers: r.answers, scores: r.scores }));
    return { includesArchived: false, workshops, assignments, students, responses: name === 'nptc_survey_analysis_summary' ? responses.map(({ answers: _answers, ...r }) => r) : responses };
  }
  if (name === 'nptc_survey_library_save') throw new Error('目前暫不提供新增或修訂量表，請使用量表庫中的既有內容。');
  if (name === 'nptc_survey_delete_info' || name === 'nptc_survey_delete') {
    teacher();
    const id = String(args.requested_assignment ?? body.id ?? '');
    const assignment = data.assignments.find(a => a.id === id);
    if (!assignment) throw new Error('問卷已刪除或不存在，請更新發布紀錄。');
    requireWorkshop(assignment.workshop_id, name === 'nptc_survey_delete');
    const count = data.responses.filter(r => r.assignment_id === id).length;
    if (name === 'nptc_survey_delete_info') return { id, title: assignment.definition.title, revision: assignment.revision, responseCount: count };
    if (body.revision !== assignment.revision) throw new Error('問卷設定已變更，請重新讀取刪除資訊。');
    if (body.expectedResponses !== count) throw new Error('作答筆數已變更，請重新讀取刪除資訊並確認影響範圍。');
    if (count > 0) {
      if (body.acknowledgeDataLoss !== true) throw new Error('請確認永久刪除這些作答與分數。');
      if (String(body.demoEmail ?? '').trim().toLowerCase() !== ctx.user.email.toLowerCase() || body.demoPassword !== 'demo1234') throw new Error('管理員帳號或密碼驗證失敗。');
    }
    data.responses = data.responses.filter(r => r.assignment_id !== id);
    data.assignments = data.assignments.filter(a => a.id !== id);
    save(); return { ok: true, deletedResponses: count };
  }
  if (['nptc_survey_teacher_data', 'nptc_survey_export', 'nptc_survey_assign'].includes(name)) { teacher(); requireWorkshop(workshopId, name === 'nptc_survey_assign'); }
  if (name === 'nptc_survey_create_pair') throw new Error('請從量表庫選擇量表並加入梯次。');
  if (name === 'nptc_survey_assign') {
    const instrument = data.library.find(i => i.code === body.scaleCode && i.version === body.scaleVersion);
    if (!instrument) throw new Error('找不到選擇的量表版本。');
    if (typeof body.requestId !== 'string' || !body.requestId) throw new Error('請重新選擇量表。');
    const note = String(body.note ?? '').trim(), status = body.status === 'draft' ? 'draft' : 'open';
    if (note.length > 2000) throw new Error('備註不可超過 2000 字。');
    const existing = data.assignments.find(a => a.requestId === body.requestId && a.createdBy === ctx.user.email);
    if (existing) {
      if (existing.workshop_id !== workshopId || existing.scale_code !== instrument.code || existing.scale_version !== instrument.version) throw new Error('這個加入請求已使用，請重新選擇量表。');
      return { ok: true, id: existing.id };
    }
    const assignment: StoredAssignment = { id: crypto.randomUUID(), workshop_id: workshopId, note, created_at: now, scale_code: instrument.code, scale_version: instrument.version, definition: structuredClone(instrument.definition), revision: 0, status, opens_at: null, closes_at: null, requestId: body.requestId, createdBy: ctx.user.email };
    data.assignments.push(assignment); save(); return { ok: true, id: assignment.id };
  }
  if (name === 'nptc_survey_update') {
    teacher(); const a = data.assignments.find(a => a.id === body.id);
    if (!a) throw new Error('找不到問卷。'); requireWorkshop(a.workshop_id, true);
    if (a.revision !== body.revision) throw new Error('問卷設定已更新，請重新讀取。');
    if (body.status !== 'open' && body.status !== 'closed') throw new Error('請選擇開放或關閉。');
    const opens = body.opensAt ? String(body.opensAt) : null, closes = body.closesAt ? String(body.closesAt) : null, note = String(body.note ?? a.note ?? '').trim();
    if (opens && closes && opens >= closes) throw new Error('截止時間須晚於開放時間。');
    if (note.length > 2000) throw new Error('備註不可超過 2000 字。');
    Object.assign(a, { status: body.status, note, opens_at: opens, closes_at: closes, revision: a.revision + 1 }); save(); return { ok: true };
  }
  if (name === 'nptc_survey_teacher_data') {
    const assignments = data.assignments.filter(a => a.workshop_id === workshopId);
    const responses = data.responses.filter(r => assignments.some(a => a.id === r.assignment_id));
    return { assignments: assignments.map(a => ({ ...a, submitted_count: responses.filter(r => r.assignment_id === a.id).length })), students: ctx.students.filter(s => s.workshop_id === workshopId).map(s => ({ id: s.id, name: s.name })), responses: responses.map(r => ({ assignment_id: r.assignment_id, student_id: r.student_id, submitted_at: r.submitted_at, scores: r.scores })) };
  }
  if (name === 'nptc_survey_export') return { workshop: ctx.workshops.find(w => w.id === workshopId), participants: ctx.students.filter(s => s.workshop_id === workshopId).map(s => s.id), responses: data.responses.filter(r => data.assignments.some(a => a.id === r.assignment_id && a.workshop_id === workshopId)).map(({ requestId: _id, userEmail: _email, phase: _phase, ...r }) => ({ ...r, note: data.assignments.find(a => a.id === r.assignment_id)?.note ?? '' })) };
  if (ctx.user.role !== 'student') throw new Error('請登出後使用本梯次學員的帳號與密碼登入。');
  const target = String(args.requested_assignment ?? body.assignmentId ?? '');
  const student = name === 'nptc_survey_student_data' ? ctx.students.find(s => s.id === args.requested_student && s.email === ctx.user.email) : ctx.students.find(s => s.email === ctx.user.email && data.assignments.some(a => a.id === target && a.workshop_id === s.workshop_id));
  if (!student) throw new Error('找不到本人的梯次名冊，請確認使用的是受邀學員帳號。');
  const availability = (a: SurveyAssignment) => {
    if (data.responses.some(r => r.assignment_id === a.id && r.student_id === student.id)) return 'submitted';
    if (a.status !== 'open' || ctx.workshops.find(w => w.id === a.workshop_id)?.archived_at) return 'closed';
    if (a.opens_at && now < a.opens_at) return 'scheduled';
    if (a.closes_at && now >= a.closes_at) return 'expired';
    return 'open';
  };
  if (name === 'nptc_survey_student_data') return { assignments: data.assignments.filter(a => a.workshop_id === student.workshop_id && a.status !== 'draft').map(a => ({ id: a.id, workshop_id: a.workshop_id, title: a.definition.title, created_at: a.created_at, availability: availability(a), submitted_at: data.responses.find(r => r.assignment_id === a.id && r.student_id === student.id)?.submitted_at ?? null })) };
  const a = data.assignments.find(a => a.id === target && a.status !== 'draft');
  if (!a) throw new Error('問卷尚未發布或連結無效。');
  if (name === 'nptc_survey_form') return { workshopName: ctx.workshops.find(w => w.id === a.workshop_id)?.name ?? '', assignment: { id: a.id, workshop_id: a.workshop_id, scale_code: a.scale_code, scale_version: a.scale_version, status: a.status, revision: a.revision, created_at: a.created_at, opens_at: a.opens_at, closes_at: a.closes_at, definition: publicDefinition(a.definition), availability: availability(a), submitted_at: data.responses.find(r => r.assignment_id === a.id && r.student_id === student.id)?.submitted_at ?? null } };
  if (name === 'nptc_survey_submit') {
    const existing = data.responses.find(r => r.assignment_id === a.id && r.student_id === student.id);
    if (existing) {
      if (existing.requestId === body.requestId && existing.userEmail === ctx.user.email && JSON.stringify(existing.answers) === JSON.stringify(body.answers) && a.scale_version === body.version) return { ok: true, submitted_at: existing.submitted_at };
      throw new Error('本次問卷已完成，原始作答不可覆寫。');
    }
    if (availability(a) !== 'open') throw new Error('問卷尚未開放、已關閉或已截止。');
    if (body.version !== a.scale_version) throw new Error('量表版本不符。');
    if (typeof body.requestId !== 'string' || !body.requestId) throw new Error('請重新開啟問卷後提交。');
    validateSurveyResponse(body.answers, a.definition);
    data.responses.push({ assignment_id: a.id, student_id: student.id, scale_code: a.scale_code, scale_version: a.scale_version, submitted_at: now, answers: body.answers, scores: scoreSurvey(a.definition, body.answers), requestId: body.requestId, userEmail: ctx.user.email });
    save(); return { ok: true, submitted_at: now };
  }
  throw new Error('不支援的量表操作。');
}
