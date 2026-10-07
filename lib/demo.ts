import { domainTotal, validateDomainMax, validateDomainScores, type DomainValues } from './domains';
import { REQUIRED_SCHEMA_VERSION } from './schema';
import { computeThreshold, DEFAULT_STATIONS, type StationDefinition } from './grading';

// 正式模式：所有名冊、題目與成績都由 Supabase 儲存。
export const DEMO_MODE = false;

type DemoRole = 'teacher' | 'student';
type DemoUser = { role: DemoRole; username: string; email: string };
type Workshop = { id: string; name: string; published: number; stations_revision?: number; publishedStations?: string[]; created_at: string; stations: StationDefinition[] };
type Student = Record<string, unknown> & {
  id: string;
  workshop_id: string;
  name: string;
  email: string;
  phone: string;
  service_kind?: string;
  nursing_years?: number | null;
  hospital?: string | null;
  unit?: string | null;
  exam_specialty?: string | null;
  first_osce?: boolean | null;
  birth_date?: string | null;
  revision: number;
  updated_at: string;
};
type State = { workshops: Workshop[]; students: Student[]; createRequests?: Record<string,{ id: string; name: string }> };

const storageKey = 'nptc-demo-state-v1';
const sessionKey = 'nptc-demo-user-v1';
const accounts: Record<DemoRole, DemoUser & { password: string }> = {
  teacher: { role: 'teacher', username: 'teacher', email: 'teacher-demo@example.test', password: 'demo1234' },
  student: { role: 'student', username: 'student', email: 'student-demo@example.test', password: 'demo1234' },
};

function initialState(): State {
  const now = new Date().toISOString();
  return {
    workshops: [{ id: 'demo-workshop', name: '示範 OSCE 班', published: 0, publishedStations: ['q1','q2','q3','q4'], created_at: now, stations: [
      { key: 'q1', title: '初步評估與處置', testDate: '2026-09-01', complaint: '胸痛', diagnosis: '急性冠心症', prompt: '依個案主訴完成初步評估、臨床推理與處置說明。' },
      { key: 'q2', title: '溝通與衛教', testDate: '2026-09-01', complaint: '胸痛', diagnosis: '急性冠心症', prompt: '以病人可理解的方式說明評估結果與後續處置。' },
      { key: 'q3', title: '病況辨識', testDate: '2026-09-02', complaint: '呼吸困難', diagnosis: '肺炎', prompt: '辨識關鍵臨床線索，提出優先處置與追蹤計畫。' },
      { key: 'q4', title: '整合照護', testDate: '2026-09-02', complaint: '發燒', diagnosis: '敗血症', prompt: '整合病史、檢查與照護需求，完成臨床決策。' },
    ] }],
    students: [{
      id: 'demo-student', workshop_id: 'demo-workshop', name: '示範學員', email: accounts.student.email,
      phone: '0912345678', revision: 0, q1_score: 72, q1_rating: 3, q1_feedback: '評估方向清楚，可再補充鑑別診斷依據。', q2_score: 65, q2_rating: 3, q2_feedback: '',
      q3_score: 78, q3_rating: 4, q4_score: 58, q4_rating: 2, updated_at: now, updated_by: accounts.teacher.email,
    }],
  };
}

function state(): State {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return initialState();
    const parsed = JSON.parse(saved) as State;
    parsed.students.forEach((student) => {
      if (!student.phone) student.phone = '0912345678';
    });
    return parsed;
  } catch { return initialState(); }
}
function save(next: State) { localStorage.setItem(storageKey, JSON.stringify(next)); }
function thresholds(students: Student[], stations: StationDefinition[]) {
  return stations.map(({ key }) => {
    const grades = students.map(student => ({ score: student[`${key}_score`] as number | null, rating: student[`${key}_rating`] as number | null }));
    return { key, ...computeThreshold(grades) };
  });
}

export function demoUser(): DemoUser | null {
  try { const value = localStorage.getItem(sessionKey); return value ? JSON.parse(value) as DemoUser : null; } catch { return null; }
}
export function signInDemo(role: DemoRole, username: string, password: string) {
  const account = accounts[role];
  if (username !== account.username || password !== account.password) throw new Error('帳號或密碼不正確。');
  const user: DemoUser = { role: account.role, username: account.username, email: account.email };
  localStorage.setItem(sessionKey, JSON.stringify(user));
}
export function signInDemoStudent(email: string, phone: string) {
  const student = state().students.find((item) => item.email === email.trim().toLowerCase() && item.phone === phone.trim().replace(/[\s-]/g, ''));
  if (!student) throw new Error('找不到相符的學員資料，請確認 Email 與手機電話。');
  const user: DemoUser = { role: 'student', username: student.email, email: student.email };
  localStorage.setItem(sessionKey, JSON.stringify(user));
}
export function signOutDemo() { localStorage.removeItem(sessionKey); }

