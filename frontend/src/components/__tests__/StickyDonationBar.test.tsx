import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import StickyDonationBar from '../StickyDonationBar'

const settings = vi.hoisted(() => ({ value: [] as { key: string; value: string }[] }))

vi.mock('../../utils/api', () => ({
  settingsAPI: { getAll: vi.fn(async () => settings.value) },
}))

const LocationProbe = () => {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

const renderAt = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="*" element={<><StickyDonationBar /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )

// The bar appears after a 1s delay; findBy waits up to 1.5s.
const findBar = () => screen.findByRole('complementary', { name: /quick donation/i }, { timeout: 1500 })

describe('StickyDonationBar', () => {
  beforeEach(() => {
    sessionStorage.clear()
    settings.value = [{ key: 'sticky_donation_bar_enabled', value: 'true' }]
  })

  it('shows when enabled, with labelled controls', async () => {
    renderAt('/')

    await findBar()
    expect(screen.getByText('Give now')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Donation amount' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Frequency' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '$50' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('stays off when the setting is disabled', async () => {
    settings.value = [{ key: 'sticky_donation_bar_enabled', value: 'false' }]
    renderAt('/')

    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(screen.queryByRole('complementary', { name: /quick donation/i })).toBeNull()
  })

  it.each(['/donate', '/zakat-calculator', '/terms-of-service', '/submit-proposal', '/my-proposals'])(
    'is hidden on %s, where it would compete with the page',
    async (route) => {
      renderAt(route)

      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(screen.queryByRole('complementary', { name: /quick donation/i })).toBeNull()
    },
  )

  it('sends the chosen amount and frequency to /donate', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await findBar()

    await user.click(screen.getByRole('button', { name: '$100' }))
    expect(screen.getByRole('button', { name: '$100' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency' }), 'Monthly')
    await user.click(screen.getByRole('button', { name: 'Donate' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/donate?amount=100&frequency=Monthly')
  })

  it('is remembered as dismissed for the session', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await findBar()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('complementary', { name: /quick donation/i })).toBeNull()
    expect(sessionStorage.getItem('sticky_donation_bar_dismissed')).toBe('true')
    await waitFor(() => expect(screen.queryAllByLabelText(/email/i)).toHaveLength(0))
  })
})
