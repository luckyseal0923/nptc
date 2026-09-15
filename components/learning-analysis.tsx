import { DomainRadar } from '@/components/domain-radar';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Users, RefreshCw, ArrowLeft, Search } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { background, dimensions, distribution, enrollments, learners, loadAnalysis, statistics, timeline, type AnalysisData, type Dimension, type Exam } from '@/lib/learning-analysis';
import '@/app/learning-analysis.css';

const number = (value: number | null) => value === null ? '—' : value.toFixed(1);
const percent = (value: number | null) => value === null ? '尚無法判定' : `${value.toFixed(1)}%`;
const examStatus = (e: Exam) => e.score === null ? '未評分' : e.threshold === null ? '尚無門檻' : e.score >= e.threshold ? '及格' : '未達及格';
const emptyFilters: Record<Dimension,string> = { hospital:'',unit:'',exam_specialty:'',nursing_years:'',first_osce:'' };

export default function LearningAnalysis({ currentWorkshopId, onWorkshopChange }: { currentWorkshopId?: string; onWorkshopChange?: (id: string) => void }) {
  const [data,setData] = useState<AnalysisData[] | null>(null);
  const [error,setError] = useState('');
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    setData(null); setError('');
    loadAnalysis(id=>rpc<AnalysisData>('nptc_teacher_data',{requested_workshop:id ?? null},controller.signal))
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error ? cause.message : '資料載入失敗');});
    return ()=>controller.abort();
  },[version]);
  return <>
    {data === null ? <div className="analysis-state" role={error ? 'alert' : 'status'}><BarChart3 size={32}/><h1>學習分析</h1><p>{error ? `無法取得完整分析資料：${error}` : '正在彙整各梯次名冊與成績…'}</p>{error && <button className="action" onClick={()=>setVersion(v=>v+1)}>重新載入</button>}</div>
    : <AnalysisView data={data} currentWorkshopId={currentWorkshopId} onWorkshopChange={onWorkshopChange} onRefresh={()=>setVersion(v=>v+1)}/>}
  </>;
}

