import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Modal from '../Modal'

describe('admin Modal with a dialog on top', () => {
  it('leaves Escape to a picker or confirm opened over it, so the form underneath survives', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal title="Edit story" onClose={onClose}>
        <div>Form</div>
      </Modal>
    )

    // A media picker (its own fixed inset-0 overlay) opens inside the form.
    rerender(
      <Modal title="Edit story" onClose={onClose}>
        <div>Form</div>
        <div className="fixed inset-0 z-50" data-testid="picker">Picker</div>
      </Modal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    // Picker closed: Escape belongs to the form dialog again.
    rerender(
      <Modal title="Edit story" onClose={onClose}>
        <div>Form</div>
      </Modal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
