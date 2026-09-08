import { rpc } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from '@/components/link';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatScore, maskPhone, validateGrade, workshopStations, type Student, type StationDefinition, type Workshop, type Threshold } from '@/lib/grading';

type Data = { workshops: Workshop[]; selected: Workshop | null; students: Student[]; thresholds: Threshold[] };

export default function TeacherDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Student | null>(null);
  const [tab, setTab] = useState('roster');
  const [showCreate, setShowCreate] = useState(false);
  const [scoreStation, setScoreStation] = useState('q1');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [stationDrafts, setStationDrafts] = useState<StationDefinition[] | null>(null);
  const stations = workshopStations(data?.selected);
  const editableStations = stationDrafts ?? stations;
  const publishedStationKeys = new Set(data?.selected?.publishedStations ?? (data?.selected?.published ? stations.map((station) => station.key) : []));
  const selectedStation = stations.find((station) => station.key === scoreStation) ?? stations[0];
  const selectedThreshold = data?.thresholds.find((item) => item.key === scoreStation);

  async function load(id?: string, signal?: AbortSignal) {
    const result = await rpc<Data>('nptc_teacher_data', { requested_workshop: id ?? null }, signal);
    setData(result);
    setEditing(null);
    setStationDrafts(null);
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
      const body = { ...payload, workshopId: data?.selected?.id };
      const rpcName = payload.action === 'saveStations' ? 'nptc_teacher_save_stations' : payload.action === 'publishStation' ? 'nptc_teacher_publish_station' : 'nptc_teacher_write';
      const result = await rpc<{ id?: string }>(rpcName, { body });
      await load(result.id ?? data?.selected?.id);
      setMessage(success);
      return true;
    } catch (cause) { setError((cause as Error).message); return false; } finally { setBusy(false); }
  }
  async function saveScoreBatch(form: HTMLFormElement) {
    const currentData = data;
    if (!currentData?.selected) return;
    if (!selectedStudentIds.size) { setError('請至少勾選一位要儲存的學員。'); return; }
    const fields = new FormData(form);
    try {
      const items = currentData.students.filter((student) => selectedStudentIds.has(student.id)).map((student) => ({
        id: student.id,
        revision: student.revision,
        ...validateGrade(fields.get(`${student.id}_score`) === '' ? null : Number(fields.get(`${student.id}_score`)), fields.get(`${student.id}_rating`) === '' ? null : Number(fields.get(`${student.id}_rating`))),
        feedback: String(fields.get(`${student.id}_feedback`) ?? '').trim(),
      }));
      setBusy(true); setError(''); setMessage('');
      await rpc('nptc_teacher_batch_scores_v2', { body: { workshopId: currentData.selected.id, station: scoreStation, items } });
      await load(currentData.selected.id);
      setSelectedStudentIds(new Set());
      setMessage(`已儲存 ${items.length} 位學員的${selectedStation.title}成績與回饋。`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function deleteStudent(student: Student) {
    if (!window.confirm(`確定要刪除學員「${student.name}」嗎？此操作無法復原。`)) return;
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

    <section className="workshop-control-card">
      <div className="workshop-control-copy"><span className="section-label">CURRENT WORKSHOP</span><h2>{data.selected.name}</h2><p>此梯次的名冊、OSCE 題目、成績與公告皆獨立管理。</p></div>
      <label>切換梯次
        <NativeSelect aria-label="選擇工作坊梯次" value={data.selected.id} disabled={busy} onChange={(event) => changeWorkshop(event.target.value)}>
          {data.workshops.map((workshop) => <NativeSelectOption key={workshop.id} value={workshop.id}>{workshop.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <div className="workshop-summary"><span><b>{data.students.length}</b> 位學員</span><span><b>{stations.length}</b> 個 OSCE 題目</span><span className={data.selected.published ? 'published' : ''}>{data.selected.published ? '成績已公告' : '成績未公告'}</span></div>
      <Button className="action create-workshop-button" disabled={busy} onClick={() => setShowCreate((value) => !value)}>{showCreate ? '取消新增' : '＋ 建立新梯次'}</Button>
    </section>
    {showCreate && <form className="create-workshop-card" onSubmit={async (event) => {
      event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name');
      if (await save({ action: 'createWorkshop', name }, '新梯次已建立。')) { form.reset(); setShowCreate(false); }
    }}>
      <Input name="name" placeholder="例如：2026 秋季班" maxLength={100} required disabled={busy} />
      <Button className="action" type="submit" disabled={busy}>建立梯次</Button>
    </form>}

    <Tabs className="teacher-workflow-tabs" value={tab} onValueChange={(value) => changeTab(String(value))}>
      <nav className="workflow-card-grid" aria-label="教學評量流程">
        {[['roster','1','建立學員名冊','新增單筆資料或由 Excel 批次匯入'],['stations','2','新增 OSCE 題目','登錄測驗日期、主訴、診斷與命題摘要'],['scores','3','登錄成績與回饋','勾選學員後批次儲存分數'],['publish','4','確認並公布','開放學員查看自己的成績']].map(([value,number,title,description]) => <button key={value} type="button" disabled={busy} onClick={() => changeTab(value)} className={tab===value ? 'workflow-card active' : 'workflow-card'}><span>STEP {number}</span><strong>{title}</strong><small>{description}</small></button>)}
      </nav>

      <TabsContent value="roster">
        <section className="workflow-intro"><strong>第一步：建立本梯次名冊</strong><span>可逐筆新增，或直接從 Excel 貼上姓名、Email、手機電話。</span></section>
        <div className="roster-entry-grid">
        <section className="data-panel import-panel">
          <div className="panel-heading"><div><h2>批次匯入學員</h2><p className="form-help">欄位順序：姓名、Email、手機電話。第一列欄名可保留。</p></div></div>
          <form onSubmit={async (event) => {
            event.preventDefault(); const form = event.currentTarget; const source = String(new FormData(form).get('rows') ?? '').trim();
            const rows = source.split(/\r?\n/).map((line) => line.split(/\t|,/).map((value) => value.trim())).filter((row) => row.some(Boolean));
            if (rows[0]?.[0]?.match(/姓名|name/i)) rows.shift();
            if (!rows.length || rows.some((row) => row.length < 3)) { setError('請貼上每列皆含姓名、Email、手機電話的資料。'); return; }
            if (await save({ action: 'bulkImportStudents', students: rows.map(([name, email, phone]) => ({ name, email, phone })) }, `已匯入 ${rows.length} 位學員。`)) form.reset();
          }}><fieldset disabled={busy || !!data.selected.published}><textarea name="rows" placeholder={'姓名\tEmail\t手機電話\n王小明\tstudent@example.com\t0912345678'} /><Button className="action" type="submit">批次匯入名冊</Button></fieldset></form>
        </section>
          <section className="data-panel"><h2>{editing ? '編輯學員' : '新增學員'}</h2><p className="form-help">Email 與手機電話會作為學員登入與聯絡資訊。</p>
            <form key={editing?.id ?? 'new'} className="entry-form" onSubmit={async (event) => {
              event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
              if (await save({ action: 'saveStudent', id: editing?.id, revision: editing?.revision, name: fields.get('name'), email: fields.get('email'), phone: fields.get('phone') }, '學員資料已儲存。')) form.reset();
            }}><fieldset disabled={busy || !!data.selected.published}><label>姓名<Input name="name" defaultValue={editing?.name ?? ''} required maxLength={100} /></label><label>登入 Email<Input name="email" type="email" defaultValue={editing?.email ?? ''} required maxLength={254} /></label><label>手機電話<Input name="phone" type="tel" defaultValue={editing?.phone ?? ''} required inputMode="numeric" pattern="09[0-9]{8}" placeholder="例如：0912345678" /></label><div className="form-actions"><Button className="action" type="submit">{busy ? '儲存中…' : '儲存學員資料'}</Button>{editing && <Button className="action secondary" type="button" onClick={() => setEditing(null)}>取消</Button>}</div></fieldset></form>
          </section>
        </div>
        <section className="data-panel roster-current"><div className="panel-heading"><div><span className="section-label">CURRENT ROSTER</span><h2>目前學員名冊</h2></div><span>{data.students.length} 位學員</span></div>
          {data.students.length ? <Table><TableHeader><TableRow><TableHead>姓名</TableHead><TableHead>登入資訊</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{data.students.map((student) => <TableRow key={student.id}><TableCell>{student.name}</TableCell><TableCell>{student.email}<small className="cell-email">手機 {maskPhone(student.phone)}</small></TableCell><TableCell><div className="table-actions"><Button className="action small secondary" disabled={busy || !!data.selected!.published} onClick={() => setEditing(student)}>編輯</Button><Button className="action small destructive" disabled={busy || !!data.selected!.published} onClick={() => deleteStudent(student)}>刪除</Button></div></TableCell></TableRow>)}</TableBody></Table> : <p className="empty-inline">尚無學員，請先使用上方任一方式新增。</p>}
        </section>
      </TabsContent>

      <TabsContent value="stations">
        <section className="workflow-intro"><strong>第二步：新增 OSCE 題目</strong><span>每一題依序登錄測驗日期、個案主訴、最終診斷與命題內容摘要；題數不限。</span></section>
        <section className="data-panel"><form key={data.selected.id} onSubmit={(event) => {
          event.preventDefault(); const fields = new FormData(event.currentTarget);
          const configured = editableStations.map((station): StationDefinition => ({ ...station, title: String(fields.get(`${station.key}_title`) ?? '').trim(), testDate: String(fields.get(`${station.key}_testDate`) ?? ''), complaint: String(fields.get(`${station.key}_complaint`) ?? '').trim(), diagnosis: String(fields.get(`${station.key}_diagnosis`) ?? '').trim(), prompt: String(fields.get(`${station.key}_prompt`) ?? '').trim() }));
          save({ action: 'saveStations', stations: configured }, 'OSCE 題目設定已儲存。');
        }}><fieldset disabled={busy || !!data.selected.published}><div className="station-settings-grid station-settings-all">{editableStations.map((station, index) => <article className="station-setting" key={station.key}><span>OSCE 第 {index + 1} 題</span><label>題目名稱<Input name={`${station.key}_title`} defaultValue={station.title} required maxLength={100} placeholder="請輸入題目名稱" /></label><label>測驗日期<Input name={`${station.key}_testDate`} type="date" defaultValue={station.testDate} required /></label><label>個案主訴<Input name={`${station.key}_complaint`} defaultValue={station.complaint} required maxLength={300} placeholder="例如：胸痛、呼吸困難" /></label><label>最終診斷<Input name={`${station.key}_diagnosis`} defaultValue={station.diagnosis} required maxLength={300} placeholder="例如：急性心肌梗塞" /></label><label>命題內容摘要<textarea name={`${station.key}_prompt`} defaultValue={station.prompt} required maxLength={2000} placeholder="簡述任務、情境與評分重點" /></label></article>)}</div><div className="form-actions"><Button type="button" className="action secondary" onClick={() => setStationDrafts([...editableStations, { key: `station_${crypto.randomUUID()}`, title: '', testDate: '', complaint: '', diagnosis: '', prompt: '' }])}>＋ 新增題目</Button><Button type="submit" className="action">儲存題目設定</Button></div></fieldset></form></section>
      </TabsContent>

      <TabsContent value="scores">
        <section className="workflow-intro"><strong>第三步：選擇一站，再登錄該站成績</strong><span>固定及格線為 60 分；邊緣及格線取 Global Rating＝3 的平均。</span></section>
        <div className="station-picker">{stations.map((station) => {
          const threshold = data.thresholds.find((item) => item.key === station.key);
          return <button type="button" key={station.key} className={station.key === scoreStation ? 'station-card active' : 'station-card'} onClick={() => { setScoreStation(station.key); setEditing(null); setSelectedStudentIds(new Set()); }}><span>{station.testDate || '尚未設定測驗日期'}</span><strong>{station.title}</strong><small>邊緣及格：{formatScore(threshold?.value ?? null)} 分</small></button>;
        })}</div>
        <section className="data-panel score-station-panel"><div className="panel-heading"><div><span className="section-label">{selectedStation.testDate || '測驗日期未設定'}</span><h2>{selectedStation.title}</h2><p className="form-help">{selectedStation.complaint && `主訴：${selectedStation.complaint}　`}{selectedStation.diagnosis && `最終診斷：${selectedStation.diagnosis}`}<br />{selectedStation.prompt || '尚未填寫命題內容摘要。'}</p></div><div className="threshold-chip">Rating＝3 平均<br /><strong>{formatScore(selectedThreshold?.value ?? null)} 分</strong></div></div>
          {data.students.length ? <form className="score-batch-form" key={scoreStation} onSubmit={(event) => { event.preventDefault(); saveScoreBatch(event.currentTarget); }}><fieldset disabled={busy || !!data.selected!.published}><Table><TableHeader><TableRow><TableHead>儲存</TableHead><TableHead>學員</TableHead><TableHead>分數</TableHead><TableHead>Global Rating</TableHead><TableHead>質性回饋</TableHead></TableRow></TableHeader><TableBody>{data.students.map((student) => <TableRow key={student.id}><TableCell><input type="checkbox" aria-label={`選取 ${student.name}`} checked={selectedStudentIds.has(student.id)} onChange={(event) => setSelectedStudentIds((current) => { const next = new Set(current); event.target.checked ? next.add(student.id) : next.delete(student.id); return next; })} /></TableCell><TableCell>{student.name}<small className="cell-email">手機 {maskPhone(student.phone)}</small></TableCell><TableCell><Input name={`${student.id}_score`} type="number" min={0} max={100} step="any" defaultValue={student[`${scoreStation}_score`] ?? ''} /></TableCell><TableCell><NativeSelect name={`${student.id}_rating`} defaultValue={student[`${scoreStation}_rating`] ?? ''}><NativeSelectOption value="">未評分</NativeSelectOption>{[1, 2, 3, 4, 5].map((number) => <NativeSelectOption key={number} value={number}>{number}</NativeSelectOption>)}</NativeSelect></TableCell><TableCell><textarea name={`${student.id}_feedback`} maxLength={500} defaultValue={student[`${scoreStation}_feedback`] ?? ''} placeholder="簡短回饋（最多 500 字）" /></TableCell></TableRow>)}</TableBody></Table><div className="batch-save-bar"><span>已選取 <strong>{selectedStudentIds.size}</strong> 位學員；只會儲存勾選的資料。</span><Button type="submit" className="action">批次儲存已勾選成績</Button></div></fieldset></form> : <p className="empty-inline">請先在「學員名冊」新增學員。</p>}
        </section>
      </TabsContent>

      <TabsContent value="publish">
        <section className="workflow-intro"><strong>第四步：逐題確認並公布成績</strong><span>每一題可獨立公布或撤回；學員只會看到已公布題目的分數與邊緣及格線。</span></section>
        <section className="data-panel"><div className="panel-heading"><div><span className="section-label">PUBLISH BY QUESTION</span><h2>選擇要公布的 OSCE 題目</h2><p className="form-help">公布後該題成績會鎖定；要修改請先撤回該題公告。</p></div><span>{publishedStationKeys.size} / {stations.length} 題已公布</span></div><div className="station-picker">{stations.map((station) => { const isPublished = publishedStationKeys.has(station.key); return <article className="station-card" key={station.key}><span>{station.testDate || '測驗日期未設定'}</span><strong>{station.title}</strong><small>{isPublished ? '已公布，學員可查詢' : '尚未公布'}</small><Button disabled={busy} className={isPublished ? 'action secondary small' : 'action small'} onClick={() => save({ action: 'publishStation', station: station.key, published: !isPublished }, isPublished ? `已撤回「${station.title}」的公告。` : `已公布「${station.title}」的成績。`)}>{isPublished ? '撤回公告' : '公布本題'}</Button></article>; })}</div></section>
      </TabsContent>
    </Tabs>
  </>;
}
