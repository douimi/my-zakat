import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export interface PageHeaderProps {
  /** Small uppercase label above the title (e.g. "Zakat guide"). */
  eyebrow?: ReactNode
  /** Rendered as the page's single <h1>. */
  title: ReactNode
  /** One or two sentences at most. */
  description?: ReactNode
  /** Primary (and at most one secondary) action, e.g. a `.btn-primary` link. */
  actions?: ReactNode
  /** `left` (default) or `center`. */
  align?: 'left' | 'center'
  className?: string
  /** Extra content under the header text (e.g. a breadcrumb or meta line). */
  children?: ReactNode
}

/** Light gray-50 public page header with a single h1; replaces the five ad-hoc hero styles on text pages. */
const PageHeader = ({ eyebrow, title, description, actions, align = 'left', className, children }: PageHeaderProps) => {
  const centered = align === 'center'
  return (
    <div className={clsx('page-header', className)}>
      <div className={clsx('section-container', centered && 'text-center')}>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className={clsx('page-lead', centered && 'mx-auto')}>{description}</p>}
        {children}
        {actions && (
          <div className={clsx('mt-6 flex flex-wrap gap-3', centered && 'justify-center')}>{actions}</div>
        )}
      </div>
    </div>
  )
}

export default PageHeader
