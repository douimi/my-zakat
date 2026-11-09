import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

const ToastComponent = ({ toast, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, toast.duration || 5000)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onClose])

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle aria-hidden="true" className="w-5 h-5 text-green-600 flex-shrink-0" />
      case 'error':
        return <XCircle aria-hidden="true" className="w-5 h-5 text-red-600 flex-shrink-0" />
      case 'warning':
        return <AlertCircle aria-hidden="true" className="w-5 h-5 text-amber-600 flex-shrink-0" />
      case 'info':
        return <Info aria-hidden="true" className="w-5 h-5 text-primary-600 flex-shrink-0" />
    }
  }

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-900'
      case 'info':
        return 'bg-primary-50 border-primary-200 text-primary-900'
    }
  }

  return (
    // Errors interrupt (role=alert, assertive); everything else waits its turn (role=status, polite).
    // Donate's validation errors are toast-only, so this is how a screen reader hears them.
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`w-[calc(100vw-2rem)] max-w-sm sm:w-auto sm:min-w-[300px] shadow-lg rounded-lg border ${getStyles()} transition-all duration-300 ease-in-out`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words">
              {toast.title}
            </p>
            {toast.message && (
              <p className="mt-1 text-sm opacity-90 break-words">
                {toast.message}
              </p>
            )}
          </div>
          <div className="flex-shrink-0">
            <button
              type="button"
              className="-m-1 inline-flex rounded p-1 text-gray-500 transition-colors hover:text-gray-700"
              onClick={() => onClose(toast.id)}
              aria-label="Close notification"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ToastComponent
