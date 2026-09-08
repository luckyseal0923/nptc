import { computeThreshold, DEFAULT_STATIONS, STATIONS, type StationDefinition } from './grading';

export const DEMO_MODE = true;

type DemoRole = 'teacher' | 'student';
type DemoUser = { role: DemoRole; username: string; email: string };
type Workshop = { id: string; name: string; published: number; publishedStations?: string[]; created_at: string; stations: StationDefinition[] };
type Student = Record<string, string | number | null> & {
  id: string;
  workshop_id: string;
  name: string;
  email: string;
  phone: string;
  nursing_years?: number | null;
  hospital?: string | null;
  unit?: string | null;
  exam_specialty?: string | null;
  first_osce?: boolean | null;
  birth_date?: string | null;
  revision: number;
  updated_at: string;
};
type State = { workshops: Workshop[]; students: Student[] };

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
      { ...DEFAULT_STATIONS[0], title: '初步評估與處置', testDate: '2026-09-01', complaint: '胸痛', diagnosis: '急性冠心症', prompt: '依個案主訴完成初步評估、臨床推理與處置說明。' },
      { ...DEFAULT_STATIONS[1], title: '溝通與衛教', testDate: '2026-09-01', complaint: '胸痛', diagnosis: '急性冠心症', prompt: '以病人可理解的方式說明評估結果與後續處置。' },
      { ...DEFAULT_STATIONS[2], title: '病況辨識', testDate: '2026-09-02', complaint: '呼吸困難', diagnosis: '肺炎', prompt: '辨識關鍵臨床線索，提出優先處置與追蹤計畫。' },
      { ...DEFAULT_STATIONS[3], title: '整合照護', testDate: '2026-09-02', complaint: '發燒', diagnosis: '敗血症', prompt: '整合病史、檢查與照護需求，完成臨床決策。' },
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

