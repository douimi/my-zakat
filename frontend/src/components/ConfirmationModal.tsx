import { useEffect, useId, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
}

const variantStyles = {
  danger: {
    icon: 'text-red-600',
    iconBg: 'bg-red-100',
    button: 'btn-danger',
  },
  warning: {
    icon: 'text-amber-600',
    iconBg: 'bg-amber-100',
    button: 'btn bg-amber-600 text-white hover:bg-amber-700',
  },
  info: {
    icon: 'text-primary-600',
    iconBg: 'bg-primary-100',
    button: 'btn-primary',
  },
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false
}: ConfirmationModalProps) => {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Read through a ref so a parent passing a new onClose each render does not re-run the effect
  // (which would pull focus back to Cancel).
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const loadingRef = useRef(isLoading)
  loadingRef.current = isLoading

  // Focus the safe choice on open, keep Tab inside the dialog, close on Escape,
  // and give focus back to whatever opened the dialog.
  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!loadingRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  const styles = variantStyles[variant]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="bg-white rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`${styles.iconBg} rounded-full p-3 flex-shrink-0`}>
              <AlertTriangle aria-hidden="true" className={`w-6 h-6 ${styles.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 mb-2">
                {title}
              </h2>
              <p id={messageId} className="text-gray-600">
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              aria-label="Close"
              className="-m-1 p-1 rounded text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              <X aria-hidden="true" className="w-5 h-5" />
            </button>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn-secondary btn-sm"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`${styles.button} btn-sm`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
