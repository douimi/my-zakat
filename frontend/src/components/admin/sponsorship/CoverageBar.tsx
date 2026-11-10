import { clsx } from 'clsx'
import type { Coverage } from '../../../utils/sponsorshipApi'
import { money } from './format'

/** How much of a published case's monthly need is committed by sponsors. */
const CoverageBar = ({ coverage, compact = false }: { coverage: Coverage; compact?: boolean }) => {
  const pct = Math.max(0, Math.min(100, coverage.percent || 0))
  const need = coverage.monthly_need_cents ?? 0
  const label = `${pct}% sponsored: ${money(coverage.committed_cents)} of ${money(need)} a month`
  return (
    <div className={clsx(compact ? 'w-28' : 'w-full')} title={label}>
      <div
        className="h-2 rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div
          className={clsx('h-full rounded-full', coverage.state === 'full' ? 'bg-green-600' : coverage.state === 'partial' ? 'bg-amber-500' : 'bg-gray-300')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-600 whitespace-nowrap">
        {pct}% · {money(coverage.committed_cents)} / {money(need)}
        {coverage.overfunded && <span className="ml-1 font-semibold text-amber-800">over-funded</span>}
      </p>
    </div>
  )
}

export default CoverageBar
