import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

export interface ErrorStateProps {
  /** What failed, in plain words, e.g. "Could not load donations." */
  message: ReactNode
  /** Shows a "Try again" button when given. */
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

/** Inline error banner for a failed list load, so an error never looks like "no data". */
const ErrorState = ({ message, onRetry, retryLabel = 'Try again', className }: ErrorStateProps) => (
  <div role="alert" className={clsx('alert-error items-center justify-between flex-wrap', className)}>
    <span className="flex items-start gap-2 min-w-0">
      <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn-secondary btn-sm gap-2">
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        {retryLabel}
      </button>
    )}
  </div>
)

export default ErrorState