function requireUser() { const user = demoUser(); if (!user) throw new Error('請先登入。'); return user; }
function requireTeacher() { const user = requireUser(); if (user.role !== 'teacher') throw new Error('此帳號沒有老師權限。'); return user; }
async function hospitalDirectory(): Promise<{ hospitals: { name: string; city: string; level: string }[] }> {
  const response = await fetch(`${import.meta.env?.BASE_URL || '/'}data/accredited-hospitals.json`);
  if (!response.ok) throw new Error('官方醫院名冊暫時無法載入。');
  return response.json();
}

export async function demoRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const user = requireUser();
  if (name === 'nptc_is_teacher') return (user.role === 'teacher') as T;
  if (name === 'nptc_schema_version') return REQUIRED_SCHEMA_VERSION as T;
  if (name === 'nptc_hospital_directory') return await hospitalDirectory() as T;
  if (name === 'nptc_sync_student_email') return { ok: true } as T;
  if (name === 'nptc_is_account_reviewer') return false as T;
  const data = state();
  if (name === 'nptc_teacher_data' || name === 'nptc_analysis_data') {
    requireTeacher();
    const requested = args.requested_workshop as string | null | undefined;
    const selected = data.workshops.find(item => item.id === requested) ?? data.workshops[0] ?? null;
    const students = selected ? data.students.filter(item => item.workshop_id === selected.id).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')) : [];
    return { includesArchived: false, workshops: data.workshops, selected, students, thresholds: selected ? thresholds(students, selected.stations) : [] } as T;
  }
  if (name === 'nptc_student_data') {
    const records = data.students.filter(item => item.email === user.email).map(student => {
      const workshop = data.workshops.find(item => item.id === student.workshop_id)!;
      const visibleStations = workshop.stations.filter((station) => (workshop.publishedStations ?? (workshop.published ? workshop.stations.map((item) => item.key) : [])).includes(station.key));
      const published = visibleStations.length ? 1 : 0;
      return {
        id: student.id, name: student.name, email: student.email, phone: student.phone, workshopName: workshop.name, archived: false, published,
        profile: { serviceKind: student.service_kind ?? 'hospital', nursingYears: student.nursing_years ?? null, hospital: student.hospital ?? '', unit: student.unit ?? '', examSpecialty: student.exam_specialty ?? '', firstOsce: student.first_osce ?? null, birthDate: student.birth_date ?? '' },
        stations: visibleStations,
        updatedAt: published ? student.updated_at : null,
        grades: published ? visibleStations.map(({ key }) => ({ key, score: student[`${key}_score`] ?? null, rating: student[`${key}_rating`] ?? null, feedback: student[`${key}_feedback`] ?? '', domains: student[`${key}_domains`] ?? null })) : [],
        thresholds: published ? thresholds(data.students.filter(item => item.workshop_id === workshop.id), visibleStations) : [],
      };
    });
    return { records } as T;
  }
  if (name === 'nptc_teacher_batch_scores' || name === 'nptc_teacher_batch_scores_v2' || name === 'nptc_teacher_batch_scores_v3') {
    const teacher = requireTeacher();
    const body = args.body as { workshopId?: string; station?: string; items?: Array<{ id: string; revision: number; score: number | null; rating: number | null; feedback: string; domains?: DomainValues | null }> };
    const workshop = data.workshops.find((item) => item.id === body.workshopId);
    if (!workshop || workshop.published) throw new Error('請先撤回公布，再修改成績。');
    if (!workshop.stations.some((item) => item.key === body.station) || !body.items?.length) throw new Error('請選擇題目與至少一位學員。');
    const definition=workshop.stations.find(item=>item.key===body.station)!;
    if(workshop.publishedStations?.includes(definition.key))throw new Error('請先撤回本題公告。');
    validateDomainMax(definition.domainMax);
    for (const item of body.items) {
      if(item.domains===undefined)throw new Error('請使用五面向成績表。');
      item.score=item.domains===null ? null : domainTotal(validateDomainScores(item.domains,definition.domainMax));
      const student = data.students.find((value) => value.id === item.id && value.workshop_id === workshop.id);
      if (!student || student.revision !== item.revision) throw new Error('資料已更新，請重新載入後再編輯。');
      if ((item.score === null) !== (item.rating === null) || (item.score !== null && (!Number.isFinite(item.score) || item.score < 0 || item.score > 100 || !Number.isInteger(item.rating) || item.rating! < 1 || item.rating! > 5))) throw new Error('分數與 Global Rating 請成對填寫，分數為 0–100、Rating 為 1–5。');
      if (item.feedback.length > 500) throw new Error('質性回饋最多 500 字。');
      student[`${body.station}_domains`] = item.domains; student[`${body.station}_score`] = item.score; student[`${body.station}_rating`] = item.rating; student[`${body.station}_feedback`] = item.feedback;
      student.revision += 1; student.updated_at = new Date().toISOString(); student.updated_by = teacher.email;
    }
    save(data); return { ok: true } as T;
  }
  if (name === 'nptc_student_update_profile') {
    const body = args.body as { serviceKind?: string; nursingYears?: number; hospital?: string; unit?: string; examSpecialty?: string; firstOsce?: boolean; birthDate?: string };
    if (!Number.isInteger(body.nursingYears) || body.nursingYears! < 0 || body.nursingYears! > 60 || !body.hospital?.trim()  || !body.examSpecialty?.trim() || typeof body.firstOsce !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate ?? '')) throw new Error('請完整填寫個人資料。');
    data.students.filter((student) => student.email === user.email).forEach((student) => Object.assign(student, { service_kind: body.serviceKind ?? 'hospital', nursing_years: body.nursingYears, hospital: body.hospital!.trim(), unit: body.unit!.trim(), exam_specialty: body.examSpecialty!.trim(), first_osce: body.firstOsce, birth_date: body.birthDate }));
    if ((!body.serviceKind || body.serviceKind === 'hospital') && !(await hospitalDirectory()).hospitals.some(h=>h.name===body.hospital)) throw new Error('請從目前的官方醫院名冊選擇服務醫院。');
    if (body.birthDate! > new Date().toISOString().slice(0,10) || body.birthDate! < '1900-01-01' || !['內科','精神科','兒科','外科','婦產科','麻醉科','家庭科'].includes(body.examSpecialty!)) throw new Error('請確認出生年月日與科別。');
    save(data); return { ok: true } as T;
  }
  if (name !== 'nptc_teacher_write' && name !== 'nptc_teacher_save_stations' && name !== 'nptc_teacher_save_stations_v3' && name !== 'nptc_teacher_publish_station') throw new Error('不支援的展示資料操作。');
  const teacher = requireTeacher();
  const body = args.body as Record<string, unknown>;
  const action = name.includes('save_stations') ? 'saveStations' : name === 'nptc_teacher_publish_station' ? 'publishStation' : body.action as string;
  if (action === 'publish' || action === 'saveScores') throw new Error('請使用逐題公布與五面向成績表。');
  const now = new Date().toISOString();
  if (action === 'createWorkshop') {
    const name = String(body.name ?? '').trim(); if (!name) throw new Error('請輸入梯次名稱。');
    if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)) throw new Error('請重新載入後建立梯次。');
    const previous = data.createRequests?.[body.requestId];
    if (previous) { if(previous.name!==name)throw new Error('建立請求的名稱不同，請重新整理。'); return { id: previous.id } as T; }
    const id = crypto.randomUUID(); data.createRequests ??= {}; data.createRequests[body.requestId] = { id, name }; data.workshops.unshift({ id, name, stations_revision: 0, published: 0, created_at: now, stations: structuredClone(DEFAULT_STATIONS) }); save(data); return { id } as T;
  }
  const workshop = data.workshops.find(item => item.id === body.workshopId);
  if (!workshop) throw new Error('找不到此梯次。');
  const visibleStations = new Set(workshop.publishedStations ?? (workshop.published ? workshop.stations.map(s=>s.key) : []));
  if (['saveStudent','deleteStudent','bulkImportStudents'].includes(action) && visibleStations.size) throw new Error('請先撤回本梯次所有題目公告，再修改名冊。');
  const id = body.id as string | undefined;
  const current = id ? data.students.find(item => item.id === id && item.workshop_id === workshop.id) : undefined;
  if (id && (!current || current.revision !== body.revision)) throw new Error('資料已更新，請重新載入後再編輯。');
  if (action === 'deleteStudent') { data.students = data.students.filter(item => item !== current); save(data); return { ok: true } as T; }
  if (action === 'saveStations') {
    if (body.stationsRevision !== (workshop.stations_revision ?? 0)) throw new Error('題目設定已更新，請重新載入後再編輯。');
    const stations = body.stations as StationDefinition[];
    for (const previous of workshop.stations) {
      const next=stations?.find(s=>s.key===previous.key);
      if(visibleStations.has(previous.key) && JSON.stringify(previous)!==JSON.stringify(next)) throw new Error('請先撤回本題公告，再修改題目。');
      if(!next && data.students.some(s=>s.workshop_id===workshop.id && (s[`${previous.key}_score`]!=null || !!s[`${previous.key}_feedback`]))) throw new Error('有成績、回饋或已公告的題目不可刪除。');
    }
    if (new Set(stations?.map(s=>s.key)).size !== stations?.length) throw new Error('題目代碼不可重複。');
    if (!Array.isArray(stations) || !stations.length) throw new Error('請至少新增一題 OSCE 題目。');
    workshop.stations = stations.map((station, index) => { const title = String(station?.title ?? '').trim(), testDate = String(station?.testDate ?? ''), complaint = String(station?.complaint ?? '').trim(), diagnosis = String(station?.diagnosis ?? '').trim(), prompt = String(station?.prompt ?? '').trim(); if (!station?.key || !title || !testDate || !complaint || !diagnosis || !prompt) throw new Error('每題都必須完成題目名稱、測驗日期、個案主訴、最終診斷與命題內容摘要。'); const previous=workshop.stations.find(s=>s.key===station.key); const domainMax=station.domainMax ? validateDomainMax(station.domainMax) : undefined; if(!domainMax && (!previous?.title || previous.domainMax))throw new Error('請填寫五面向滿分。'); if(JSON.stringify(previous?.domainMax)!==JSON.stringify(domainMax) && data.students.some(s=>s.workshop_id===workshop.id && s[`${station.key}_domains`]))throw new Error('已有分項成績，不能變更配分。'); return { key: String(station.key), title, testDate, complaint, diagnosis, prompt, ...(domainMax ? {domainMax} : {}) }; });
    workshop.stations_revision=(workshop.stations_revision ?? 0)+1;
    save(data); return { ok: true } as T;
  }
  if (action === 'publishStation') {
    const station = String(body.station ?? ''); const published = Boolean(body.published);
    if (!workshop.stations.some((item) => item.key === station)) throw new Error('找不到指定題目。');
    if (published && !data.students.some((item) => item.workshop_id === workshop.id && item[`${station}_score`] !== null && item[`${station}_score`] !== undefined)) throw new Error('本題至少要有一筆已登錄成績才能公布。');
    const visible = visibleStations; published ? visible.add(station) : visible.delete(station); workshop.publishedStations = [...visible]; workshop.published=0; workshop.stations_revision=(workshop.stations_revision ?? 0)+1; save(data); return { ok: true } as T;
  }
  if (action === 'bulkImportStudents') {
    const rows = body.students as Array<{ name?: string; email?: string; phone?: string }>;
    if (!Array.isArray(rows) || !rows.length) throw new Error('請至少提供一位學員。');
    const existing = data.students.filter(item => item.workshop_id === workshop.id);
    const seenEmails = new Set(existing.map(item => item.email));
    const seenPhones = new Set(existing.map(item => item.phone));
    const next = rows.map(row => ({ name: String(row.name ?? '').trim(), email: String(row.email ?? '').trim().toLowerCase(), phone: String(row.phone ?? '').trim().replace(/[\s-]/g, '') }));
    for (const row of next) {
      if (!row.name || !row.email || !/^09\d{8}$/.test(row.phone) || !/^\S+@\S+\.\S+$/.test(row.email)) throw new Error('匯入資料需包含有效的姓名、Email 與手機電話。');
      if (seenEmails.has(row.email) || seenPhones.has(row.phone)) throw new Error(`Email 或手機電話重複：${row.email}`);
      seenEmails.add(row.email); seenPhones.add(row.phone);
    }
    data.students.push(...next.map(row => ({ id: crypto.randomUUID(), workshop_id: workshop.id, ...row, revision: 0, q1_score: null, q1_rating: null, q2_score: null, q2_rating: null, q3_score: null, q3_rating: null, q4_score: null, q4_rating: null, updated_at: now, updated_by: teacher.email })));
    save(data); return { ok: true } as T;
  }
  if (action === 'saveStudent') {
    const name = String(body.name ?? '').trim(), email = String(body.email ?? '').trim().toLowerCase(), phone = String(body.phone ?? '').trim().replace(/[\s-]/g, '');
    if (!name || !email || !/^09\d{8}$/.test(phone)) throw new Error('請完整填寫有效的姓名、Email 與手機電話。');
    if (data.students.some(item => item !== current && item.workshop_id === workshop.id && (item.email === email || item.phone === phone))) throw new Error('此梯次已有相同的 Email 或手機電話。');
    if (current) { Object.assign(current, { name, email, phone, revision: current.revision + 1, updated_at: now, updated_by: teacher.email }); }
    else data.students.push({ id: crypto.randomUUID(), workshop_id: workshop.id, name, email, phone, revision: 0, q1_score: null, q1_rating: null, q2_score: null, q2_rating: null, q3_score: null, q3_rating: null, q4_score: null, q4_rating: null, updated_at: now, updated_by: teacher.email });
    save(data); return { ok: true } as T;
  }
  throw new Error('不支援的操作。');
}
