import { computeThreshold, STATIONS } from './grading';

export const DEMO_MODE = true;

type DemoRole = 'teacher' | 'student';
type DemoUser = { role: DemoRole; username: string; email: string };
type Workshop = { id: string; name: string; published: number; created_at: string };
type Student = Record<string, string | number | null> & {
  id: string;
  workshop_id: string;
  name: string;
  email: string;
  code: string;
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
    workshops: [{ id: 'demo-workshop', name: '示範 OSCE 班', published: 1, created_at: now }],
    students: [{
      id: 'demo-student', workshop_id: 'demo-workshop', name: '示範學員', email: accounts.student.email,
      code: 'DEMO001', revision: 0, q1_score: 72, q1_rating: 3, q2_score: 65, q2_rating: 3,
      q3_score: 78, q3_rating: 4, q4_score: 58, q4_rating: 2, updated_at: now, updated_by: accounts.teacher.email,
    }],
  };
}

function state(): State {
  try { const saved = localStorage.getItem(storageKey); return saved ? JSON.parse(saved) as State : initialState(); } catch { return initialState(); }
}
function save(next: State) { localStorage.setItem(storageKey, JSON.stringify(next)); }
function thresholds(students: Student[]) {
  return STATIONS.map(({ key }) => {
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
    const students = selected ? data.students.filter(item => item.workshop_id === selected.id).sort((a, b) => a.code.localeCompare(b.code)) : [];
    return { workshops: data.workshops, selected, students, thresholds: selected ? thresholds(students) : [] } as T;
  }
  if (name === 'nptc_student_data') {
    const records = data.students.filter(item => item.email === user.email).map(student => {
      const workshop = data.workshops.find(item => item.id === student.workshop_id)!;
      const published = workshop.published;
      return {
        id: student.id, name: student.name, code: student.code, workshopName: workshop.name, published,
        updatedAt: published ? student.updated_at : null,
        grades: published ? STATIONS.map(({ key }) => ({ key, score: student[`${key}_score`], rating: student[`${key}_rating`] })) : [],
        thresholds: published ? thresholds(data.students.filter(item => item.workshop_id === workshop.id)) : [],
      };
    });
    return { records } as T;
  }
  if (name !== 'nptc_teacher_write') throw new Error('不支援的展示資料操作。');
  const teacher = requireTeacher();
  const body = args.body as Record<string, unknown>;
  const action = body.action as string;
  const now = new Date().toISOString();
  if (action === 'createWorkshop') {
    const name = String(body.name ?? '').trim(); if (!name) throw new Error('請輸入梯次名稱。');
    const id = crypto.randomUUID(); data.workshops.unshift({ id, name, published: 0, created_at: now }); save(data); return { id } as T;
  }
  const workshop = data.workshops.find(item => item.id === body.workshopId);
  if (!workshop) throw new Error('找不到此梯次。');
  if (action === 'publish') {
    const published = Boolean(body.published);
    if (published && !data.students.some(item => item.workshop_id === workshop.id && STATIONS.some(({ key }) => item[`${key}_score`] !== null))) throw new Error('至少登錄一筆成績後才能公布。');
    workshop.published = published ? 1 : 0; save(data); return { ok: true } as T;
  }
  if (workshop.published) throw new Error('請先撤回公布，再修改名冊或成績。');
  const id = body.id as string | undefined;
  const current = id ? data.students.find(item => item.id === id && item.workshop_id === workshop.id) : undefined;
  if (id && (!current || current.revision !== body.revision)) throw new Error('資料已更新，請重新載入後再編輯。');
  if (action === 'deleteStudent') { data.students = data.students.filter(item => item !== current); save(data); return { ok: true } as T; }
  if (action === 'saveStudent') {
    const name = String(body.name ?? '').trim(), email = String(body.email ?? '').trim().toLowerCase(), code = String(body.code ?? '').trim();
    if (!name || !email || !code) throw new Error('請完整填寫姓名、Email 與學號。');
    if (data.students.some(item => item !== current && item.workshop_id === workshop.id && (item.email === email || item.code === code))) throw new Error('此梯次已有相同的學號或 Email。');
    if (current) { Object.assign(current, { name, email, code, revision: current.revision + 1, updated_at: now, updated_by: teacher.email }); }
    else data.students.push({ id: crypto.randomUUID(), workshop_id: workshop.id, name, email, code, revision: 0, q1_score: null, q1_rating: null, q2_score: null, q2_rating: null, q3_score: null, q3_rating: null, q4_score: null, q4_rating: null, updated_at: now, updated_by: teacher.email });
    save(data); return { ok: true } as T;
  }
  if (action === 'saveScores' && current) {
    const grades = body.grades as Record<string, { score: number | null; rating: number | null }>;
    for (const { key } of STATIONS) { current[`${key}_score`] = grades[key].score; current[`${key}_rating`] = grades[key].rating; }
    current.revision += 1; current.updated_at = now; current.updated_by = teacher.email; save(data); return { ok: true } as T;
  }
  throw new Error('不支援的操作。');
}
