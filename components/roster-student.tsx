import { Check, X } from 'lucide-react';
import { Tooltip } from '@base-ui/react/tooltip';

type RosterRecord = { name: string; [key: string]: unknown };

export function RosterStudentName({ student }: { student: RosterRecord }) {
  const active = Boolean(student.account_activated_at);
  const status = active ? '已完成啟用' : '待完成啟用';
  const Icon = active ? Check : X;
  const display = (value: unknown) => value === null || value === undefined || value === '' ? '尚未填寫' : String(value);
  const fields = [
    ['Email', student.email],
    ['手機電話', student.phone],
    ['護理年資', student.nursing_years == null ? null : `${student.nursing_years} 年`],
    ['服務醫院', student.hospital],
    ['服務單位', student.unit],
    ['報考科別', student.exam_specialty],
    ['首次報考國家 OSCE', student.first_osce === true ? '是' : student.first_osce === false ? '否' : null],
    ['出生年月日', student.birth_date],
  ];
  return <Tooltip.Root>
    <Tooltip.Trigger delay={150} closeDelay={120} closeOnClick={false} className="inline-flex cursor-help items-center gap-2 rounded text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#174943]">
      {student.name}
      <span role="img" aria-label={status} title={status}>
        <Icon className={`h-5 w-5 ${active ? 'text-emerald-700' : 'text-red-600'}`} strokeWidth={2.5} aria-hidden="true" />
      </span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner side="right" align="start" sideOffset={12} collisionPadding={12} className="z-50">
        <Tooltip.Popup className="w-80 max-w-[calc(100vw-24px)] rounded-xl border border-[#cbdacf] bg-white p-5 text-sm text-[#133b38] shadow-xl">
          <div className="mb-3 border-b border-[#dbe4dc] pb-3"><strong className="text-base">{student.name}</strong><span className={`ml-3 text-xs ${active ? 'text-emerald-700' : 'text-red-600'}`}>{status}</span></div>
          <dl className="space-y-2">{fields.map(([label, value]) => <div className="grid grid-cols-[7rem_1fr] gap-2" key={String(label)}>
            <dt className="text-xs text-slate-500">{String(label)}</dt><dd className="min-w-0 break-words">{display(value)}</dd>
          </div>)}</dl>
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
