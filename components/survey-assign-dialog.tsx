import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { SurveyInstrument } from '@/lib/surveys';

export function SurveyAssignDialog({ workshop, instruments, busy, error, onSave, onClose }: { workshop: { id: string; name: string }; instruments: SurveyInstrument[]; busy: boolean; error: string; onSave: (body: Record<string, unknown>) => Promise<boolean>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), requestId = useRef(crypto.randomUUID());
  const [choice, setChoice] = useState('');
  const selected = instruments.find(i => JSON.stringify([i.code, i.version]) === choice);
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); return () => { if (node?.open) node.close(); }; }, []);
  return <dialog ref={dialog} className="survey-modal" aria-labelledby="survey-assign-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="survey-modal-heading"><div><h2 id="survey-assign-title">加入量表</h2><p>{workshop.name}</p></div><button className="survey-modal-close" type="button" disabled={busy} aria-label="關閉量表清單" onClick={onClose}>×</button></header>
    <form onSubmit={async event => { event.preventDefault(); if (!selected) return; const fields = new FormData(event.currentTarget); if (await onSave({ workshopId: workshop.id, scaleCode: selected.code, scaleVersion: selected.version, requestId: requestId.current, note: String(fields.get('note') ?? ''), status: fields.get('publish') ? 'open' : 'draft' })) onClose(); }}>
      <fieldset className="survey-modal-fields" disabled={busy}><label>選擇量表<NativeSelect required value={choice} onChange={e => setChoice(e.target.value)}><NativeSelectOption value="">請選擇量表</NativeSelectOption>{instruments.map(i => <NativeSelectOption key={`${i.code}-${i.version}`} value={JSON.stringify([i.code, i.version])}>{i.definition.title}（{i.definition.items.length} 題）· {i.version}</NativeSelectOption>)}</NativeSelect></label>
        {!instruments.length && <p className="survey-muted">量表庫目前沒有可加入的內容。</p>}
        {selected?.definition.notice && <p className="survey-warning">{selected.definition.notice}</p>}
        <label>備註（僅老師可見）<textarea name="note" rows={2} maxLength={2000} placeholder="自行註記用途、日期或施測安排" /></label><label className="survey-check-label"><input name="publish" type="checkbox" defaultChecked/>加入後立即開放填答</label>
        <div className="survey-modal-actions"><Button type="button" className="action secondary" onClick={onClose}>取消</Button><Button type="submit" className="action" disabled={!selected}>{busy ? '加入中…' : '確認加入'}</Button></div>
      </fieldset>{error && <p className="notice error" role="alert">{error}</p>}
    </form>
  </dialog>;
}
