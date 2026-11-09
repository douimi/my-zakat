import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToastComponent from '../Toast'

describe('Toast', () => {
  it('announces an error assertively', () => {
    render(<ToastComponent toast={{ id: '1', type: 'error', title: 'Payment failed', message: 'Try another card.' }} onClose={vi.fn()} />)

    const toast = screen.getByRole('alert')
    expect(toast).toHaveTextContent('Payment failed')
    expect(toast).toHaveTextContent('Try another card.')
  })

  it('announces other toasts politely', () => {
    render(<ToastComponent toast={{ id: '2', type: 'success', title: 'Saved' }} onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('can be closed from its labelled button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ToastComponent toast={{ id: '3', type: 'info', title: 'Heads up' }} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close notification' }))
    expect(onClose).toHaveBeenCalledWith('3')
  })
})
