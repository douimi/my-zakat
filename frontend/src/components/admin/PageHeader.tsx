import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Collapsible from './Collapsible'

export interface AdminPageHeaderProps {
  /** The page's single <h1> (the layout top bar must not render another one). */
  title: string
  icon?: LucideIcon
  /** Item count shown as a neutral pill next to (not inside) the h1, so the heading's name stays exact. */
  count?: number
  /** Any extra pill(s) next to the title. */
  badge?: ReactNode
  /** One line only. Longer explanations go in `help`. */
  description?: ReactNode
  /** Primary action first; at most one filled button. */
  actions?: ReactNode
  /** Multi-sentence "how it works" text, folded by default. */
  help?: ReactNode
  helpTitle?: string
}

/** Standard admin page header: icon + h1 + count, one-line description, actions on the right, optional folded help. */
const PageHeader = ({
  title, icon: Icon, count, badge, description, actions, help, helpTitle = 'How this works',
}: AdminPageHeaderProps) => (
  <div className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="flex items-center gap-2 sm:gap-3 text-xl sm:text-2xl font-bold text-gray-900">
            {Icon && <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary-600 shrink-0" aria-hidden="true" />}
            {title}
          </h1>
          {count !== undefined && <span className="badge-neutral">{count}</span>}
          {badge}
        </div>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
    {help && (
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <Collapsible title={helpTitle}>
          <div className="text-sm text-gray-600 space-y-2">{help}</div>
        </Collapsible>
      </div>
    )}
  </div>
)

export default PageHeader
