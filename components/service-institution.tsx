import { useState } from 'react';
import { HospitalPicker, type Hospital } from './hospital-picker';
import { Input } from './ui/input';

export function ServiceInstitution({ hospital = '', unit = '', serviceKind = 'hospital', hospitals, loading }: {
  hospital?: string; unit?: string; serviceKind?: string; hospitals: Hospital[]; loading: boolean;
}) {
  const [kind, setKind] = useState(serviceKind);
  const [previousKind, setPreviousKind] = useState(serviceKind === 'unemployed' ? 'hospital' : serviceKind);
  const [custom, setCustom] = useState(serviceKind === 'unemployed' ? '' : hospital);
  const [department, setDepartment] = useState(unit);
  const unemployed = kind === 'unemployed';
  return <div className="service-institution">
    <label className="employment-check"><input type="checkbox" checked={unemployed} onChange={event => {
      if (event.target.checked) { setPreviousKind(kind); setKind('unemployed'); } else setKind(previousKind);
    }}/>待業中</label>
    <input type="hidden" name="serviceKind" value={kind}/>
    {unemployed ? <label>目前服務狀態／機構<Input value="目前待業中" readOnly/><input type="hidden" name="hospital" value="目前待業中"/></label> : <>
      <label>目前服務狀態／機構<select value={kind} onChange={event => setKind(event.target.value)} className="block w-full rounded border p-3">
        <option value="hospital">任職醫療院所（搜尋名冊）</option>
        <option value="custom_medical">任職醫療院所（清單中找不到）</option>
        <option value="non_medical">任職非醫療機構</option>
      </select></label>
      {kind === 'hospital' ? <HospitalPicker defaultValue={serviceKind === 'hospital' ? hospital : ''} hospitals={hospitals} loading={loading}/> : <label>{kind === 'non_medical' ? '機構名稱' : '院所名稱'}<Input name="hospital" value={custom} onChange={event => setCustom(event.target.value)} required maxLength={200} placeholder="請填寫完整名稱"/></label>}
    </>}
    <label>服務單位（選填）<Input value={unemployed ? '' : department} onChange={event => setDepartment(event.target.value)} disabled={unemployed} maxLength={100}/><input type="hidden" name="unit" value={unemployed ? '' : department}/></label>
  </div>;
}

export function serviceInstitutionValues(fields: FormData, hospitals: Hospital[], allowEmpty = false) {
  const serviceKind = String(fields.get('serviceKind') ?? 'hospital');
  const hospital = String(fields.get('hospital') ?? '').trim();
  const unit = String(fields.get('unit') ?? '').trim();
  if (serviceKind === 'unemployed') return { serviceKind, hospital: '目前待業中', unit: '' };
  if ((!hospital && !allowEmpty) || hospital.length > 200) throw new Error('請填寫服務機構，或勾選「待業中」。');
  if (serviceKind === 'hospital' && (hospital || fields.get('hospitalQuery')) && !hospitals.some(item => item.name === hospital)) throw new Error('請點選醫院搜尋結果；找不到時選擇「清單中找不到」。');
  return { serviceKind, hospital, unit };
}
