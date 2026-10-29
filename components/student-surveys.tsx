import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { rpc } from '@/lib/supabase';
import { appUrl } from '@/lib/routes';
import { availabilityLabel, formatSurveyTime, surveyLink, validateSurveyResponse, type SurveyAnswer, type SurveyAssignment, type SurveySummary } from '@/lib/surveys';
import '@/app/surveys.css';

export function StudentSurveys({ studentId }: { studentId: string }) {
  const [assignments, setAssignments] = useState<SurveySummary[] | null>(null);
  const [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError('');
    rpc<{ assignments: SurveySummary[] }>('nptc_survey_student_data', { requested_student: studentId }, abort.signal)
      .then(data => setAssignments(data.assignments)).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [studentId, reload]);
  return <section className="survey-section" aria-label="問卷填寫公告">
    <div className="survey-heading"><span className="section-label">QUESTIONNAIRE STATUS</span><h2>問卷填寫公告</h2><p>這裡只公告問卷是否完成填寫。</p></div>
    {error && <p className="notice error" role="alert">{error} <Button className="action secondary small" onClick={() => setReload(v => v + 1)}>重新讀取</Button></p>}
    {!error && assignments === null && <p role="status">正在讀取問卷完成狀態…</p>}
    {!error && assignments?.length === 0 && <p className="survey-muted">本梯次目前沒有問卷公告。</p>}
    <ul className="survey-completion-list">{assignments?.map(a => <li className="survey-completion-row" key={a.id}><div><h3>{a.title}</h3><small className="survey-muted">發布日期：{formatSurveyTime(a.created_at)}</small>{a.submitted_at && <small className="survey-muted">完成時間：{formatSurveyTime(a.submitted_at)}</small>}</div><div className="survey-completion-actions"><span className={`survey-badge ${a.submitted_at ? 'done' : ''}`}>{a.submitted_at ? '已完成填寫' : '尚未完成填寫'}</span>{!a.submitted_at && (a.availability === 'open' ? <a className="text-link" href={appUrl('/student/') + surveyLink(a.id)}>前往問卷 ↗</a> : <span className="survey-muted">{availabilityLabel[a.availability]}</span>)}</div></li>)}</ul>
  </section>;
}

export function SurveyLinkPage({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<{ assignment: SurveyAssignment; workshopName: string } | null>(null);
  const [error, setError] = useState(''), [receipt, setReceipt] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError('');
    rpc<{ assignment: SurveyAssignment; workshopName: string }>('nptc_survey_form', { requested_assignment: assignmentId }, abort.signal)
      .then(setData).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [assignmentId, reload]);
  return <div className="workspace survey-link-page"><div className="survey-heading"><span className="section-label">QUESTIONNAIRE</span><h1>問卷填寫</h1>{data && <p>{data.workshopName}</p>}<a className="text-link" href={appUrl('/student/')}>返回我的 OSCE 成績</a></div>
    {error ? <p className="notice error" role="alert">{error} <Button className="action secondary small" onClick={() => setReload(v => v + 1)}>重新讀取</Button></p> : !data ? <p role="status">正在讀取問卷…</p> : receipt || data.assignment.submitted_at ? <section className="survey-card survey-receipt" role="status"><h2>{data.assignment.definition.title}</h2><strong>已完成填寫</strong><p>感謝您的作答，問卷已繳交。</p><p className="survey-muted">提交時間：{formatSurveyTime(receipt || data.assignment.submitted_at)}</p><a className="text-link" href={appUrl('/student/')}>返回查看問卷完成公告</a></section> : data.assignment.availability !== 'open' ? <section className="survey-card"><h2>{data.assignment.definition.title}</h2><p>{availabilityLabel[data.assignment.availability ?? 'closed']}</p>{data.assignment.opens_at && <p className="survey-muted">開放時間：{formatSurveyTime(data.assignment.opens_at)}</p>}{data.assignment.closes_at && <p className="survey-muted">截止時間：{formatSurveyTime(data.assignment.closes_at)}</p>}</section> : <SurveyForm key={data.assignment.id} assignment={data.assignment} onComplete={setReceipt} />}
  </div>;
}

