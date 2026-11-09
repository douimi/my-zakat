import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  /** Render nothing when false. Defaults to true so `{show && <Modal …/>}` also works. */
  open?: boolean
  /** Dialog title, rendered as the <h2> that labels the dialog. */
  title: ReactNode
  onClose: () => void
  /** sm = max-w-md, md = max-w-lg (default), lg = max-w-2xl, xl = max-w-4xl. */
  size?: ModalSize
  /** Action row (e.g. Cancel + primary button), pinned under the scrolling body. */
  footer?: ReactNode
  /** Close when the dark backdrop is clicked. Off by default so a stray click never discards a form. */
  closeOnOverlayClick?: boolean
  /** Extra classes for the scrolling body. */
  bodyClassName?: string
  children: ReactNode
}

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Accessible admin dialog. The overlay keeps exactly `fixed inset-0 z-50` (e2e contract); Escape and the X button close it. */
const Modal = ({
  open = true, title, onClose, size = 'md', footer, closeOnOverlayClick = false, bodyClassName, children,
}: ModalProps) => {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    // A picker or confirm dialog opened on top of this one owns the keyboard:
    // Escape there must not also discard the form underneath.
    const isTopLayer = () => {
      const layers = document.querySelectorAll('.fixed.inset-0, [aria-modal="true"]')
      const top = layers[layers.length - 1]
      return !top || top === overlayRef.current || top === panelRef.current
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopLayer()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      // Keep Tab inside the dialog.
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={closeOnOverlayClick ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx('bg-white rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col', SIZE[size])}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 min-w-0">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className={clsx('flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>
        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
