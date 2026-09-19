import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FundingMenu, { FundingMenuMobile, FUNDING_ROUTES } from '../FundingMenu'

const renderDesktop = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <FundingMenu />
    </MemoryRouter>,
  )

describe('FundingMenu (desktop)', () => {
  it('starts closed and opens on click', async () => {
    const user = userEvent.setup()
    renderDesktop()

    const trigger = screen.getByRole('button', { name: /apply for funding/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('offers both destinations, each explained', async () => {
    const user = userEvent.setup()
    renderDesktop()
    await user.click(screen.getByRole('button', { name: /apply for funding/i }))

    const submit = screen.getByRole('menuitem', { name: /submit a project proposal/i })
    const check = screen.getByRole('menuitem', { name: /check my application/i })

    expect(submit).toHaveAttribute('href', '/submit-proposal')
    expect(check).toHaveAttribute('href', '/my-proposals')
    expect(screen.getByText(/tell us about your project/i)).toBeInTheDocument()
    expect(screen.getByText(/where your request stands/i)).toBeInTheDocument()
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup()
    renderDesktop()
    const trigger = screen.getByRole('button', { name: /apply for funding/i })
    await user.click(trigger)
    // Move focus into the menu first. Without this the assertion below is
    // vacuous: user.click leaves focus on the trigger, so it "has focus"
    // after Escape whether or not the component puts it back.
    await user.tab()
    expect(screen.getByRole('menuitem', { name: /submit a project proposal/i })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when a destination is chosen', async () => {
    const user = userEvent.setup()
    renderDesktop()
    await user.click(screen.getByRole('button', { name: /apply for funding/i }))

    await user.click(screen.getByRole('menuitem', { name: /submit a project proposal/i }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks itself current on both of its routes', () => {
    for (const route of FUNDING_ROUTES) {
      const { unmount } = renderDesktop(route)
      expect(screen.getByRole('button', { name: /apply for funding/i }))
        .toHaveAttribute('data-active', 'true')
      unmount()
    }
  })

  it('is not marked current elsewhere', () => {
    renderDesktop('/stories')
    expect(screen.getByRole('button', { name: /apply for funding/i }))
      .toHaveAttribute('data-active', 'false')
  })
})

describe('FundingMenuMobile', () => {
  it('shows both destinations with no expanding step', () => {
    const onNavigate = vi.fn()
    render(
      <MemoryRouter>
        <FundingMenuMobile onNavigate={onNavigate} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /submit a project proposal/i }))
      .toHaveAttribute('href', '/submit-proposal')
    expect(screen.getByRole('link', { name: /check my application/i }))
      .toHaveAttribute('href', '/my-proposals')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('closes the mobile menu when a destination is chosen', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <MemoryRouter>
        <FundingMenuMobile onNavigate={onNavigate} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: /check my application/i }))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
