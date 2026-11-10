import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import type { StaffCase } from '../../../utils/sponsorshipApi'

/** Props every case tab receives. */
export interface CaseTabProps {
  case: StaffCase
  isAdmin: boolean
  /** Replace the page's copy of the case with what a write returned. */
  onUpdated: (c: StaffCase) => void
  /** Re-fetch the case (for writes that do not return it). */
  refresh: () => void
}

/** A titled white panel, the unit every tab is built from. */
export const Panel = ({ title, actions, children, className, flush = false }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** No inner padding: for tables and Collapsible lists that pad themselves. */
  flush?: boolean
}) => (
  <section className={clsx('bg-white rounded-lg border border-gray-200', className)}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-gray-100">
        {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={flush ? '' : 'px-4 sm:px-6 py-4'}>{children}</div>
  </section>
)

/** A label/value grid for key facts. */
export const Facts = ({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => (
  <dl className={clsx('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2',
    cols === 3 && 'lg:grid-cols-3', cols === 4 && 'lg:grid-cols-4')}>
    {children}
  </dl>
)

export const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-gray-500">{label}</dt>
    <dd className="mt-0.5 text-sm text-gray-900 break-words">{children ?? '—'}</dd>
  </div>
)

/** A big number with a caption, for overview tiles. */
export const Stat = ({ label, value, hint, tone = 'default' }: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'warning' | 'danger' | 'success'
}) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p className={clsx('mt-1 text-2xl font-bold tabular-nums',
      tone === 'warning' ? 'text-amber-700' : tone === 'danger' ? 'text-red-700' : tone === 'success' ? 'text-green-700' : 'text-gray-900')}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
)

/** Shorten a text to its first line for a collapsed preview. */
export const firstLine = (text: string | null | undefined, max = 120): string => {
  const line = (text || '').split('\n').find((l) => l.trim()) || ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** The HTTP status of an axios error, if any. */
export const httpStatus = (e: unknown): number | undefined =>
  (e as { response?: { status?: number } })?.response?.status
