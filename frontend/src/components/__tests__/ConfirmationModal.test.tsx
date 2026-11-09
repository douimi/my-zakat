import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmationModal from '../ConfirmationModal'

const renderModal = (overrides: Partial<Parameters<typeof ConfirmationModal>[0]> = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete program?',
    message: 'This cannot be undone.',
    confirmText: 'Delete',
    ...overrides,
  }
  render(<ConfirmationModal {...props} />)
  return props
}

describe('ConfirmationModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled, described modal dialog on the shared overlay classes', () => {
    renderModal()

    const dialog = screen.getByRole('dialog', { name: 'Delete program?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
    // e2e treats `div.fixed.inset-0.z-50` as "a modal is open".
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0', 'z-50')
  })

  it('focuses Cancel (the safe choice) on open', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('closes on Escape and from the labelled X button', async () => {
    const user = userEvent.setup()
    const props = renderModal()

    await user.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.tab() // Cancel -> Delete
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.tab() // wraps to the first focusable (the X)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('confirms', async () => {
    const user = userEvent.setup()
    const props = renderModal()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
  })
})
