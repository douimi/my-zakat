import { clsx } from 'clsx'

export interface LoadingBlockProps {
  /** Announced to screen readers (visually hidden). */
  label?: string
  className?: string
}

/** The single admin loading spinner (h-8 w-8 primary ring) in a padded, centred block with role="status". */
const LoadingBlock = ({ label = 'Loading…', className }: LoadingBlockProps) => (
  <div role="status" className={clsx('flex items-center justify-center py-12', className)}>
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </div>
)

export default LoadingBlock
