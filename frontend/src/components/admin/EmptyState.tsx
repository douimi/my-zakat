import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

export interface EmptyStateProps {
  icon?: LucideIcon
  /** Short statement, e.g. "No templates yet". */
  title: ReactNode
  /** One line on what to do next. */
  body?: ReactNode
  /** Usually the page's primary "New …" button. */
  action?: ReactNode
  className?: string
}

/** Centred "nothing here yet" panel for empty lists and tabs, with an optional next action. */
const EmptyState = ({ icon: Icon, title, body, action, className }: EmptyStateProps) => (
  <div className={clsx('rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center', className)}>
    {Icon && <Icon className="mx-auto mb-3 w-10 h-10 text-gray-400" aria-hidden="true" />}
    <p className="text-base font-semibold text-gray-900">{title}</p>
    {body && <p className="mt-1 text-sm text-gray-600">{body}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
)

export default EmptyState
