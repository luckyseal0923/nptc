import { useEffect, useRef, useState } from 'react';
import { HospitalPicker, type Hospital } from '@/components/hospital-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { rpc } from '@/lib/supabase';
import type { Student } from '@/lib/grading';

export function StudentEditDialog({ student, busy, error, onClose, onSave }: {
  student: Student; busy: boolean; error: string; onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState('');
  const value = (key: string) => student[key] == null ? '' : String(student[key]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const controller = new AbortController();
    rpc<{ hospitals: Hospital[] }>('nptc_hospital_directory', {}, controller.signal)
      .then(data => setHospitals(data.hospitals))
      .catch(cause => { if (cause.name !== 'AbortError') setLocalError('無法載入醫院名冊，請關閉視窗後重試。'); })
      .finally(() => setLoading(false));
    return () => { controller.abort(); element?.close(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby="student-edit-title" className="student-edit-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="panel-heading"><h2 id="student-edit-title">編輯學員基本資料</h2><Button type="button" variant="outline" disabled={busy} onClick={onClose}>關閉</Button></div>
    <p className="form-help">基本資料更新適用於目前梯次。</p>
    <form className="entry-form" onSubmit={async event => {
      event.preventDefault(); setLocalError('');
      const fields = new FormData(event.currentTarget);
      const hospital = String(fields.get('hospital') ?? '');
      const hospitalQuery = event.currentTarget.querySelector<HTMLInputElement>('.hospital-picker input:not([type="hidden"])')?.value.trim();
      if (hospitalQuery && !hospital) { setLocalError('請點選搜尋結果中的服務醫院，或清空搜尋欄位。'); return; }
      if (hospital && !hospitals.some(item => item.name === hospital)) { setLocalError('請從官方名冊選擇服務醫院。'); return; }
      const nullable = (key: string) => fields.get(key) === '' ? null : fields.get(key);
      await onSave({ action: 'saveStudent', id: student.id, revision: student.revision,
        name: fields.get('name'), email: fields.get('email'), phone: fields.get('phone'),
        profile: { nursingYears: nullable('nursingYears') === null ? null : Number(fields.get('nursingYears')),
          hospital, unit: fields.get('unit'), examSpecialty: fields.get('examSpecialty'),
          firstOsce: nullable('firstOsce') === null ? null : fields.get('firstOsce') === 'yes', birthDate: nullable('birthDate') },
      });
    }}><fieldset disabled={busy || loading || hospitals.length === 0}>
      <div className="profile-grid">
        <label>姓名<Input name="name" required maxLength={100} defaultValue={student.name}/></label>
        <label>Email<Input name="email" type="email" required maxLength={254} defaultValue={student.email} readOnly/></label>
        <label>手機電話<Input name="phone" type="tel" required pattern="09[0-9]{8}" inputMode="numeric" defaultValue={student.phone}/></label>
        <label>護理年資<Input name="nursingYears" type="number" min={0} max={60} step={1} defaultValue={value('nursing_years')}/></label>
        <HospitalPicker defaultValue={value('hospital')} hospitals={hospitals} loading={loading}/>
        <label>服務單位<Input name="unit" maxLength={100} defaultValue={value('unit')}/></label>
        <label>報考科別<NativeSelect name="examSpecialty" defaultValue={value('exam_specialty')}><NativeSelectOption value="">尚未填寫</NativeSelectOption>{['內科','精神科','兒科','外科','婦產科','麻醉科','家庭科'].map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
        <label>首次報考國家 OSCE<NativeSelect name="firstOsce" defaultValue={student.first_osce == null ? '' : student.first_osce ? 'yes' : 'no'}><NativeSelectOption value="">尚未填寫</NativeSelectOption><NativeSelectOption value="yes">是</NativeSelectOption><NativeSelectOption value="no">否</NativeSelectOption></NativeSelect></label>
        <label>出生年月日<Input name="birthDate" type="date" min="1900-01-01" defaultValue={value('birth_date')}/></label>
      </div>
      <p className="form-help">Email 為唯讀，登入帳號不會因本次編輯而變更。</p>
      {(localError || error) && <p role="alert" className="notice error">{localError || error}</p>}
      <div className="form-actions"><Button type="submit" className="action">{busy ? '儲存中…' : '儲存學員資料'}</Button><Button type="button" variant="outline" onClick={onClose}>取消</Button></div>
    </fieldset></form>
    {loading && <p role="status">正在載入醫院名冊…</p>}
    {!loading && hospitals.length === 0 && <p role="alert" className="notice error">{localError || '醫院名冊尚未載入，請重新開啟。'}</p>}
  </dialog>;
}
