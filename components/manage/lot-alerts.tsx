import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { LotAlert } from '@/lib/lot-alerts';

const KIND_LABEL: Record<LotAlert['kind'], string> = {
  retest_due: 'Retest due',
  retest_overdue: 'Retest overdue',
  quarantine_ageing: 'Quarantine ageing',
  low_on_hand: 'Low on hand',
  no_sds: 'No SDS',
  no_manufacturer: 'Manufacturer missing',
};

export function LotAlerts({ alerts, compact = false }: { alerts: LotAlert[]; compact?: boolean }) {
  if (alerts.length === 0) return null;
  const shown = compact ? alerts.slice(0, 6) : alerts;
  return (
    <div className="border border-border">
      <p className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-3 text-sm font-semibold">
        <AlertTriangle className="size-4 text-destructive" /> {alerts.length} lot alert{alerts.length === 1 ? '' : 's'}
        {compact && alerts.length > shown.length && (
          <Link href="/manage/lots" className="ml-auto font-semibold text-primary hover:underline">
            All alerts
          </Link>
        )}
      </p>
      <ul className="divide-y divide-border text-sm">
        {shown.map((a, i) => (
          <li key={`${a.lotNumber}-${a.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
            <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${a.severity === 'urgent' ? 'text-destructive' : 'text-muted-foreground'}`}>{KIND_LABEL[a.kind]}</span>
            <Link href={`/manage/lots/${encodeURIComponent(a.lotNumber)}`} className="font-mono text-xs font-semibold text-primary hover:underline">
              {a.lotNumber}
            </Link>
            <span className="text-muted-foreground">{a.productName}</span>
            <span>{a.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
