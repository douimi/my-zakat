import { useState } from 'react'
import { clsx } from 'clsx'

/** Long text clamped to a few lines, with a toggle only when it is long. */
const LongText = ({ text, lines = 2 }: { text: string | null | undefined; lines?: 2 | 3 | 4 }) => {
  const [open, setOpen] = useState(false)
  const value = text || '—'
  const long = value.length > 160 || value.split('\n').length > lines
  const clamp = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' }[lines]
  return (
    <div>
      <p className={clsx('text-sm text-gray-800 whitespace-pre-wrap', long && !open && clamp)}>{value}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-primary-700 hover:underline mt-0.5">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export default LongText