export async function demoRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const user = requireUser();
  if (name === 'nptc_is_teacher') return (user.role === 'teacher') as T;
  const data = state();
  if (name === 'nptc_teacher_data') {
    requireTeacher();
    const requested = args.requested_workshop as string | null | undefined;
    const selected = data.workshops.find(item => item.id === requested) ?? data.workshops[0] ?? null;
    const students = selected ? data.students.filter(item => item.workshop_id === selected.id).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')) : [];
    return { workshops: data.workshops, selected, students, thresholds: selected ? thresholds(students, selected.stations) : [] } as T;
  }
  if (name === 'nptc_student_data') {
    const records = data.students.filter(item => item.email === user.email).map(student => {
      const workshop = data.workshops.find(item => item.id === student.workshop_id)!;
      const visibleStations = workshop.stations.filter((station) => (workshop.publishedStations ?? (workshop.published ? workshop.stations.map((item) => item.key) : [])).includes(station.key));
      const published = visibleStations.length ? 1 : 0;
      return {
        id: student.id, name: student.name, email: student.email, phone: student.phone, workshopName: workshop.name, published,
        profile: { nursingYears: student.nursing_years ?? null, hospital: student.hospital ?? '', unit: student.unit ?? '', examSpecialty: student.exam_specialty ?? '', firstOsce: student.first_osce ?? null, birthDate: student.birth_date ?? '' },
        stations: visibleStations,
        updatedAt: published ? student.updated_at : null,
        grades: published ? visibleStations.map(({ key }) => ({ key, score: student[`${key}_score`] ?? null, rating: student[`${key}_rating`] ?? null, feedback: student[`${key}_feedback`] ?? '' })) : [],
        thresholds: published ? thresholds(data.students.filter(item => item.workshop_id === workshop.id), visibleStations) : [],
      };
    });
    return { records } as T;
  }
  if (name === 'nptc_teacher_batch_scores' || name === 'nptc_teacher_batch_scores_v2') {
    const teacher = requireTeacher();
    const body = args.body as { workshopId?: string; station?: string; items?: Array<{ id: string; revision: number; score: number | null; rating: number | null; feedback: string }> };
    const workshop = data.workshops.find((item) => item.id === body.workshopId);
    if (!workshop || workshop.published) throw new Error('請先撤回公布，再修改成績。');
    if (!workshop.stations.some((item) => item.key === body.station) || !body.items?.length) throw new Error('請選擇題目與至少一位學員。');
    for (const item of body.items) {
      const student = data.students.find((value) => value.id === item.id && value.workshop_id === workshop.id);
      if (!student || student.revision !== item.revision) throw new Error('資料已更新，請重新載入後再編輯。');
      if ((item.score === null) !== (item.rating === null) || (item.score !== null && (!Number.isFinite(item.score) || item.score < 0 || item.score > 100 || !Number.isInteger(item.rating) || item.rating! < 1 || item.rating! > 5))) throw new Error('分數與 Global Rating 請成對填寫，分數為 0–100、Rating 為 1–5。');
      if (item.feedback.length > 500) throw new Error('質性回饋最多 500 字。');
      student[`${body.station}_score`] = item.score; student[`${body.station}_rating`] = item.rating; student[`${body.station}_feedback`] = item.feedback;
      student.revision += 1; student.updated_at = new Date().toISOString(); student.updated_by = teacher.email;
    }
    save(data); return { ok: true } as T;
  }
  if (name === 'nptc_student_update_profile') {
    const body = args.body as { nursingYears?: number; hospital?: string; unit?: string; examSpecialty?: string; firstOsce?: boolean; birthDate?: string };
    if (!Number.isInteger(body.nursingYears) || body.nursingYears! < 0 || body.nursingYears! > 60 || !body.hospital?.trim() || !body.unit?.trim() || !body.examSpecialty?.trim() || typeof body.firstOsce !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate ?? '')) throw new Error('請完整填寫個人資料。');
    data.students.filter((student) => student.email === user.email).forEach((student) => Object.assign(student, { nursing_years: body.nursingYears, hospital: body.hospital!.trim(), unit: body.unit!.trim(), exam_specialty: body.examSpecialty!.trim(), first_osce: body.firstOsce, birth_date: body.birthDate }));
    save(data); return { ok: true } as T;
  }
  if (name !== 'nptc_teacher_write' && name !== 'nptc_teacher_save_stations' && name !== 'nptc_teacher_publish_station') throw new Error('不支援的展示資料操作。');
  const teacher = requireTeacher();
  const body = args.body as Record<string, unknown>;
  const action = body.action as string;
  const now = new Date().toISOString();
  if (action === 'createWorkshop') {
    const name = String(body.name ?? '').trim(); if (!name) throw new Error('請輸入梯次名稱。');
    const id = crypto.randomUUID(); data.workshops.unshift({ id, name, published: 0, created_at: now, stations: structuredClone(DEFAULT_STATIONS) }); save(data); return { id } as T;
  }
  const workshop = data.workshops.find(item => item.id === body.workshopId);
  if (!workshop) throw new Error('找不到此梯次。');
  if (action === 'publish') {
    const published = Boolean(body.published);
    if (published && !data.students.some(item => item.workshop_id === workshop.id && workshop.stations.some(({ key }) => item[`${key}_score`] !== null))) throw new Error('至少登錄一筆成績後才能公布。');
    workshop.published = published ? 1 : 0; save(data); return { ok: true } as T;
  }
  if (workshop.published) throw new Error('請先撤回公布，再修改名冊或成績。');
  const id = body.id as string | undefined;
  const current = id ? data.students.find(item => item.id === id && item.workshop_id === workshop.id) : undefined;
  if (id && (!current || current.revision !== body.revision)) throw new Error('資料已更新，請重新載入後再編輯。');
  if (action === 'deleteStudent') { data.students = data.students.filter(item => item !== current); save(data); return { ok: true } as T; }
  if (action === 'saveStations') {
    const stations = body.stations as StationDefinition[];
    if (!Array.isArray(stations) || !stations.length) throw new Error('請至少新增一題 OSCE 題目。');
    workshop.stations = stations.map((station, index) => { const title = String(station?.title ?? '').trim(), testDate = String(station?.testDate ?? ''), complaint = String(station?.complaint ?? '').trim(), diagnosis = String(station?.diagnosis ?? '').trim(), prompt = String(station?.prompt ?? '').trim(); if (!station?.key || !title || !testDate || !complaint || !diagnosis || !prompt) throw new Error('每題都必須完成題目名稱、測驗日期、個案主訴、最終診斷與命題內容摘要。'); return { key: String(station.key), title, testDate, complaint, diagnosis, prompt }; });
    save(data); return { ok: true } as T;
  }
  if (action === 'publishStation') {
    const station = String(body.station ?? ''); const published = Boolean(body.published);
    if (!workshop.stations.some((item) => item.key === station)) throw new Error('找不到指定題目。');
    if (published && !data.students.some((item) => item.workshop_id === workshop.id && item[`${station}_score`] !== null && item[`${station}_score`] !== undefined)) throw new Error('本題至少要有一筆已登錄成績才能公布。');
    const visible = new Set(workshop.publishedStations ?? []); published ? visible.add(station) : visible.delete(station); workshop.publishedStations = [...visible]; save(data); return { ok: true } as T;
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
  if (action === 'saveScores' && current) {
    const grades = body.grades as Record<string, { score: number | null; rating: number | null }>;
    for (const { key } of STATIONS) { current[`${key}_score`] = grades[key].score; current[`${key}_rating`] = grades[key].rating; }
    current.revision += 1; current.updated_at = now; current.updated_by = teacher.email; save(data); return { ok: true } as T;
  }
  throw new Error('不支援的操作。');
}
