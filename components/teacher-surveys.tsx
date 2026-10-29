import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SurveyAssignDialog } from '@/components/survey-assign-dialog';
import { DeleteSurveyDialog } from '@/components/delete-survey-dialog';
import { rpc } from '@/lib/supabase';
import { appUrl } from '@/lib/routes';
import { shortSurveyPath } from '@/lib/survey-short-link';
import { downloadSurveyQr } from '@/lib/survey-qr';
import { dimensionLabel } from '@/lib/survey-analysis';
import { downloadSurveyCsv, formatSurveyTime, surveyResponsesCsv, taipeiInput, taipeiToUtc, type SurveyAssignment, type SurveyDefinition, type SurveyExport, type SurveyInstrument, type SurveyScores, type SurveyStatus } from '@/lib/surveys';
import '@/app/surveys.css';
import { requireSurveySchema } from '@/lib/survey-schema';

type Workshop = { id: string; name: string; archived_at?: string | null };
type Data = { assignments: SurveyAssignment[]; students: { id: string; name: string }[]; responses: { assignment_id: string; student_id: string; submitted_at: string; scores: SurveyScores }[] };
const answerUrl = (id: string) => appUrl(shortSurveyPath(id));
const itemScoringLabel = (definition: SurveyDefinition, index: number) => definition.scoringStatus === 'unscored' ? '原始回覆，不計分' : definition.scoringStatus === 'pending' ? `${definition.negativeItems?.includes(index + 1) ? '負向敘述；' : ''}計分規則待確認` : definition.reverseItems?.includes(index + 1) ? '反向計分' : '正向計分';

