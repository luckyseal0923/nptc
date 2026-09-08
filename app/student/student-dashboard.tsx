import { rpc } from '@/lib/supabase';
('use client');
import { useEffect, useState } from 'react';
import {
  STATIONS,
  formatScore,
  gradeStatus,
  DEFAULT_STATIONS,
  maskPhone,
  type StationDefinition,
  type Grade,
  type Threshold,
} from '@/lib/grading';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from '@/components/link';
type RecordItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  workshopName: string;
  published: number;
  updatedAt: string | null;
  grades: (Grade & { key: string; feedback?: string | null })[];
  thresholds: Threshold[];
  stations?: StationDefinition[];
  profile?: { nursingYears: number | null; hospital: string; unit: string; examSpecialty: string; firstOsce: boolean | null; birthDate: string };
};
const HOSPITALS = ['國立臺灣大學醫學院附設醫院','臺北榮民總醫院','三軍總醫院','臺北市立萬芳醫院－委託臺北醫學大學辦理','臺北市立聯合醫院','新光吳火獅紀念醫院','馬偕紀念醫院','亞東紀念醫院','長庚醫療財團法人林口長庚紀念醫院','長庚醫療財團法人基隆長庚紀念醫院','長庚醫療財團法人嘉義長庚紀念醫院','長庚醫療財團法人高雄長庚紀念醫院','中國醫藥大學附設醫院','中山醫學大學附設醫院','臺中榮民總醫院','彰化基督教醫療財團法人彰化基督教醫院','奇美醫療財團法人奇美醫院','國立成功大學醫學院附設醫院','高雄醫學大學附設中和紀念醫院','高雄榮民總醫院','義大醫療財團法人義大醫院','佛教慈濟醫療財團法人花蓮慈濟醫院'];
function HospitalPicker({ defaultValue }: { defaultValue: string }) {
  const [query, setQuery] = useState(defaultValue);
  const [selected, setSelected] = useState(defaultValue);
  const options = HOSPITALS.filter((item) => item.includes(query)).slice(0, 8);
  return <label className="hospital-picker">服務醫院<Input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(''); }} placeholder="輸入關鍵字搜尋醫院" autoComplete="off" /><input type="hidden" name="hospital" value={selected} />{query && !selected && <div className="hospital-options">{options.length ? options.map((item) => <button type="button" key={item} onClick={() => { setSelected(item); setQuery(item); }}>{item}</button>) : <p>找不到相符機構，請洽老師加入名單。</p>}</div>}{selected && <small>已選擇：{selected}</small>}</label>;
}
export default function StudentDashboard({
  isTeacher,
}: {
  isTeacher: boolean;
}) {
  const [records, setRecords] = useState<RecordItem[] | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [profileBusy, setProfileBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    rpc<{ records: RecordItem[] }>('nptc_student_data', {}, abort.signal)
      .then((data) => {
        setRecords(data.records);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => abort.abort();
  }, []);
  const record = records?.find((r) => r.id === selected) ?? records?.[0];
  async function saveProfile(form: HTMLFormElement) {
    const fields = new FormData(form);
    setProfileBusy(true); setError('');
    try {
      const hospital = String(fields.get('hospital') ?? '');
      if (!HOSPITALS.includes(hospital)) throw new Error('請由搜尋結果選擇服務醫院全名。');
      await rpc('nptc_student_update_profile', { body: { nursingYears: Number(fields.get('nursingYears')), hospital, unit: String(fields.get('unit') ?? ''), examSpecialty: String(fields.get('examSpecialty') ?? ''), firstOsce: fields.get('firstOsce') === 'yes', birthDate: String(fields.get('birthDate') ?? '') } });
      const data = await rpc<{ records: RecordItem[] }>('nptc_student_data'); setRecords(data.records);
    } catch (cause) { setError((cause as Error).message); } finally { setProfileBusy(false); }
  }
  return (
    <>
      <div className="dashboard-title">
        <div>
          <h1>我的 OSCE 成績</h1>
          <p>
            {record
              ? `${record.name}，回顧每一次練習，整理下一步的方向。`
              : '回顧每一次練習，整理下一步的方向。'}
          </p>
        </div>
        {isTeacher && (
          <Link className="text-link" href="/teacher">
            前往老師專區 ↗
          </Link>
        )}
      </div>
      {error ? (
        <section className="notice error" role="alert">
          <p>{error}</p>
          <Button className="action" onClick={() => location.reload()}>
            重新載入
          </Button>
        </section>
      ) : !records ? (
        <p className="empty-panel" role="status">
          正在載入你的學習紀錄…
        </p>
      ) : !record ? (
        <section className="empty-panel">
          <span className="section-label">YOUR RECORDS</span>
          <h2>目前尚無工作坊紀錄</h2>
          <p>
            請確認登入 Email
            與老師建立的名冊一致。若已參加工作坊，請洽課程老師協助確認。
          </p>
          {isTeacher && (
            <Link className="button" href="/teacher">
              進入老師專區 ↗
            </Link>
          )}
        </section>
      ) : (
        <>
          <div className="workshop-toolbar">
            <label>
              工作坊梯次
              <NativeSelect
                value={record.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {records.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.workshopName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <span className="identity-pill">手機電話 {maskPhone(record.phone)}</span>
          </div>
          {!record.profile?.hospital || record.profile.firstOsce === null ? <section className="data-panel student-profile"><div className="panel-heading"><div><span className="section-label">FIRST LOGIN</span><h2>完成個人資料</h2><p className="form-help">姓名、Email 與手機電話由老師建立，請確認後補齊其餘資料。</p></div></div><form onSubmit={(event) => { event.preventDefault(); saveProfile(event.currentTarget); }}><fieldset disabled={profileBusy}><div className="profile-grid"><label>姓名<Input value={record.name} disabled /></label><label>Email<Input value={record.email ?? ''} disabled /></label><label>手機電話<Input value={record.phone ?? ''} disabled /></label><label>護理年資（年）<Input name="nursingYears" type="number" min={0} max={60} required defaultValue={record.profile?.nursingYears ?? ''} /></label><HospitalPicker defaultValue={record.profile?.hospital ?? ''} /><label>服務單位<Input name="unit" required maxLength={100} defaultValue={record.profile?.unit ?? ''} /></label><label>報考科別<NativeSelect name="examSpecialty" required defaultValue={record.profile?.examSpecialty ?? ''}><NativeSelectOption value="">請選擇</NativeSelectOption>{['內科','精神科','兒科','外科','婦產科','麻醉科','家庭科'].map((item) => <NativeSelectOption value={item} key={item}>{item}</NativeSelectOption>)}</NativeSelect></label><label>是否首次報考國家 OSCE<NativeSelect name="firstOsce" required defaultValue={record.profile?.firstOsce === null || record.profile?.firstOsce === undefined ? '' : record.profile.firstOsce ? 'yes' : 'no'}><NativeSelectOption value="">請選擇</NativeSelectOption><NativeSelectOption value="yes">是</NativeSelectOption><NativeSelectOption value="no">否</NativeSelectOption></NativeSelect></label><label>出生年月日<Input name="birthDate" type="date" required defaultValue={record.profile?.birthDate ?? ''} /></label></div><Button className="action" type="submit">{profileBusy ? '儲存中…' : '儲存個人資料'}</Button></fieldset></form></section> : <section className="profile-summary"><span>個人資料已完成</span><strong>{record.profile.examSpecialty}專科護理師</strong><p>{record.profile.hospital} · {record.profile.unit} · 護理年資 {record.profile.nursingYears} 年</p></section>}
          {!record.published ? (
            <section className="empty-panel">
              <h2>本梯次成績尚未公布</h2>
              <p>老師確認成績後，將於此頁開放查詢，請留意課程通知。</p>
            </section>
          ) : (
            <>
              <div className="student-summary">
                <div>
                  <span>評量紀錄</span>
                  <strong>
                    {record.grades.filter((g) => g.score !== null).length}
                    <small> / 4 題已登錄</small>
                  </strong>
                </div>
                <div>
                  <span>每題固定及格線</span>
                  <strong>
                    60<small> / 100</small>
                  </strong>
                </div>
                <p>
                  及格狀態以固定 60 分判定。
                  <br />
                  邊緣及格分數為各題 Rating＝3 學員的平均分數，另列供參考。
                </p>
              </div>
              {[1, 2].map((day) => (
                <section className="day-section" key={day}>
                  <div className="day-heading">
                    <span>DAY {String(day).padStart(2, '0')}</span>
                    <h2>第{day === 1 ? '一' : '二'}天 OSCE</h2>
                  </div>
                  <div className="student-score-grid">
                    {STATIONS.filter((s) => s.day === day).map((s) => {
                      const station = record.stations?.find((item) => item.key === s.key) ?? DEFAULT_STATIONS.find((item) => item.key === s.key)!;
                      const g = record.grades.find((g) => g.key === s.key),
                        score = g?.score ?? null,
                        t = record.thresholds.find((t) => t.key === s.key);
                      return (
                        <article className="student-score-card" key={s.key}>
                          <div className="panel-heading">
                            <h3>{station.title}</h3>
                            {station.prompt && <p className="form-help mt-1">{station.prompt}</p>}
                            <span
                              className={`result-badge ${score === null ? 'pending' : score >= 60 ? 'pass' : 'below'}`}
                            >
                              {gradeStatus(score)}
                            </span>
                          </div>
                          <div className="personal-score">
                            {formatScore(score)}
                            <span> / 100</span>
                          </div>
                          <div
                            className="score-track"
                            aria-label={`個人成績 ${formatScore(score)} 分，及格線 60 分，邊緣及格分數 ${formatScore(t?.value ?? null)}`}
                          >
                            <div
                              className="score-fill"
                              style={{ width: `${score ?? 0}%` }}
                            />
                            <i
                              className="pass-marker"
                              style={{ left: '60%' }}
                            />
                            {t?.value !== null && t?.value !== undefined && (
                              <i
                                className="border-marker"
                                style={{ left: `${t.value}%` }}
                              />
                            )}
                          </div>
                          <div className="track-labels">
                            <span>0</span>
                            <span>100</span>
                          </div>
                          <dl className="grade-details">
                            <div>
                              <dt>固定及格分數</dt>
                              <dd>60 分</dd>
                            </div>
                            <div>
                              <dt>邊緣及格分數</dt>
                              <dd>
                                {t?.value === null || t?.value === undefined
                                  ? '尚無法計算'
                                  : `${formatScore(t.value)} 分`}
                              </dd>
                            </div>
                            <div>
                              <dt>Global Rating</dt>
                              <dd>{g?.rating ?? '—'} / 5</dd>
                            </div>
                          </dl>
                          {g?.feedback && (
                            <div className="qualitative-feedback">
                              <strong>老師回饋</strong>
                              <p>{g.feedback}</p>
                            </div>
                          )}
                          <p className="score-note">
                            {t?.count
                              ? `邊緣分數採 ${t.count} 位 Rating＝3 學員的該題分數平均。`
                              : '本題尚無 Rating＝3 且已登錄分數的資料。'}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              <div className="score-legend">
                <span>
                  <i className="legend-fixed" />
                  固定及格線 60 分
                </span>
                <span>
                  <i className="legend-border" />
                  邊緣及格線
                </span>
              </div>
              <p className="portal-note">
                成績更新：
                {record.updatedAt
                  ? new Intl.DateTimeFormat('zh-TW', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Taipei',
                    }).format(new Date(record.updatedAt))
                  : '—'}
                。本頁為個人工作坊測驗紀錄，並非國家考試成績。顯示數值最多取至小數點後兩位。
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
