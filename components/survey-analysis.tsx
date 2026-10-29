import { useEffect, useId, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { formatSurveyTime } from '@/lib/surveys';
import { dimensionLabel, metricRange, metricValue, orderedAssignments, scaleKey, surveyPeople, surveyTrend, type SurveyAnalysisData, type SurveyTrendPoint } from '@/lib/survey-analysis';
import '@/app/learning-analysis.css';

const scoreText = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
const dateText = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '未設定';

export default function SurveyAnalysis({ currentWorkshopId }: { currentWorkshopId?: string }) {
  const [data, setData] = useState<SurveyAnalysisData | null>(null), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [workshopId, setWorkshopId] = useState(currentWorkshopId ?? 'all'), [selectedScale, setSelectedScale] = useState('');
  const [personId, setPersonId] = useState('all'), [query, setQuery] = useState(''), [metric, setMetric] = useState('total');
  const [detail, setDetail] = useState<{ assignmentId: string; studentId: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError('');
    rpc<SurveyAnalysisData>('nptc_survey_analysis', { requested_workshop: null }, abort.signal)
      .then(result => { if (!abort.signal.aborted) setData(result); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [reload]);
  const effectiveWorkshop = data?.workshops.some(w => w.id === workshopId) ? workshopId : 'all';
  const scopeAssignments = useMemo(() => data?.assignments.filter(a => a.status !== 'draft' && (effectiveWorkshop === 'all' || a.workshop_id === effectiveWorkshop)) ?? [], [data, effectiveWorkshop]);
  const scales = [...new Map(scopeAssignments.map(a => [scaleKey(a), { key: scaleKey(a), title: a.definition.title, version: a.scale_version, definition: a.definition }])).values()];
  const scale = scales.find(s => s.key === selectedScale) ?? scales[0];
  const assignments = orderedAssignments(scopeAssignments.filter(a => scale && scaleKey(a) === scale.key));
  const people = data ? surveyPeople(data, assignments) : [];
  const searchedPeople = people.filter(p => p.names.toLowerCase().includes(query.trim().toLowerCase()));
  const person = searchedPeople.find(p => p.identity === personId);
  const displayedPeople = person ? [person] : searchedPeople;
  const metricOptions = [{ key: 'total', label: '總分' }, ...Object.keys(scale?.definition.dimensions ?? {}).map(name => ({ key: `dimension:${name}`, label: dimensionLabel(name) }))];
  const activeMetric = metricOptions.some(m => m.key === metric) ? metric : 'total';
  const metricLabel = metricOptions.find(m => m.key === activeMetric)?.label ?? '總分';
  const range = scale ? metricRange(scale.definition, activeMetric) : { min: 0, max: 1 };
  const points = data ? surveyTrend(data, assignments, displayedPeople, activeMetric) : [];
  const identities = new Set(displayedPeople.map(p => p.identity)), assignmentIds = new Set(assignments.map(a => a.id));
  const responses = data?.responses.filter(r => assignmentIds.has(r.assignment_id) && identities.has(r.identity)) ?? [];
  const values = responses.map(r => metricValue(r.scores, activeMetric)).filter((n): n is number => n !== null);
  const expected = assignments.reduce((sum, a) => sum + displayedPeople.filter(p => p.workshopIds.includes(a.workshop_id)).length, 0);
  const detailResponse = detail ? responses.find(r => r.assignment_id === detail.assignmentId && r.student_id === detail.studentId) : undefined;
  const detailAssignment = detailResponse ? assignments.find(a => a.id === detailResponse.assignment_id) : undefined;
  const detailPerson = detailResponse ? displayedPeople.find(p => p.identity === detailResponse.identity) : undefined;
  const resetDetails = () => { setPersonId('all'); setDetail(null); };

  if (!data) return <section className="analysis-state" role={error ? 'alert' : 'status'}><BarChart3 size={32}/><h1>量表分數與趨勢</h1><p>{error || '正在讀取學員量表紀錄…'}</p>{error && <button className="action" onClick={() => setReload(v => v + 1)}>重新載入</button>}</section>;
  return <div className="learning-analysis survey-learning-analysis">
    <header className="analysis-heading"><div><span className="section-label">SURVEY ANALYTICS</span><h1><BarChart3 aria-hidden="true"/>量表分數與趨勢</h1><p>查詢學員的問卷得分，查看同一份量表的歷次填寫變化。</p></div><button className="action secondary" onClick={() => { setDetail(null); setReload(v => v + 1); }}><RefreshCw size={16} aria-hidden="true"/>更新量表資料</button></header>
    <section className="analysis-controls" aria-label="量表分析篩選"><div className="survey-analysis-filters">
      <label>OSCE 梯次<select value={effectiveWorkshop} onChange={e => { setWorkshopId(e.target.value); setSelectedScale(''); resetDetails(); }}><option value="all">所有可檢視梯次</option>{data.workshops.map(w => <option value={w.id} key={w.id}>{w.name}{w.archived_at ? '（已封存）' : ''}</option>)}</select></label>
      <label>選擇量表<select value={scale?.key ?? ''} disabled={!scales.length} onChange={e => { setSelectedScale(e.target.value); setMetric('total'); resetDetails(); }}>{!scales.length && <option value="">尚無量表發布</option>}{scales.map(s => <option key={s.key} value={s.key}>{s.title} · {s.version}</option>)}</select></label>
      <label>查詢學員<input type="search" value={query} placeholder="輸入學員姓名" onChange={e => { setQuery(e.target.value); resetDetails(); }}/></label>
      <label>學員<select value={person?.identity ?? 'all'} onChange={e => { setPersonId(e.target.value); setDetail(null); }}><option value="all">全部符合條件的學員</option>{searchedPeople.map(p => <option key={p.identity} value={p.identity}>{p.names}（{p.workshopIds.length} 個梯次）</option>)}</select></label>
      <label>分數項目<select value={activeMetric} onChange={e => setMetric(e.target.value)}>{metricOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
    </div><p className="form-help">{data.includesArchived ? '目前可包含已封存梯次。' : '目前僅包含未封存梯次。'}不同量表版本分開呈現；未完成問卷不計為 0 分。</p></section>
    {!assignments.length ? <section className="analysis-panel analysis-empty"><h2>目前尚無可分析的問卷</h2><p>在量表管理庫加入問卷並收回學員作答後，即可查看分數與趨勢。</p></section> : <>
      {scale?.definition.notice && <p className="analysis-note">{scale.definition.notice}</p>}
      <section className="analysis-metrics" aria-label="量表填答摘要"><article><span>學員人數</span><strong>{displayedPeople.length}</strong><small>符合目前篩選條件</small></article><article><span>完成問卷／應填份數</span><strong>{responses.length} / {expected}</strong><small>各次發布分開計算</small></article><article><span>{metricLabel}平均</span><strong>{scoreText(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)}</strong><small>依 {values.length} 筆有效分數計算</small></article><article><span>同版量表發布次數</span><strong>{assignments.length}</strong><small>{metricLabel}量尺範圍 {range.min}–{range.max} 分</small></article></section>
      <section className="analysis-panel"><div className="analysis-panel-heading"><div><h2>{person ? `${person.names}｜歷次${metricLabel}趨勢` : `各次發布｜${metricLabel}平均趨勢`}</h2><p>依發布時間排列，橫軸使用教師備註；未填備註時以發布次序顯示。</p></div>{person && <button className="analysis-link" onClick={resetDetails}>查看全部學員</button>}</div>
        <SurveyTrendChart points={points} range={range} metricLabel={metricLabel} personal={!!person}/>
        <div className="analysis-table-scroll"><table className="survey-trend-summary"><thead><tr><th>發布備註</th><th>OSCE 梯次／發布時間</th><th>{person ? metricLabel : `${metricLabel}平均`}</th><th>有效分數筆數</th></tr></thead><tbody>{points.map(p => <tr key={p.id}><th scope="row">{p.label}</th><td>{p.workshop}<small>{formatSurveyTime(p.date)}</small></td><td>{scoreText(p.value)}</td><td>{p.count}</td></tr>)}</tbody></table></div>
        <p className="analysis-note">{person ? '折線呈現此學員在各次發布的填答分數；缺少作答的資料點留空。' : '每個資料點是該次發布中符合篩選學員的平均分數，人數可能不同；可選擇單一學員查看個人趨勢。'}分數變化本身不代表教學效果或能力合格判定。</p>
      </section>
      <section className="analysis-panel" aria-label="學員量表分數"><h2>學員量表分數</h2><p>點選姓名可查看個人趨勢；點選分數可查看該次問卷的逐題原答與換算分數。</p><div className="analysis-table-scroll"><table className="survey-student-scores"><thead><tr><th>學員</th>{points.map(p => <th key={p.id}>{p.label}<small>{p.workshop} · {dateText(p.date)}</small></th>)}</tr></thead><tbody>{displayedPeople.map(p => <tr key={p.identity}><th scope="row"><button className="analysis-link" onClick={() => { setPersonId(p.identity); setDetail(null); }}>{p.names}</button><small>{p.workshopIds.length} 個梯次紀錄</small></th>{assignments.map(a => {
        if (!p.workshopIds.includes(a.workshop_id)) return <td key={a.id}><span className="survey-muted">不適用</span></td>;
        const r = data.responses.find(r => r.assignment_id === a.id && r.identity === p.identity), value = r ? metricValue(r.scores, activeMetric) : null;
        return <td key={a.id}>{r ? <><button className="survey-score-button" onClick={() => { setPersonId(p.identity); setDetail({ assignmentId: a.id, studentId: r.student_id }); }}>{value === null ? '已完成' : `${scoreText(value)} 分`}</button><small>填寫：{formatSurveyTime(r.submitted_at)}</small></> : <span className="survey-muted">尚未填寫</span>}</td>;
      })}</tr>)}</tbody></table></div>{!displayedPeople.length && <p className="analysis-empty">目前沒有符合條件的學員。</p>}</section>
      {detailResponse && detailAssignment && <section className="analysis-panel survey-answer-detail" aria-label="逐題量表作答"><div className="analysis-panel-heading"><div><h2>{detailPerson?.names}｜逐題作答</h2><p>{detailAssignment.definition.title} · {detailAssignment.note || '未填備註'} · {formatSurveyTime(detailResponse.submitted_at)}</p></div><button className="analysis-link" onClick={() => setDetail(null)}>關閉明細</button></div><div className="analysis-table-scroll"><table><thead><tr><th>題號</th><th>題目內容</th><th>原始作答</th><th>換算得分</th></tr></thead><tbody>{detailAssignment.definition.items.map((q, i) => <tr key={i}><th scope="row">{i + 1}</th><td className="survey-answer-statement">{q.text || <><p>左：{q.left}</p><p>右：{q.right}</p></>}</td><td>{detailResponse.answers[i] ?? '—'}</td><td>{detailResponse.scores.itemScores[i] ?? '—'}</td></tr>)}</tbody></table></div><p className="analysis-note">總分：{scoreText(detailResponse.scores.total)}。資料以該次問卷保存的題目與計分版本呈現。</p></section>}
    </>}
  </div>;
}

function SurveyTrendChart({ points, range, metricLabel, personal }: { points: SurveyTrendPoint[]; range: { min: number; max: number }; metricLabel: string; personal: boolean }) {
  const id = useId();
  const filled = points.filter(p => p.value !== null);
  if (!filled.length) return <p className="analysis-empty" role="status">目前沒有可繪製的{metricLabel}紀錄，尚未填答不會畫成 0 分。</p>;
  const width = 840, height = 316, left = 64, right = 30, top = 32, bottom = 72;
  const low = Math.min(range.min, ...filled.map(p => p.value!)), high = Math.max(range.max, ...filled.map(p => p.value!));
  const span = high - low || 1;
  const x = (i: number) => left + (points.length === 1 ? (width - left - right) / 2 : i * (width - left - right) / (points.length - 1));
  const y = (value: number) => top + (high - value) * (height - top - bottom) / span;
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  points.forEach((p, i) => { if (p.value === null) { if (segment.length) segments.push(segment); segment = []; } else segment.push({ x: x(i), y: y(p.value) }); });
  if (segment.length) segments.push(segment);
  const step = Math.max(1, Math.ceil(points.length / 8));
  return <figure className="survey-trend-figure"><div className="survey-trend-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}><title id={`${id}-title`}>{personal ? '學員' : '各次發布平均'}{metricLabel}趨勢</title><desc id={`${id}-desc`}>{filled.length} 個有效資料點。完整數值列於下方表格，缺漏紀錄不連線。</desc>
    {[0, 1, 2, 3, 4].map(i => { const value = low + span * i / 4; return <g key={i}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#dce7dc" strokeDasharray={i === 0 ? undefined : '4 5'}/><text x={left - 13} y={y(value) + 4} textAnchor="end" fill="#5c7368" fontSize={12}>{scoreText(value)}</text></g>; })}
    <text x={left} y={16} fill="#365d4c" fontSize={12}>{metricLabel}（分）</text>
    {segments.filter(s => s.length > 1).map((s, i) => <polyline key={i} fill="none" stroke="#2c7962" strokeWidth={3} strokeLinejoin="round" points={s.map(p => `${p.x},${p.y}`).join(' ')}/>)}
    {points.map((p, i) => <g key={p.id}>{p.value !== null && <g className="survey-trend-point" tabIndex={0} role="img" aria-label={`${p.label}，${metricLabel} ${scoreText(p.value)}，${p.count} 筆`}><title>{p.label}｜{p.workshop}｜{scoreText(p.value)} 分｜n={p.count}</title><circle cx={x(i)} cy={y(p.value)} r={6} fill="#fff" stroke="#2c7962" strokeWidth={3}/>{points.length <= 14 && <text x={x(i)} y={y(p.value) - 13} textAnchor="middle" fill="#164a38" fontSize={12} fontWeight={600}>{scoreText(p.value)}</text>}</g>}{(i % step === 0 || i === points.length - 1) && <><text x={x(i)} y={height - bottom + 24} textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill="#345a49" fontSize={11}>{p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}</text><text x={x(i)} y={height - bottom + 42} textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill="#728478" fontSize={11}>{dateText(p.date)}</text></>}</g>)}
  </svg></div><figcaption>{filled.length === 1 ? '目前僅有一筆有效紀錄，暫以單一資料點呈現。' : '依同份同版量表的發布順序呈現。'}圖表下方可查看各次分數與人數。</figcaption></figure>;
}