export function AnalysisView({ data,currentWorkshopId,onWorkshopChange,onRefresh }: { data: AnalysisData[]; currentWorkshopId?: string; onWorkshopChange?: (id:string)=>void; onRefresh?: ()=>void }) {
  const [scope,setScope] = useState('current');
  const [selected,setSelected] = useState(currentWorkshopId ?? data[0]?.selected?.id ?? '');
  const [filters,setFilters] = useState(emptyFilters);
  const [query,setQuery] = useState('');
  const [dimension,setDimension] = useState<Dimension>('exam_specialty');
  const [person,setPerson] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const allRows = useMemo(()=>enrollments(data),[data]);
  const workshops = data.flatMap(d=>d.selected ? [d.selected] : []);
  useEffect(()=>{if(currentWorkshopId)setSelected(currentWorkshopId);},[currentWorkshopId]);
  useEffect(()=>{if(person){detailRef.current?.focus(); detailRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});}},[person]);
  const effectiveSelected = workshops.some(w=>w.id===selected) ? selected : workshops[0]?.id ?? '';
  const scopeRows = allRows.filter(r=>scope === 'all' || r.workshop.id === effectiveSelected);
  const filtered = scopeRows.filter(r=>dimensions.every(([key])=>!filters[key] || background(r.student,key) === filters[key]) && `${r.student.name} ${r.student.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const exams = filtered.flatMap(r=>r.exams);
  const stats = statistics(exams);
  const people = learners(filtered).sort((a,b)=>a.names.localeCompare(b.names,'zh-Hant-TW-u-co-stroke'));
  const histogram = distribution(exams);
  const ratingCounts = [1,2,3,4,5].map(rating=>({label:String(rating),count:exams.filter(e=>e.rating===rating).length}));
  const groups = [...new Set(filtered.map(r=>background(r.student,dimension)))].sort((a,b)=>a.localeCompare(b,'zh-TW')).map(label=>{
    const rows = filtered.filter(r=>background(r.student,dimension)===label);
    return {label,count:learners(rows).length,stats:statistics(rows.flatMap(r=>r.exams))};
  });
  const stationRows = data.flatMap(d=>!d.selected || (scope !== 'all' && d.selected.id !== effectiveSelected) ? [] : (d.selected.stations ?? []).map(s=>{
    const selectedExams = exams.filter(e=>e.workshopId===d.selected!.id && e.key===s.key);
    return {id:`${d.selected!.id}:${s.key}`,name:s.title || '未命名題目',workshop:d.selected!.name,date:s.testDate || '未設定日期',stats:statistics(selectedExams),threshold:d.thresholds.find(t=>t.key===s.key)?.value ?? null};
  }));
  function reset(){setFilters(emptyFilters);setQuery('');setPerson(null);}
  return <div className="learning-analysis">
    <header className="analysis-heading"><div><span className="section-label">LEARNING ANALYTICS</span><h1><BarChart3 aria-hidden="true"/>學習分析</h1><p>從整體表現到個別學員，掌握教學與練習方向。</p></div><button className="action secondary" onClick={onRefresh} disabled={!onRefresh}><RefreshCw size={16} aria-hidden="true"/>重新整理</button></header>
    <section className="analysis-controls" aria-label="分析範圍與篩選">
      <div className="analysis-scope"><div className="analysis-segment" aria-label="分析範圍"><button aria-pressed={scope==='current'} onClick={()=>{setScope('current');reset();}}>目前梯次</button><button aria-pressed={scope==='all'} onClick={()=>{setScope('all');reset();}}>所有梯次</button></div>
        {scope==='current' ? <label>選擇梯次<select value={effectiveSelected} onChange={e=>{setSelected(e.target.value);onWorkshopChange?.(e.target.value);reset();}}>{workshops.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label> : <p>合併 {workshops.length} 個梯次；相同 Email 計為同一位學員。</p>}
      </div>
      <div className="analysis-filters">{dimensions.map(([key,label])=><label key={key}>{label}<select value={filters[key]} onChange={e=>{setFilters({...filters,[key]:e.target.value});setPerson(null);}}><option value="">全部</option>{[...new Set(scopeRows.map(r=>background(r.student,key)))].sort((a,b)=>a.localeCompare(b,'zh-TW')).map(value=><option key={value}>{value}</option>)}</select></label>)}</div>
      <div className="analysis-search"><label><Search size={16} aria-hidden="true"/><input aria-label="搜尋學員姓名或 Email" placeholder="搜尋學員姓名或 Email" value={query} onChange={e=>{setQuery(e.target.value);setPerson(null);}}/></label><button className="analysis-link" onClick={reset}>清除篩選</button></div>
    </section>
    {!workshops.length ? <section className="analysis-state"><h2>尚無梯次資料</h2><p>建立名冊並登錄成績後，即可查看分析。</p></section> : <>
    <div className="analysis-caption"><span>{scope==='all' ? '所有梯次' : workshops.find(w=>w.id===effectiveSelected)?.name} · 篩選後結果</span><span>未評分不列入平均與及格率</span></div>
    <section className="analysis-metrics" aria-label="學習表現摘要">
      <Metric label="學員人數" value={String(people.length)} note={`${filtered.length} 筆梯次名冊紀錄`} icon/>
      <Metric label="已評分／應評分" value={`${stats.scored} / ${stats.total}`} note={`尚未評分 ${stats.missing} 筆`}/>
      <Metric label="平均分數" value={number(stats.mean)} note={`以 ${stats.scored} 筆已評分紀錄計算`}/>
      <Metric label="及格率" value={percent(stats.passRate)} note={`${stats.passed} / ${stats.comparable} 筆可判定；${stats.scored-stats.comparable} 筆尚無門檻`}/>
    </section>
    {filtered.length===0 && <p className="analysis-note" role="status">目前篩選條件沒有符合的學員，請調整條件或清除篩選。</p>}
    <div className="analysis-charts"><section className="analysis-panel"><h2>成績分布</h2><p>每一筆代表一位學員的一題評分，共 {stats.scored} 筆。</p><Bars data={histogram}/><small>分數區間僅用於分布呈現，並非及格門檻。</small></section>
      <section className="analysis-panel"><h2>Global Rating 分布</h2><p>顯示 1–5 級評等；缺漏評等不計入。</p><Bars data={ratingCounts}/></section></div>
    {scope==='all' && <section className="analysis-panel"><h2>各梯次總覽</h2><p>各梯次使用自己的題目與及格門檻，結果僅供描述比較。</p><div className="analysis-table-scroll"><table><thead><tr><th>梯次</th><th>學員人數</th><th>已評分／應評分</th><th>平均分數</th><th>及格率</th></tr></thead><tbody>{workshops.map(w=>{const rows=filtered.filter(r=>r.workshop.id===w.id);const summary=statistics(rows.flatMap(r=>r.exams));return <tr key={w.id}><th scope="row">{w.name}</th><td>{learners(rows).length}</td><td>{summary.scored} / {summary.total}</td><td><Score value={summary.mean}/></td><td>{percent(summary.passRate)}<small>{summary.passed} / {summary.comparable} 筆可判定</small></td></tr>;})}</tbody></table></div></section>}
    <section className="analysis-panel"><h2>各題表現比較</h2><p>及格門檻沿用完整梯次的計算結果，不隨背景篩選改變。</p><div className="analysis-table-scroll"><table><thead><tr><th>梯次／題目</th><th>平均分數</th><th>已評分／應評分</th><th>及格門檻</th><th>及格率</th></tr></thead><tbody>{stationRows.map(s=><tr key={s.id}><th scope="row">{s.name}<small>{s.workshop} · {s.date}</small></th><td><Score value={s.stats.mean}/></td><td>{s.stats.scored} / {s.stats.total}</td><td>{number(s.threshold)}</td><td>{percent(s.stats.passRate)}<small>{s.stats.passed} / {s.stats.comparable} 筆可判定</small></td></tr>)}</tbody></table></div>{!stationRows.length && <p className="analysis-empty">尚未設定題目。</p>}</section>
    <section className="analysis-panel"><div className="analysis-panel-heading"><div><h2>學員背景與表現</h2><p>依名冊現有資料分組；同一人跨梯次的背景可能不同。</p></div><label>分組方式<select value={dimension} onChange={e=>setDimension(e.target.value as Dimension)}>{dimensions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div><div className="analysis-table-scroll"><table><thead><tr><th>分組</th><th>學員人數</th><th>評分筆數</th><th>平均分數</th><th>及格率</th></tr></thead><tbody>{groups.map(g=><tr key={g.label}><th scope="row">{g.label}{g.count<5 && <small>人數少，請審慎解讀</small>}</th><td>{g.count}</td><td>{g.stats.scored}</td><td><Score value={g.stats.mean}/></td><td>{percent(g.stats.passRate)}<small>{g.stats.passed} / {g.stats.comparable} 筆可判定</small></td></tr>)}</tbody></table></div>{!groups.length && <p className="analysis-empty">沒有符合條件的資料。</p>}</section>
    <section className="analysis-panel" aria-label="學員逐題成績"><h2>學員逐題成績</h2><p>每格顯示該題分數、邊緣及格分數與判定；點選姓名可在該學員下方展開歷次紀錄。未評分或尚無門檻的題目不計入未達及格題數。</p><div className="analysis-table-scroll"><table className="analysis-student-exams"><thead><tr><th>學員</th>{stationRows.map(s=><th key={s.id} scope="col">{s.name}<small>{s.workshop} · {s.date}</small></th>)}<th>未達及格題數</th></tr></thead><tbody>{people.map(p=>{
      const studentExams = p.records.flatMap(r=>r.exams);
      const expanded = person===p.identity;
      const history = expanded ? timeline(allRows,p.identity) : [];
      return <Fragment key={p.identity}>
        <tr className={`analysis-student-row${expanded ? ' expanded' : ''}`}><th scope="row"><button className="analysis-link" aria-expanded={expanded} aria-controls="analysis-person" onClick={e=>{opener.current=e.currentTarget;setPerson(current=>current===p.identity ? null : p.identity);}}>{p.names}</button><small>{p.email || '未提供 Email，未跨梯次合併'}</small></th>
          {stationRows.map(s=>{const exam=studentExams.find(e=>`${e.workshopId}:${e.key}`===s.id);const outcome=!exam ? '不適用' : exam.score===null ? '未評分' : exam.threshold===null ? '尚無法判定' : exam.score>=exam.threshold ? '及格' : '不及格';return <td key={s.id}>{exam ? <><strong className="analysis-exam-score">{exam.score===null ? '—' : number(exam.score)}<small>分</small></strong><small>邊緣及格：{number(exam.threshold)}{exam.threshold===null ? '（尚未建立）' : ' 分'}</small><span className={`analysis-result ${outcome==='及格' ? 'pass' : outcome==='不及格' ? 'fail' : 'pending'}`}>{outcome}</span></> : <span className="analysis-result pending">不適用（無此梯次紀錄）</span>}</td>;})}
          <td><strong className="analysis-fail-count">{p.stats.comparable-p.stats.passed} 題</strong>{p.stats.total>p.stats.comparable && <small>另有 {p.stats.total-p.stats.comparable} 題未能判定</small>}</td>
        </tr>
        {expanded && <tr className="analysis-person-row"><td colSpan={stationRows.length+2}><section id="analysis-person" ref={detailRef} tabIndex={-1} className="analysis-person analysis-person-inline" aria-label={`${p.names}的歷次紀錄`}><button className="analysis-link" onClick={()=>{setPerson(null);opener.current?.focus();}}><ArrowLeft size={16} aria-hidden="true"/>關閉個人紀錄</button><h2>{p.names}｜歷次學習紀錄</h2><p>{p.email} · 全部 {new Set(p.records.map(r=>r.workshop.id)).size} 個梯次，不受上方篩選限制。</p><p className="analysis-note">依相同 Email 串接；Email 變更將視為不同紀錄。同一 Email 如有不同姓名，請核對名冊。不同題目與評分標準的分數變化，不能直接視為進步或退步。</p><div className="analysis-table-scroll"><table><thead><tr><th>日期／梯次</th><th>題目</th><th>分數</th><th>Global Rating</th><th>判定</th><th>老師回饋</th></tr></thead><tbody>{history.map(e=><tr key={`${e.workshopId}:${e.key}`}><td>{e.date || '未設定日期'}<small>{e.workshopName}</small></td><th scope="row">{e.title}</th><td><Score value={e.score}/></td><td>{e.rating ?? '—'}</td><td>{examStatus(e)}<small>門檻 {number(e.threshold)}</small></td><td className="analysis-feedback">{e.feedback || '尚無回饋'}</td></tr>)}</tbody></table></div><div className="domain-history-grid">{history.map(e=><DomainRadar key={`${e.workshopId}:${e.key}`} title={`${e.workshopName}｜${e.title}`} scores={e.domains} maximum={e.domainMax}/>)}</div>{!history.length && <p className="analysis-empty">尚無測驗題目紀錄。</p>}</section></td></tr>}
      </Fragment>;
    })}</tbody></table></div>{!people.length && <p className="analysis-empty">沒有符合條件的學員。</p>}</section>
    <footer className="analysis-note"><strong>統計說明</strong>：平均與及格率以「學員 × 題目」為單位，題目較多的梯次會有較多筆紀錄。跨題與跨梯次比較僅供描述；背景差異不代表因果關係。包含尚未公布的後臺成績，僅供授權後臺人員查看。</footer>
    </>}
  </div>;
}
function Metric({label,value,note,icon}: {label:string;value:string;note:string;icon?:boolean}) {return <article><span>{icon && <Users size={16} aria-hidden="true"/>}{label}</span><strong>{value}</strong><small>{note}</small></article>;}
function Score({value}:{value:number|null}) {return <div className="analysis-score"><span>{number(value)}</span><div aria-hidden="true"><i style={{width:`${value ?? 0}%`}}/></div></div>;}
function Bars({data}:{data:{label:string;count:number}[]}) {const max=Math.max(1,...data.map(d=>d.count));return <div className="analysis-bars">{data.map(d=><div key={d.label}><span>{d.label}</span><div aria-hidden="true"><i style={{width:`${d.count/max*100}%`}}/></div><strong>{d.count}</strong></div>)}</div>;}
