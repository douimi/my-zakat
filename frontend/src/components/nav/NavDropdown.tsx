/**
 * A dropdown for the main navigation (Projects, Zakat, About, account menu).
 *
 * It follows the disclosure pattern rather than the ARIA menu pattern: the
 * trigger is a button with aria-expanded / aria-controls, and the panel holds
 * ordinary links. Ordinary links keep their "link" role, which matters: the e2e
 * suite reaches the admin console with getByRole('link', { name: /admin console/i })
 * from inside the account dropdown.
 *
 * Behaviour, shared by every dropdown in the header:
 *   - one click on the trigger toggles it;
 *   - a click outside, Escape, or tabbing out of it closes it
 *     (Escape also gives focus back to the trigger);
 *   - choosing a link inside closes it;
 *   - a route change closes it.
 */
import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

/** Classes for a top-level item of the desktop navigation (link or dropdown trigger). */
export const navItemClass = (active: boolean) =>
  clsx(
    'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
    active ? 'text-primary-700 bg-primary-50' : 'text-gray-700 hover:text-primary-700 hover:bg-gray-50',
  )

/** Classes for a link inside a dropdown panel. */
export const navPanelItemClass = (active: boolean) =>
  clsx(
    'mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    active ? 'text-primary-700 bg-primary-50 font-semibold' : 'text-gray-700 hover:text-primary-700 hover:bg-gray-50',
  )

interface NavDropdownProps {
  /** Visible trigger content. */
  label: ReactNode
  /** Accessible name for the trigger when `label` is an icon. */
  ariaLabel?: string
  /** The current route belongs to this dropdown. */
  active?: boolean
  align?: 'left' | 'right'
  /** Tailwind width class for the panel. */
  panelClassName?: string
  /** Replaces the default trigger classes (the chevron is then hidden). */
  triggerClassName?: string
  children: ReactNode
}

const NavDropdown = ({
  label,
  ariaLabel,
  active = false,
  align = 'left',
  panelClassName = 'w-64',
  triggerClassName,
  children,
}: NavDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        // Tabbing past the last link (or back past the trigger) closes the panel.
        const next = event.relatedTarget as Node | null
        if (next && containerRef.current && !containerRef.current.contains(next)) {
          setIsOpen(false)
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={ariaLabel}
        data-active={active}
        className={triggerClassName ?? navItemClass(active || isOpen)}
      >
        {label}
        {!triggerClassName && (
          <ChevronDown
            aria-hidden="true"
            className={clsx('h-4 w-4 flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
          />
        )}
      </button>

      {isOpen && (
        <div
          id={panelId}
          className={clsx(
            'absolute top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white py-2 shadow-lg',
            align === 'right' ? 'end-0' : 'start-0',
            panelClassName,
          )}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a, button')) setIsOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default NavDropdown
