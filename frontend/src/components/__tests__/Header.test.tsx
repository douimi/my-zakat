import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import Header from '../Header'

const auth = vi.hoisted(() => ({
  state: {
    isAuthenticated: false,
    isAdmin: false,
    isStaff: false,
    user: null as null | { name?: string; email: string },
    logout: vi.fn(),
  },
}))

const api = vi.hoisted(() => ({
  urgentNeeds: [] as any[],
  settings: [] as { key: string; value: string }[],
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => auth.state,
}))

vi.mock('../../utils/api', () => ({
  urgentNeedsAPI: { getAll: vi.fn(async () => api.urgentNeeds) },
  settingsAPI: { getAll: vi.fn(async () => api.settings) },
  getStaticFileUrl: (path: string) => path,
}))

const renderHeader = (route = '/') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Header />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const mainNav = () => screen.getByRole('navigation', { name: 'Main' })

describe('Header', () => {
  beforeEach(() => {
    auth.state = { isAuthenticated: false, isAdmin: false, isStaff: false, user: null, logout: vi.fn() }
    api.urgentNeeds = []
    api.settings = []
  })

  it('links the logo home and shows one persistent Donate button', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: /myzakat home/i })).toHaveAttribute('href', '/')
    // A single Donate link, outside the desktop-only nav, so it is on screen at every width
    // (e2e: the first /donate/i link on "/" must be visible and lead to /donate).
    const donate = screen.getByRole('link', { name: /^donate$/i })
    expect(donate).toHaveAttribute('href', '/donate')
    expect(mainNav()).not.toContainElement(donate)
    expect(donate.closest('.hidden')).toBeNull()
  })

  it('shows the new top level: Projects, Programs, Zakat, About, Apply for Funding', () => {
    renderHeader()
    const nav = within(mainNav())

    expect(nav.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
    expect(nav.getByRole('link', { name: 'Programs' })).toHaveAttribute('href', '/programs')
    for (const name of ['Zakat', 'About', 'Apply for Funding']) {
      expect(nav.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
    }
    // The old grab-bag entries are gone from the top bar.
    expect(nav.queryByText(/quick links/i)).toBeNull()
    expect(nav.queryByText(/our impact|our work|get involved/i)).toBeNull()
  })

  it('opens the Zakat dropdown with every calculator and guide', async () => {
    const user = userEvent.setup()
    renderHeader()
    const trigger = within(mainNav()).getByRole('button', { name: 'Zakat' })

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!
    const expected: Record<string, string> = {
      'Zakat Calculator': '/zakat-calculator',
      'Zakat al-Fitr Calculator': '/zakat-al-fitr-calculator',
      'Kaffarah Calculator': '/kaffarah-calculator',
      Nisab: '/nisab',
      'Zakat on Gold': '/zakat-on-gold',
      'Zakat Education': '/zakat-education',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(within(panel).getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('closes a dropdown on an outside click (the old Calculators menu never did)', async () => {
    const user = userEvent.setup()
    renderHeader()
    const trigger = within(mainNav()).getByRole('button', { name: 'Zakat' })

    await user.click(trigger)
    expect(screen.getByRole('link', { name: 'Nisab' })).toBeInTheDocument()

    await user.click(document.body)

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Nisab' })).toBeNull()
  })

  it('closes a dropdown on Escape and gives focus back to its trigger', async () => {
    const user = userEvent.setup()
    renderHeader()
    const trigger = within(mainNav()).getByRole('button', { name: 'About' })

    await user.click(trigger)
    await user.tab()
    expect(screen.getByRole('link', { name: 'About us' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'About us' })).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('keeps one dropdown open at a time', async () => {
    const user = userEvent.setup()
    renderHeader()
    const nav = within(mainNav())

    await user.click(nav.getByRole('button', { name: 'Zakat' }))
    await user.click(nav.getByRole('button', { name: 'About' }))

    expect(nav.getByRole('button', { name: 'Zakat' })).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByRole('button', { name: 'About' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('lists About, Stories, Events, Volunteer and Contact under About', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(within(mainNav()).getByRole('button', { name: 'About' }))

    const expected: Record<string, string> = {
      'About us': '/about',
      Stories: '/stories',
      Events: '/events',
      Volunteer: '/volunteer',
      Contact: '/contact',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('turns Projects into a dropdown of urgent needs when there are some', async () => {
    api.urgentNeeds = [{ id: 1, slug: 'gaza-food', title: 'Food for Gaza', image_url: null }]
    const user = userEvent.setup()
    renderHeader()

    const trigger = await within(mainNav()).findByRole('button', { name: 'Projects' })
    await user.click(trigger)

    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: 'Food for Gaza' })).toHaveAttribute('href', '/urgent-needs/gaza-food')
  })

  it('marks the section of the current page as active', () => {
    renderHeader('/nisab')
    const nav = within(mainNav())

    const zakat = nav.getByRole('button', { name: 'Zakat' })
    expect(zakat).toHaveAttribute('data-active', 'true')
    expect(zakat.className).toContain('text-primary-700')
    expect(nav.getByRole('button', { name: 'About' })).toHaveAttribute('data-active', 'false')
  })

  describe('emergency banner', () => {
    it('shows the fallback message and a Donate Now link when enabled without a message', async () => {
      api.settings = [{ key: 'emergency_banner_enabled', value: 'true' }]
      renderHeader()

      expect(await screen.findByText(/Emergency Relief Needed/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Donate Now' })).toHaveAttribute('href', '/donate')
    })

    it('stays hidden when disabled', async () => {
      api.settings = [{ key: 'emergency_banner_enabled', value: 'false' }]
      renderHeader()

      await waitFor(() => expect(screen.queryByText(/Emergency Relief Needed/)).toBeNull())
      expect(screen.queryByRole('link', { name: 'Donate Now' })).toBeNull()
    })
  })

  describe('account menu', () => {
    it('offers log in and sign up to a visitor', async () => {
      const user = userEvent.setup()
      renderHeader()

      const trigger = screen.getByRole('button', { name: /profile menu/i })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await user.click(trigger)

      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
      expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
      expect(screen.queryByRole('link', { name: /admin console/i })).toBeNull()
    })

    it('gives an admin the e2e path: profile menu, then a link named Admin Console', async () => {
      auth.state = { ...auth.state, isAuthenticated: true, isAdmin: true, isStaff: true, user: { email: 'a@x.org', name: 'Amina' } }
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByRole('button', { name: /profile menu/i }))

      expect(screen.getByText('Amina')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /admin console/i })).toHaveAttribute('href', '/admin')
      expect(screen.getByRole('link', { name: /my donations/i })).toHaveAttribute('href', '/dashboard')

      await user.click(screen.getByRole('button', { name: /log out/i }))
      expect(auth.state.logout).toHaveBeenCalledTimes(1)
    })

    it('labels the console for a manager, and hides it from a donor', async () => {
      auth.state = { ...auth.state, isAuthenticated: true, isStaff: true, user: { email: 'm@x.org' } }
      const user = userEvent.setup()
      const { unmount } = renderHeader()
      await user.click(screen.getByRole('button', { name: /profile menu/i }))
      expect(screen.getByRole('link', { name: 'Manager Console' })).toHaveAttribute('href', '/admin')
      unmount()

      auth.state = { ...auth.state, isStaff: false }
      renderHeader()
      await user.click(screen.getByRole('button', { name: /profile menu/i }))
      expect(screen.queryByRole('link', { name: /console/i })).toBeNull()
      expect(screen.getByRole('link', { name: /my donations/i })).toBeInTheDocument()
    })
  })

  describe('mobile menu', () => {
    it('toggles from the hamburger and lists every destination', async () => {
      const user = userEvent.setup()
      renderHeader()
      const toggle = screen.getByRole('button', { name: 'Toggle menu' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull()

      await user.click(toggle)

      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const menu = within(screen.getByRole('navigation', { name: 'Mobile' }))
      const expected: Record<string, string> = {
        Home: '/',
        Projects: '/projects',
        Programs: '/programs',
        'Zakat Calculator': '/zakat-calculator',
        Nisab: '/nisab',
        'Zakat Education': '/zakat-education',
        'About us': '/about',
        Stories: '/stories',
        Events: '/events',
        Volunteer: '/volunteer',
        Contact: '/contact',
        'Log in': '/login',
      }
      for (const [name, href] of Object.entries(expected)) {
        expect(menu.getByRole('link', { name })).toHaveAttribute('href', href)
      }
      expect(menu.getByRole('link', { name: /submit a project proposal/i })).toHaveAttribute('href', '/submit-proposal')
      expect(menu.getByRole('link', { name: /check my application/i })).toHaveAttribute('href', '/my-proposals')
    })

    it('closes when a link is chosen', async () => {
      const user = userEvent.setup()
      renderHeader()
      await user.click(screen.getByRole('button', { name: 'Toggle menu' }))

      await user.click(within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'Stories' }))

      expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('closes on Escape', async () => {
      renderHeader()
      fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }))
      expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull()
    })
  })

  it('never names anything "Email" (e2e getByLabel(\'Email\') is a substring match)', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Toggle menu' }))
    expect(screen.queryAllByLabelText(/email/i)).toHaveLength(0)
  })
})
