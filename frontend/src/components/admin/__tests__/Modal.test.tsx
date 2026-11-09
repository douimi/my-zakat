import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Modal from '../Modal'

describe('admin Modal', () => {
  it('keeps the e2e overlay contract: exactly one div.fixed.inset-0.z-50', () => {
    const { container } = render(<Modal title="Edit user" onClose={() => {}}>Body</Modal>)
    expect(container.querySelectorAll('div.fixed.inset-0.z-50')).toHaveLength(1)
  })

  it('is a labelled modal dialog', () => {
    render(<Modal title="Edit user" onClose={() => {}}>Body</Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Edit user' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Body')
  })

  it('closes with the lucide X button', () => {
    const onClose = vi.fn()
    const { container } = render(<Modal title="Edit user" onClose={onClose}>Body</Modal>)
    const close = screen.getByRole('button', { name: /close/i })
    expect(close.querySelector('svg.lucide-x')).not.toBeNull()
    expect(container.querySelector('button:has(svg.lucide-x)')).toBe(close)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Modal title="Edit user" onClose={onClose}>Body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores backdrop clicks unless asked', () => {
    const onClose = vi.fn()
    const { container, rerender } = render(<Modal title="T" onClose={onClose}>Body</Modal>)
    const overlay = container.querySelector('div.fixed.inset-0.z-50')!
    fireEvent.mouseDown(overlay)
    expect(onClose).not.toHaveBeenCalled()

    rerender(<Modal title="T" onClose={onClose} closeOnOverlayClick>Body</Modal>)
    fireEvent.mouseDown(container.querySelector('div.fixed.inset-0.z-50')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByText('Body'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed, and renders the footer when given', () => {
    const { container, rerender } = render(<Modal open={false} title="T" onClose={() => {}}>Body</Modal>)
    expect(container.querySelector('div.fixed.inset-0.z-50')).toBeNull()
    rerender(<Modal title="T" onClose={() => {}} footer={<button type="button">Save</button>}>Body</Modal>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
