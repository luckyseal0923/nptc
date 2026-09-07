import { rpc } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from '@/components/link';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { STATIONS, formatScore, validateGrade, workshopStations, type Student, type StationDefinition, type StationKey, type Workshop, type Threshold } from '@/lib/grading';

type Data = { workshops: Workshop[]; selected: Workshop | null; students: Student[]; thresholds: Threshold[] };

export default function TeacherDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Student | null>(null);
  const [tab, setTab] = useState('roster');
  const [showCreate, setShowCreate] = useState(false);
  const [scoreStation, setScoreStation] = useState<StationKey>('q1');
  const stations = workshopStations(data?.selected);
  const selectedStation = stations.find((station) => station.key === scoreStation) ?? stations[0];
  const selectedThreshold = data?.thresholds.find((item) => item.key === scoreStation);

  async function load(id?: string, signal?: AbortSignal) {
    const result = await rpc<Data>('nptc_teacher_data', { requested_workshop: id ?? null }, signal);
    setData(result);
    setEditing(null);
    return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, []);
  async function changeWorkshop(id: string) {
    setBusy(true); setError(''); setMessage('');
    try { await load(id); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function save(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await rpc<{ id?: string }>('nptc_teacher_write', { body: { ...payload, workshopId: data?.selected?.id } });
      await load(result.id ?? data?.selected?.id);
      setMessage(success);
      return true;
    } catch (cause) { setError((cause as Error).message); return false; } finally { setBusy(false); }
  }
  async function deleteStudent(student: Student) {
    if (!window.confirm(`確定要刪除學員「${student.name}（${student.code}）」嗎？此操作無法復原。`)) return;
    await save({ action: 'deleteStudent', id: student.id, revision: student.revision }, `學員「${student.name}」已刪除。`);
  }
  function changeTab(next: string) {
    setTab(next); setEditing(null); setError(''); setMessage('');
  }

  if (!data) return <section className="portal-panel"><p>{error ? '資料載入失敗，請重試。' : '正在載入教學評量資料…'}</p>{error && <Button className="action" onClick={() => changeWorkshop('')}>重新載入</Button>}</section>;
  if (!data.selected) return <section className="empty-panel"><h2>先建立第一個工作坊梯次</h2><p>每個梯次會各自管理名冊、題目、成績與邊緣及格分數。</p></section>;

  return <>
    <header className="teacher-heading">
      <div><span className="section-label">TEACHING ASSESSMENT</span><h1>教學評量管理</h1><p>依序完成名冊、題目、評分與公布。</p></div>
      <Link href="/student/" className="text-link">查看學員專區 ↗</Link>
    </header>
    {error && <div role="alert" className="notice error">{error}</div>}
    {message && <div role="status" className="notice success">{message}</div>}

    <section className="teacher-commandbar">
      <label>目前梯次
        <NativeSelect aria-label="選擇工作坊梯次" value={data.selected.id} disabled={busy} onChange={(event) => changeWorkshop(event.target.value)}>
          {data.workshops.map((workshop) => <NativeSelectOption key={workshop.id} value={workshop.id}>{workshop.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <div className="command-summary"><span>本梯次學員 <strong>{data.students.length}</strong> 位</span><span className={data.selected.published ? 'published' : ''}>{data.selected.published ? '成績已公布' : '尚未公布'}</span></div>
      <Button className="action secondary" disabled={busy} onClick={() => setShowCreate((value) => !value)}>{showCreate ? '取消新增' : '建立新梯次'}</Button>
    </section>
    {showCreate && <form className="create-workshop-card" onSubmit={async (event) => {
      event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name');
      if (await save({ action: 'createWorkshop', name }, '新梯次已建立。')) { form.reset(); setShowCreate(false); }
    }}>
      <Input name="name" placeholder="例如：2026 秋季班" maxLength={100} required disabled={busy} />
      <Button className="action" type="submit" disabled={busy}>建立梯次</Button>
    </form>}

    <Tabs className="teacher-workflow-tabs" value={tab} onValueChange={(value) => changeTab(String(value))}>
      <TabsList className="dashboard-tabs teacher-tabs">
        <TabsTrigger value="roster" disabled={busy}>1　學員名冊</TabsTrigger>
        <TabsTrigger value="stations" disabled={busy}>2　題目設定</TabsTrigger>
        <TabsTrigger value="scores" disabled={busy}>3　成績登錄</TabsTrigger>
        <TabsTrigger value="publish" disabled={busy}>4　公布設定</TabsTrigger>
      </TabsList>

      <TabsContent value="roster">
        <section className="workflow-intro"><strong>第一步：建立本梯次名冊</strong><span>可逐筆新增，或直接從 Excel 貼上三欄資料。</span></section>
        <section className="data-panel import-panel">
          <div className="panel-heading"><div><h2>批次匯入學員</h2><p className="form-help">欄位順序：學號、姓名、Email。第一列欄名可保留。</p></div></div>
          <form onSubmit={async (event) => {
            event.preventDefault(); const form = event.currentTarget; const source = String(new FormData(form).get('rows') ?? '').trim();
            const rows = source.split(/\r?\n/).map((line) => line.split(/\t|,/).map((value) => value.trim())).filter((row) => row.some(Boolean));
            if (rows[0]?.[0]?.match(/學號|code/i)) rows.shift();
            if (!rows.length || rows.some((row) => row.length < 3)) { setError('請貼上每列皆含學號、姓名、Email 的資料。'); return; }
            if (await save({ action: 'bulkImportStudents', students: rows.map(([code, name, email]) => ({ code, name, email })) }, `已匯入 ${rows.length} 位學員。`)) form.reset();
          }}><fieldset disabled={busy || !!data.selected.published}><textarea name="rows" placeholder={'學號\t姓名\tEmail\nA001\t王小明\tstudent@example.com'} /><Button className="action" type="submit">批次匯入名冊</Button></fieldset></form>
        </section>
        <div className="roster-layout">
          <section className="data-panel"><div className="panel-heading"><h2>學員名冊</h2><span>{data.students.length} 位學員</span></div>
            {data.students.length ? <Table><TableHeader><TableRow><TableHead>學號</TableHead><TableHead>姓名 / 登入 Email</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{data.students.map((student) => <TableRow key={student.id}><TableCell>{student.code}</TableCell><TableCell>{student.name}<small className="cell-email">{student.email}</small></TableCell><TableCell><div className="table-actions"><Button className="action small secondary" disabled={busy || !!data.selected!.published} onClick={() => setEditing(student)}>編輯</Button><Button className="action small destructive" disabled={busy || !!data.selected!.published} onClick={() => deleteStudent(student)}>刪除</Button></div></TableCell></TableRow>)}</TableBody></Table> : <p className="empty-inline">尚無學員，請新增第一位學員。</p>}
          </section>
          <section className="data-panel"><h2>{editing ? '編輯學員' : '新增學員'}</h2><p className="form-help">此 Email 將作為學員正式登入帳號。</p>
            <form key={editing?.id ?? 'new'} className="entry-form" onSubmit={async (event) => {
              event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
              if (await save({ action: 'saveStudent', id: editing?.id, revision: editing?.revision, name: fields.get('name'), code: fields.get('code'), email: fields.get('email') }, '學員資料已儲存。')) form.reset();
            }}><fieldset disabled={busy || !!data.selected.published}><label>學號<Input name="code" defaultValue={editing?.code ?? ''} required maxLength={40} /></label><label>姓名<Input name="name" defaultValue={editing?.name ?? ''} required maxLength={100} /></label><label>登入 Email<Input name="email" type="email" defaultValue={editing?.email ?? ''} required maxLength={254} /></label><div className="form-actions"><Button className="action" type="submit">{busy ? '儲存中…' : '儲存學員資料'}</Button>{editing && <Button className="action secondary" type="button" onClick={() => setEditing(null)}>取消</Button>}</div></fieldset></form>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="stations">
        <section className="workflow-intro"><strong>第二步：設定四個 OSCE 站點</strong><span>每題填寫名稱與命題內容，供老師評分與學員回顧。</span></section>
        <section className="data-panel"><form key={data.selected.id} onSubmit={(event) => {
          event.preventDefault(); const fields = new FormData(event.currentTarget);
          const configured = stations.map((station): StationDefinition => ({ ...station, title: String(fields.get(`${station.key}_title`) ?? ''), prompt: String(fields.get(`${station.key}_prompt`) ?? '') }));
          save({ action: 'saveStations', stations: configured }, '四站題目設定已儲存。');
        }}><fieldset disabled={busy || !!data.selected.published}><div className="station-settings-grid">{stations.map((station) => <article className="station-setting" key={station.key}><span>第 {station.day} 天</span><label>題目名稱<Input name={`${station.key}_title`} defaultValue={station.title} required maxLength={100} /></label><label>命題內容<textarea name={`${station.key}_prompt`} defaultValue={station.prompt} maxLength={2000} placeholder="例如：個案情境、任務與評分重點" /></label></article>)}</div><Button type="submit" className="action">儲存題目設定</Button></fieldset></form></section>
      </TabsContent>

      <TabsContent value="scores">
        <section className="workflow-intro"><strong>第三步：選擇一站，再登錄該站成績</strong><span>固定及格線為 60 分；邊緣及格線取 Global Rating＝3 的平均。</span></section>
        <div className="station-picker">{stations.map((station) => {
          const threshold = data.thresholds.find((item) => item.key === station.key);
          return <button type="button" key={station.key} className={station.key === scoreStation ? 'station-card active' : 'station-card'} onClick={() => { setScoreStation(station.key); setEditing(null); }}><span>第 {station.day} 天</span><strong>{station.title}</strong><small>邊緣及格：{formatScore(threshold?.value ?? null)} 分</small></button>;
        })}</div>
        <section className="data-panel score-station-panel"><div className="panel-heading"><div><span className="section-label">DAY {selectedStation.day}</span><h2>{selectedStation.title}</h2><p className="form-help">{selectedStation.prompt || '尚未填寫命題內容。'}</p></div><div className="threshold-chip">Rating＝3 平均<br /><strong>{formatScore(selectedThreshold?.value ?? null)} 分</strong></div></div>
          {data.students.length ? <Table><TableHeader><TableRow><TableHead>學員</TableHead><TableHead>分數</TableHead><TableHead>Global Rating</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{data.students.map((student) => <TableRow key={student.id}><TableCell>{student.name}<small className="cell-email">{student.code}</small></TableCell><TableCell>{formatScore(student[`${scoreStation}_score`] as number | null)}</TableCell><TableCell>{student[`${scoreStation}_rating`] ?? '—'} / 5</TableCell><TableCell><Button className="action small secondary" disabled={busy || !!data.selected!.published} onClick={() => setEditing(student)}>登錄本題</Button></TableCell></TableRow>)}</TableBody></Table> : <p className="empty-inline">請先在「學員名冊」新增學員。</p>}
        </section>
        {editing && <section className="data-panel score-editor"><div className="panel-heading"><div><span className="section-label">SCORE ENTRY</span><h2>{editing.name} · {selectedStation.title}</h2></div><Button className="action secondary" disabled={busy} onClick={() => setEditing(null)}>取消</Button></div><form key={`${editing.id}-${editing.revision}-${scoreStation}`} onSubmit={(event) => {
          event.preventDefault(); const fields = new FormData(event.currentTarget);
          try {
            const currentGrades = Object.fromEntries(STATIONS.map(({ key }) => [key, { score: editing[`${key}_score`] as number | null, rating: editing[`${key}_rating`] as number | null }]));
            currentGrades[scoreStation] = validateGrade(fields.get('score') === '' ? null : Number(fields.get('score')), fields.get('rating') === '' ? null : Number(fields.get('rating')));
            save({ action: 'saveScores', id: editing.id, revision: editing.revision, grades: currentGrades }, `${selectedStation.title}成績已儲存。`);
          } catch (cause) { setError((cause as Error).message); }
        }}><fieldset disabled={busy || !!data.selected.published}><div className="single-score-form"><label>OSCE 分數（0–100）<Input name="score" type="number" min={0} max={100} step="any" defaultValue={editing[`${scoreStation}_score`] ?? ''} /></label><label>Global Rating（1–5）<NativeSelect name="rating" defaultValue={editing[`${scoreStation}_rating`] ?? ''}><NativeSelectOption value="">尚未評分</NativeSelectOption>{[1, 2, 3, 4, 5].map((number) => <NativeSelectOption key={number} value={number}>{number}{number === 3 ? ' · 納入邊緣分數計算' : ''}</NativeSelectOption>)}</NativeSelect></label><Button type="submit" className="action">儲存本題成績</Button></div></fieldset></form></section>}
      </TabsContent>

      <TabsContent value="publish">
        <section className="workflow-intro"><strong>第四步：確認後公布成績</strong><span>公布後，學員只看得到自己的分數與各站邊緣及格線。</span></section>
        <section className="data-panel publish-panel"><div><span className={data.selected.published ? 'status-badge published' : 'status-badge'}>{data.selected.published ? '目前已公布' : '目前未公布'}</span><h2>{data.selected.published ? '學員已可查詢個人成績' : '確認四站成績後即可公布'}</h2><p>{data.selected.published ? '如需修正名冊、題目或成績，請先撤回公布。' : '至少要有一筆已登錄成績才能公布。'}</p></div><Button disabled={busy} className="action" onClick={() => save({ action: 'publish', published: !data.selected!.published }, data.selected!.published ? '已撤回公布，現在可以編輯。' : '成績已公布，學員可查看本人紀錄。')}>{data.selected.published ? '撤回公布，回到編輯' : '公布本梯次成績'}</Button></section>
      </TabsContent>
    </Tabs>
  </>;
}
