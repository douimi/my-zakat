import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CampaignPopup from '../CampaignPopup'

const CAMPAIGN = {
  id: 3,
  title: 'Winter appeal',
  description: 'Blankets and heaters for families.',
  image_url: null,
  amount: 50,
  cta_text: 'Give now',
  redirect_url: null,
  is_active: true,
  updated_at: '2026-11-01T10:00:00',
}

const renderPopup = () =>
  render(
    <MemoryRouter>
      <CampaignPopup />
    </MemoryRouter>,
  )

/** Let the fetch promise chain resolve under fake timers. */
const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('CampaignPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => CAMPAIGN })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits before covering the page, then opens as a labelled dialog', async () => {
    renderPopup()
    await flush()

    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => { vi.advanceTimersByTime(6000) })
    const dialog = screen.getByRole('dialog', { name: 'Winter appeal' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('opens early on the first real scroll', async () => {
    renderPopup()
    await flush()

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 400, configurable: true })
      window.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getByRole('dialog', { name: 'Winter appeal' })).toBeInTheDocument()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('closes on Escape and stays closed for the rest of the session', async () => {
    const { unmount } = renderPopup()
    await flush()
    act(() => { vi.advanceTimersByTime(8000) })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()

    // A second visit to Home in the same session.
    renderPopup()
    await flush()
    act(() => { vi.advanceTimersByTime(10000) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('comes back when the campaign is edited (new updated_at)', async () => {
    sessionStorage.setItem(`campaign_popup_dismissed:3:2026-10-01T00:00:00`, 'true')
    renderPopup()
    await flush()
    act(() => { vi.advanceTimersByTime(8000) })

    expect(screen.getByRole('dialog', { name: 'Winter appeal' })).toBeInTheDocument()
  })
})
