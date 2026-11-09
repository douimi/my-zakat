import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export interface StatusBadgeProps {
  /** Colour only; the label text is yours (keep page-specific STATUS_LABEL maps and map them to a tone). */
  tone?: StatusTone
  icon?: LucideIcon
  title?: string
  className?: string
  children: ReactNode
}

const TONE: Record<StatusTone, string> = {
  neutral: 'badge-neutral',
  info: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  accent: 'badge-accent',
}

/** Rounded status pill with AA-contrast tone colours; the text content is rendered unchanged. */
const StatusBadge = ({ tone = 'neutral', icon: Icon, title, className, children }: StatusBadgeProps) => (
  <span className={clsx(TONE[tone], 'whitespace-nowrap', className)} title={title}>
    {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
    {children}
  </span>
)

export default StatusBadge
