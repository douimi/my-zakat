import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { clsx } from 'clsx'

export interface FilterBarProps {
  /** Controlled search value. Omit both search props to render a bar with only the slot children. */
  search?: string
  onSearchChange?: (value: string) => void
  /** Pages keep their exact placeholder text (some are e2e anchors). */
  placeholder?: string
  /** Accessible name for the search box; defaults to the placeholder. */
  searchLabel?: string
  /** Filter controls (selects, toggles) shown after the search box. */
  children?: ReactNode
  /** Right-aligned extras, e.g. a result count. */
  trailing?: ReactNode
  className?: string
}

/** One white bar holding a list's search box and its filters, so every admin list filters the same way. */
const FilterBar = ({
  search, onSearchChange, placeholder = 'Search…', searchLabel, children, trailing, className,
}: FilterBarProps) => (
  <div className={clsx(
    'bg-white rounded-lg border border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3',
    className,
  )}>
    {onSearchChange && (
      <div className="relative w-full sm:max-w-sm sm:flex-1">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          type="search"
          value={search ?? ''}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel ?? placeholder}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-500"
        />
      </div>
    )}
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    {trailing && <div className="sm:ml-auto text-sm text-gray-500">{trailing}</div>}
  </div>
)

export default FilterBar
