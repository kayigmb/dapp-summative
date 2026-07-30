import { CheckCircle2, Circle, MapPin, PackageCheck } from 'lucide-react'

import { formatStatus } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'

export interface TimelineEntry {
  id: number
  new_status: string
  timestamp: string
  note?: string
  location?: string
  transaction_hash?: string
}

export function ShipmentTimeline({
  history,
  complete,
}: Readonly<{
  history: Array<TimelineEntry>
  complete: boolean
}>) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>
  }

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {history.map((entry, i) => {
        const isLast = i === history.length - 1
        return (
          <li key={entry.id} className="relative">
            <span
              className={cn(
                'absolute top-0.5 -left-[1.9rem] flex size-5 items-center justify-center rounded-full',
                isLast ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {isLast ? <PackageCheck className="size-3" /> : <CheckCircle2 className="size-3" />}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{formatStatus(entry.new_status)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            {entry.note && <p className="mt-1 text-sm">{entry.note}</p>}
            {entry.location && !entry.note && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3" /> {entry.location}
              </p>
            )}
            {entry.transaction_hash && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                tx: {entry.transaction_hash}
              </p>
            )}
          </li>
        )
      })}
      {!complete && (
        <li className="relative">
          <span className="absolute top-0.5 -left-[1.9rem] flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Circle className="size-3" />
          </span>
          <span className="text-xs text-muted-foreground">Awaiting next update…</span>
        </li>
      )}
    </ol>
  )
}
