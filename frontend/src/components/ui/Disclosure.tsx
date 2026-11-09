import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export interface DisclosureProps {
  /** Always-visible label of the section. */
  title: ReactNode
  /** One line shown under the title while closed (hidden once open). Do not repeat body text verbatim. */
  summary?: ReactNode
  /** Start expanded. The owner's rule is collapsed by default, so use sparingly. */
  defaultOpen?: boolean
  /** `card` = bordered white panel (default); `plain` = borderless, for stacked lists inside a `divide-y` card. */
  variant?: 'card' | 'plain'
  id?: string
  className?: string
  children: ReactNode
}

/** Collapsed-by-default section on native <details>: keyboard/SR friendly, and the body stays in the DOM while closed. */
const Disclosure = ({ title, summary, defaultOpen = false, variant = 'card', id, className, children }: DisclosureProps) => (
  <details
    id={id}
    open={defaultOpen || undefined}
    className={clsx('disclosure', variant === 'plain' && 'disclosure-plain', className)}
  >
    <summary>
      <span className="min-w-0 flex-1">
        <span className="disclosure-title">{title}</span>
        {summary && <span className="disclosure-summary">{summary}</span>}
      </span>
    </summary>
    <div className="space-y-3">{children}</div>
  </details>
)

export default Disclosure