function SurveyForm({ assignment, onComplete }: { assignment: SurveyAssignment; onComplete: (time: string) => void }) {
  const [answers, setAnswers] = useState<SurveyAnswer[]>(() => assignment.definition.items.map(() => null));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ id: string; answers: string } | null>(null);
  const min = assignment.definition.minScore ?? 1, max = assignment.definition.maxScore ?? 6;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  async function submit() {
    setError('');
    try {
      validateSurveyResponse(answers, assignment.definition);
      const serialized = JSON.stringify(answers);
      if (!pending.current) pending.current = { id: crypto.randomUUID(), answers: serialized };
      if (pending.current.answers !== serialized) throw new Error('正在確認上一筆提交，請重試原作答。');
      setBusy(true);
      const result = await rpc<{ ok: true; submitted_at: string }>('nptc_survey_submit', { body: { assignmentId: assignment.id, version: assignment.scale_version, requestId: pending.current.id, answers } }, AbortSignal.timeout(15000));
      onComplete(result.submitted_at);
    } catch (cause) {
      if (pending.current) setUncertain(true);
      setError((cause as Error).name === 'AbortError' ? '連線逾時，尚無法確認是否已提交。請重試原作答或重新開啟此連結確認。' : (cause as Error).message);
    } finally { setBusy(false); }
  }
  return <form className="survey-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <header><h2>{assignment.definition.title}</h2>{assignment.definition.notice && <p className="survey-warning">{assignment.definition.notice}</p>}</header>
    <div className="survey-instructions">{assignment.definition.instructions.map(p => <p key={p}>{p}</p>)}<p>每題選擇一個答案。繳交後保留原始作答，不提供修改。</p></div>
    <fieldset disabled={busy || uncertain} className="survey-items">{assignment.definition.items.map((item, i) => <fieldset className="survey-question" key={i}><legend>第 {i + 1} 題{item.required === false ? '（選填）' : ''}</legend>
      {item.section && <h3 className="survey-domain-heading">{item.section}</h3>}
      {item.text ? <p className="survey-statement-text">{item.text}</p> : <div className="survey-statements"><p><span>左側敘述（{min}）</span>{item.left}</p><p><span>右側敘述（{max}）</span>{item.right}</p></div>}
      {item.type === 'text' ? <textarea aria-label={`第 ${i + 1} 題文字意見`} rows={4} maxLength={item.maxLength ?? 2000} required={item.required !== false} value={String(answers[i] ?? '')} onChange={event => setAnswers(current => current.map((n, j) => i === j ? event.target.value : n))}/> : item.type === 'choice' ? <div className="survey-choice-options" role="radiogroup" aria-label={`第 ${i + 1} 題單選`}>{item.options?.map(value => <label key={value}><input type="radio" name={`survey-q${i + 1}`} value={value} required={item.required !== false} checked={answers[i] === value} onChange={() => setAnswers(current => current.map((n, j) => i === j ? value : n))}/><span>{value}</span></label>)}</div> : <><div className={`survey-options${assignment.definition.optionLabels ? ' survey-options-labeled' : ''}`} style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 6)}, minmax(0, 1fr))` }} role="radiogroup" aria-label={`第 ${i + 1} 題，${min} 至 ${max} 單選`}>{options.map(value => <label key={value}><input type="radio" name={`survey-q${i + 1}`} value={value} required={item.required !== false} checked={answers[i] === value} onChange={() => setAnswers(current => current.map((n, j) => i === j ? value : n))} /><span>{value}</span>{assignment.definition.optionLabels?.[value] && <small>{assignment.definition.optionLabels[value]}</small>}</label>)}</div>
      <div className="survey-scale-labels"><span>{assignment.definition.leftLabel ?? (item.left ? '最接近左側' : '')}</span><span>{assignment.definition.rightLabel ?? (item.right ? '最接近右側' : '')}</span></div></>}
    </fieldset>)}</fieldset>
    <div className="survey-submit-bar"><span aria-live="polite">已填 {answers.filter(n => n !== null && n !== '').length} / {answers.length} 題{assignment.definition.items.some(q => q.required === false) && `（${assignment.definition.items.filter(q => q.required === false).length} 題選填）`}</span><Button className="action" disabled={busy} type="submit">{busy ? '繳交中…' : uncertain ? '重試原作答' : '繳交問卷'}</Button></div>
    {uncertain && <p className="survey-muted">為避免重複紀錄，已暫停編輯。重試會使用相同作答與提交編號。</p>}{error && <p className="notice error" role="alert">{error}</p>}
  </form>;
}
