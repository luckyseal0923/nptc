import { useState } from 'react';
import { HospitalPicker, type Hospital } from './hospital-picker';
import { Input } from './ui/input';

export function ServiceInstitution({ hospital = '', unit = '', serviceKind = 'hospital', hospitals, loading }: {
  hospital?: string; unit?: string; serviceKind?: string; hospitals: Hospital[]; loading: boolean;
}) {
  const [kind, setKind] = useState(serviceKind);
  const [custom, setCustom] = useState(serviceKind === 'unemployed' || serviceKind === 'hospital' ? '' : hospital);
  const [department, setDepartment] = useState(unit);
  const unemployed = kind === 'unemployed';
  const outsideList = kind === 'custom_medical' || kind === 'non_medical';
  return <div className="service-institution">
    <input type="hidden" name="serviceKind" value={kind}/>
    <HospitalPicker defaultValue={serviceKind === 'hospital' ? hospital : ''} hospitals={hospitals} loading={loading} disabled={kind !== 'hospital'}/>
    <div className="institution-other-row">
      <label className="employment-check"><input type="checkbox" checked={outsideList} onChange={event => setKind(event.target.checked ? (serviceKind === 'non_medical' ? 'non_medical' : 'custom_medical') : 'hospital')}/>服務機構不在清單內</label>
      <Input aria-label="清單外服務機構名稱" name="hospital" value={custom} onChange={event => setCustom(event.target.value)} disabled={!outsideList} required={outsideList} maxLength={200} placeholder="請輸入服務機構名稱"/>
    </div>
    <label className="employment-check"><input type="checkbox" checked={unemployed} onChange={event => setKind(event.target.checked ? 'unemployed' : 'hospital')}/>待業中</label>
    {unemployed && <><input type="hidden" name="hospital" value="目前待業中"/><small>目前服務狀態／機構：目前待業中</small></>}
    <label>服務單位（選填）<Input value={unemployed ? '' : department} onChange={event => setDepartment(event.target.value)} disabled={unemployed} maxLength={100}/><input type="hidden" name="unit" value={unemployed ? '' : department}/></label>
  </div>;
}

export function serviceInstitutionValues(fields: FormData, hospitals: Hospital[], allowEmpty = false) {
  const serviceKind = String(fields.get('serviceKind') ?? 'hospital');
  const hospital = String(fields.get('hospital') ?? '').trim();
  const unit = String(fields.get('unit') ?? '').trim();
  if (serviceKind === 'unemployed') return { serviceKind, hospital: '目前待業中', unit: '' };
  if ((!hospital && !allowEmpty) || hospital.length > 200) throw new Error('請填寫服務機構，或勾選「待業中」。');
  if (serviceKind === 'hospital' && (hospital || fields.get('hospitalQuery')) && !hospitals.some(item => item.name === hospital)) throw new Error('請點選醫院搜尋結果；找不到時勾選「服務機構不在清單內」。');
  return { serviceKind, hospital, unit };
}