export default function TeacherSurveys({ currentWorkshopId }: { currentWorkshopId?: string }) {
  const [workshops, setWorkshops] = useState<Workshop[]>([]), [selected, setSelected] = useState('');
  const [library, setLibrary] = useState<SurveyInstrument[]>([]), [libraryLoading, setLibraryLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [revision, setRevision] = useState(0);
  const [view, setView] = useState<'assignments' | 'library'>('library'), [search, setSearch] = useState('');
  const [expandedWorkshop, setExpandedWorkshop] = useState<string | null>(null);
  const [assigningWorkshop, setAssigningWorkshop] = useState<Workshop | null>(null);
  const [adding, setAdding] = useState<{ instrument: SurveyInstrument; requestId: string } | null>(null);
  const workshop = workshops.find(w => w.id === selected);
  useEffect(() => {
    const abort = new AbortController();
    rpc<{ workshops: Workshop[] }>('nptc_analysis_data', {}, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setWorkshops(result.workshops);
      setSelected(current => result.workshops.some(w => w.id === current) ? current : result.workshops.some(w => w.id === currentWorkshopId) ? currentWorkshopId! : result.workshops.find(w => !w.archived_at)?.id ?? '');
    }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [currentWorkshopId, revision]);
  useEffect(() => {
    const abort = new AbortController(); setLibraryLoading(true);
    requireSurveySchema(abort.signal).then(() => rpc<{ instruments: SurveyInstrument[] }>('nptc_survey_library', {}, abort.signal)).then(result => { if (!abort.signal.aborted) setLibrary(result.instruments); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause.message); })
      .finally(() => { if (!abort.signal.aborted) setLibraryLoading(false); });
    return () => abort.abort();
  }, [revision]);
  async function write(name: string, body: Record<string, unknown>, notice = '設定已儲存。') {
    setBusy(true); setError(''); setMessage('');
    try { await rpc(name, { body }); setMessage(notice); setRevision(v => v + 1); return true; }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function share(id: string, native = false) {
    setError('');
    try {
      if (native && navigator.share) await navigator.share({ title: '學員問卷填寫', url: answerUrl(id) });
      else { await navigator.clipboard.writeText(answerUrl(id)); setMessage('問卷連結已複製，可貼到課程群組或訊息中傳送。學員登入後即可填寫這份問卷。'); }
    } catch (cause) { if ((cause as Error).name !== 'AbortError') setError('連結未複製；可選取問卷卡片中的網址手動複製。'); }
  }
  async function exportData(workshopId: string, id?: string) {
    setBusy(true); setError('');
    try {
      const result = await rpc<SurveyExport>('nptc_survey_export', { requested_workshop: workshopId });
      if (id) result.responses = result.responses.filter(r => r.assignment_id === id);
      downloadSurveyCsv(surveyResponsesCsv(result), `NPTC_量表作答_${id ?? workshopId}.csv`);
      setMessage('研究資料已匯出，包含問卷編號、教師備註、原答與分數；不含姓名、Email 或手機。');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="survey-admin">
    <header className="teacher-heading"><div><span className="section-label">SURVEY MANAGEMENT</span><h1>量表管理庫</h1><p>在量表庫查看內容，於發布管理依 OSCE 梯次管理問卷。</p></div></header>
    {error && <p className="notice error" role="alert">{error} <Button className="action secondary small" disabled={busy} onClick={() => { setError(''); setRevision(v => v + 1); }}>重新讀取</Button></p>}
    {message && <p className="notice success" role="status">{message}</p>}
    <nav className="survey-view-tabs" aria-label="量表管理庫分頁"><button disabled={busy} aria-current={view === 'library' ? 'page' : undefined} onClick={() => setView('library')}>量表庫</button><button disabled={busy} aria-current={view === 'assignments' ? 'page' : undefined} onClick={() => setView('assignments')}>發布管理</button></nav>
    {view === 'library' && <section aria-label="量表庫">
      <div className="survey-library-heading"><div><h2>量表庫</h2><p className="survey-muted">展開查看完整題目，選擇量表後再指定加入的 OSCE 梯次。</p></div><label>搜尋量表<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入量表名稱" /></label></div>
      {libraryLoading && <p role="status">正在載入量表庫…</p>}
      {!libraryLoading && library.length === 0 && <p className="empty-panel">量表庫目前尚無可使用的量表。</p>}
      <div className="survey-library-list">{library.filter(i => `${i.definition.title} ${i.version}`.toLowerCase().includes(search.toLowerCase())).map(instrument => <article className="survey-card" key={`${instrument.code}-${instrument.version}`}>
        <div className="survey-library-title"><div><h3>{instrument.definition.title}</h3><p className="survey-muted">{instrument.definition.items.length} 題 · {instrument.definition.items.some(q => q.type === 'text' || q.type === 'choice') ? '單選與文字回覆' : `${instrument.definition.minScore ?? 1}–${instrument.definition.maxScore ?? 6} 分`} · {instrument.version}</p></div><Button className="action" disabled={busy || !workshops.some(w => !w.archived_at)} onClick={() => { if (workshop?.archived_at) setSelected(workshops.find(w => !w.archived_at)?.id ?? ''); setAdding({ instrument, requestId: crypto.randomUUID() }); }}>加入梯次</Button></div>
        {instrument.definition.notice && <p className="survey-warning">{instrument.definition.notice}</p>}
        <details className="survey-library-content"><summary>展開量表內容</summary>{instrument.definition.instructions.map(p => <p key={p}>{p}</p>)}{!!Object.keys(instrument.definition.dimensions ?? {}).length && <p className="survey-muted">構面：{Object.entries(instrument.definition.dimensions ?? {}).map(([name, items]) => `${dimensionLabel(name)}（${items.length} 題）`).join('、')}</p>}<ol>{instrument.definition.items.map((q, i) => <li key={i}>{q.section && <h4>{q.section}</h4>}{q.text ? <p>{q.text}</p> : <div className="survey-statements"><p><span>左側敘述</span>{q.left}</p><p><span>右側敘述</span>{q.right}</p></div>}{q.options && <p className="survey-muted">選項：{q.options.join('／')}</p>}{q.type === 'text' && <p className="survey-muted">文字意見，{q.required === false ? '選填' : '必填'}</p>}<small className="survey-muted">{itemScoringLabel(instrument.definition,i)}</small></li>)}</ol></details>
        {adding?.instrument === instrument && <form className="survey-add-form" onSubmit={async event => {
          event.preventDefault(); const fields = new FormData(event.currentTarget);
          if (!selected || workshop?.archived_at) { setError('請選擇可發布的 OSCE 梯次。'); return; }
          if (await write('nptc_survey_assign', { workshopId: selected, scaleCode: instrument.code, scaleVersion: instrument.version, requestId: adding.requestId, note: String(fields.get('note') ?? ''), status: fields.get('publish') ? 'open' : 'draft' }, '量表已加入 OSCE 梯次，可在發布管理中複製填答連結。')) { setAdding(null); setExpandedWorkshop(selected); setView('assignments'); }
        }}><label>加入 OSCE 梯次<NativeSelect required aria-label="加入量表的 OSCE 梯次" value={workshop?.archived_at ? '' : selected} disabled={busy} onChange={e => setSelected(e.target.value)}><NativeSelectOption value="">請選擇梯次</NativeSelectOption>{workshops.filter(w => !w.archived_at).map(w => <NativeSelectOption key={w.id} value={w.id}>{w.name}</NativeSelectOption>)}</NativeSelect></label><label>備註（僅老師可見）<textarea name="note" maxLength={2000} rows={2} placeholder="自行註記用途、日期或施測安排" /></label><label className="survey-check-label"><input name="publish" type="checkbox" defaultChecked />加入後立即開放填答</label><div className="survey-export-actions"><Button className="action" type="submit" disabled={busy}>確認加入量表</Button><Button className="action secondary" type="button" disabled={busy} onClick={() => setAdding(null)}>取消</Button></div></form>}
      </article>)}</div>
    </section>}
    {view === 'assignments' && <section aria-label="發布管理"><div className="survey-library-heading"><div><h2>發布管理</h2><p className="survey-muted">點選 OSCE 梯次，展開該梯次的問卷、填答連結及完成紀錄。</p></div><Button className="action secondary small" disabled={busy} onClick={() => setRevision(v => v + 1)}>更新發布紀錄</Button></div>
      {!workshops.length && <p className="empty-panel">目前沒有 OSCE 梯次，請先建立梯次與學員名冊。</p>}
      <div className="survey-workshop-list">{workshops.map(w => <article className={`survey-workshop-group${expandedWorkshop === w.id ? ' expanded' : ''}`} key={w.id}>
        <button className="survey-workshop-toggle" type="button" disabled={busy} aria-expanded={expandedWorkshop === w.id} aria-controls={`survey-publishing-${w.id}`} onClick={() => { setExpandedWorkshop(current => current === w.id ? null : w.id); setSelected(w.id); setAdding(null); }}><span className="survey-workshop-symbol" aria-hidden="true">▤</span><span className="survey-workshop-copy"><strong>{w.name}</strong><small>{w.archived_at ? '已封存，可查看問卷與回收紀錄' : '查看此梯次的問卷、填答連結與完成紀錄'}</small></span><span className="survey-workshop-open-label">{expandedWorkshop === w.id ? '收合內容' : '查看發布內容'}<span className="survey-workshop-arrow" aria-hidden="true">{expandedWorkshop === w.id ? '⌃' : '⌄'}</span></span></button>
        {expandedWorkshop === w.id && <div id={`survey-publishing-${w.id}`} className="survey-workshop-content"><WorkshopPublishing workshop={w} revision={revision} busy={busy} onAdd={() => { setError(''); setAssigningWorkshop(w); }} onWrite={write} onShare={share} onExport={id => exportData(w.id, id)} onDeleted={() => { setMessage('本次問卷發布已刪除。'); setRevision(v => v + 1); }} /></div>}
      </article>)}</div>
    </section>}
    {assigningWorkshop && <SurveyAssignDialog workshop={assigningWorkshop} instruments={library} busy={busy} error={error} onClose={() => setAssigningWorkshop(null)} onSave={body => write('nptc_survey_assign', body, '量表已加入本梯次，發布內容已更新。')}/>}
  </div>;
}

function WorkshopPublishing({ workshop, revision, busy, onAdd, onWrite, onShare, onExport, onDeleted }: { workshop: Workshop; revision: number; busy: boolean; onAdd: () => void; onWrite: (name: string, body: Record<string, unknown>) => Promise<boolean>; onShare: (id: string, native?: boolean) => void; onExport: (id?: string) => void; onDeleted: () => void }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError('');
    rpc<Data>('nptc_survey_teacher_data', { requested_workshop: workshop.id }, abort.signal).then(result => { if (!abort.signal.aborted) setData(result); }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [workshop.id, revision, retry]);
  return <>
    {workshop.archived_at ? <p className="notice">此梯次已封存，僅供檢視及研究匯出。</p> : <Button className="action" disabled={busy} onClick={onAdd}>＋ 加入量表</Button>}
    {error ? <p className="notice error" role="alert">{error} <Button className="action secondary small" onClick={() => setRetry(v => v + 1)}>重新讀取</Button></p> : !data ? <p role="status">正在讀取本梯次發布內容…</p> : !data.assignments.length ? <p className="survey-empty survey-muted">本梯次尚未加入量表，請點選「加入量表」。</p> : <>
      <div className="survey-cards">{data.assignments.map(a => <AssignmentSettings key={`${a.id}-${a.revision}`} assignment={a} count={data.students.length} disabled={busy || !!workshop.archived_at} onSave={body => onWrite('nptc_survey_update', body)} onCopy={() => onShare(a.id)} onShare={() => onShare(a.id, true)} onExport={() => onExport(a.id)} onDeleted={onDeleted} />)}</div>
      <section className="data-panel survey-results"><div className="panel-heading"><div><h2>問卷完成情形</h2><p className="form-help">學員端只顯示填寫狀態；老師可至學習分析儀表板查詢分數與歷次趨勢。</p></div></div><div className="survey-table-wrap"><table><thead><tr><th>學員</th>{data.assignments.map(a => <th key={a.id}>{a.definition.title}<small className="survey-muted">{a.note || '未填備註'}</small></th>)}</tr></thead><tbody>{data.students.map(s => <tr key={s.id}><td>{s.name}</td>{data.assignments.map(a => { const r = data.responses.find(r => r.student_id === s.id && r.assignment_id === a.id); return <td key={a.id}>{r ? <><strong>已完成</strong><small className="survey-muted">{formatSurveyTime(r.submitted_at)}</small></> : <span className="survey-muted">未完成</span>}</td>; })}</tr>)}</tbody></table></div>{!data.students.length && <p className="survey-muted">本梯次尚無學員，請先建立名冊。</p>}<div className="survey-export-actions"><Button className="action" disabled={busy || !data.responses.length} onClick={() => onExport()}>匯出本梯次全部問卷作答</Button></div></section>
    </>}
  </>;
}

function AssignmentSettings({ assignment: a, count, disabled, onSave, onCopy, onShare, onExport, onDeleted }: { assignment: SurveyAssignment; count: number; disabled: boolean; onSave: (body: Record<string, unknown>) => Promise<boolean>; onCopy: () => void; onShare: () => void; onExport: () => void; onDeleted: () => void }) {
  const [status, setStatus] = useState<SurveyStatus>(a.status === 'draft' ? 'open' : a.status), [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  async function downloadQr() {
    setQrBusy(true); setError('');
    try { await downloadSurveyQr(answerUrl(a.id), a.scale_code, a.id); }
    catch { setError('QR code 下載失敗，請再試一次。'); }
    finally { setQrBusy(false); }
  }
  const linkRef = useRef<HTMLInputElement>(null);
  return <article className="survey-card"><div className="survey-card-heading"><span className="survey-badge">{a.status === 'draft' ? '草稿' : a.status === 'open' ? '已發布' : '已關閉'}</span><span className="survey-muted">已完成 {a.submitted_count ?? 0} / {count} 人</span></div><h2>{a.definition.title}</h2>
    <div className="survey-link-box"><label>學員填答短網址<input ref={linkRef} readOnly value={answerUrl(a.id)} onFocus={e => e.currentTarget.select()} /></label><div className="survey-export-actions"><Button type="button" className="action secondary small" onClick={onCopy}>複製短網址</Button><Button type="button" className="action secondary small" onClick={onShare}>分享連結</Button><Button type="button" className="action secondary small" disabled={qrBusy} onClick={downloadQr}>{qrBusy ? '正在產生 QR code…' : '下載 QR code'}</Button><a className="text-link" href={answerUrl(a.id)} target="_blank" rel="noreferrer">開啟問卷 ↗</a></div></div>
    <form onSubmit={event => { event.preventDefault(); setError(''); const fields = new FormData(event.currentTarget); try { const opensAt = taipeiToUtc(String(fields.get('opensAt') ?? '')), closesAt = taipeiToUtc(String(fields.get('closesAt') ?? '')); if (opensAt && closesAt && opensAt >= closesAt) throw new Error('截止時間須晚於開放時間。'); void onSave({ id: a.id, revision: a.revision, status, note: String(fields.get('note') ?? ''), opensAt, closesAt }); } catch (cause) { setError((cause as Error).message); } }}>
      <fieldset disabled={disabled} className="survey-settings"><label>備註（僅老師可見）<textarea name="note" maxLength={2000} rows={2} defaultValue={a.note} /></label><label>發布狀態<NativeSelect value={status} onChange={e => setStatus(e.target.value as SurveyStatus)}><NativeSelectOption value="open">開放填答</NativeSelectOption><NativeSelectOption value="closed">關閉填答</NativeSelectOption></NativeSelect></label><label>開放時間（臺灣時間，可留空）<input type="datetime-local" name="opensAt" defaultValue={taipeiInput(a.opens_at)} /></label><label>截止時間（臺灣時間，可留空）<input type="datetime-local" name="closesAt" defaultValue={taipeiInput(a.closes_at)} /></label><Button className="action" type="submit">{a.status === 'draft' ? '儲存並發布' : '儲存設定'}</Button></fieldset>
      {error && <p role="alert" className="notice error">{error}</p>}
    </form><div className="survey-assignment-footer"><Button className="action secondary small" disabled={disabled || !a.submitted_count} onClick={onExport}>匯出此問卷作答</Button><Button className="action destructive small" disabled={disabled} onClick={() => setDeleteOpen(true)}>刪除本次發布</Button></div><small className="survey-muted">{a.definition.items.length} 題 · 版本 {a.scale_version}</small>
    {deleteOpen && <DeleteSurveyDialog assignmentId={a.id} onClose={() => setDeleteOpen(false)} onDeleted={() => { setDeleteOpen(false); onDeleted(); }}/>}
  </article>;
}
