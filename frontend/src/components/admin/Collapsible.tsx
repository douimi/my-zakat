import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

/** A section that starts folded, with one line saying what is inside. Long
 *  text stays out of the way until someone asks for it. */
const Collapsible = ({ title, preview, defaultOpen = false, children }: {
  title: string
  preview?: string
  defaultOpen?: boolean
  children: ReactNode
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-start gap-2 px-6 py-3 text-left hover:bg-gray-50">
        <ChevronRight className={clsx('w-4 h-4 mt-0.5 text-gray-400 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-800">{title}</span>
          {!open && preview && <span className="block text-xs text-gray-500 truncate">{preview}</span>}
        </span>
      </button>
      {open && <div className="px-6 pb-4 pl-12 space-y-3">{children}</div>}
    </div>
  )
}

export default Collapsible
