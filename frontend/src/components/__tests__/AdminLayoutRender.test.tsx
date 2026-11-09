import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from '../AdminLayout'

const state = {
  token: null as string | null,
  user: { name: 'Amina', email: 'amina@example.org' },
  role: 'admin',
  logout: vi.fn(),
}
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
}))

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="*" element={<h1>Page heading</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )

describe('AdminLayout', () => {
  beforeEach(() => {
    window.localStorage.clear()
    state.role = 'admin'
  })

  it('leaves the single h1 to the page: the top-bar title is not a heading', () => {
    renderAt('/admin/media')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Media / My Workspace')).toBeInTheDocument()
  })

  it('marks only the most specific link current (All Media, not also My Workspace)', () => {
    renderAt('/admin/media/all')
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByRole('link', { name: 'All Media' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'My Workspace' })).not.toHaveAttribute('aria-current')
  })

  it('shows Project Proposals as a top-level link and keeps the People group', () => {
    renderAt('/admin')
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByRole('link', { name: 'Project Proposals' })).toBeVisible()
    expect(within(nav).getByRole('button', { name: /^people$/i })).toBeInTheDocument()
  })

  it('names the two campaign pages apart', () => {
    window.localStorage.setItem('myzakat_admin_nav_expanded', JSON.stringify(['content', 'marketing']))
    renderAt('/admin')
    expect(screen.getByRole('link', { name: 'Homepage popups' })).toHaveAttribute('href', '/admin/campaigns')
    expect(screen.getByRole('link', { name: 'Email campaigns' })).toHaveAttribute('href', '/admin/marketing-campaigns')
  })

  it('has no button named "close" in the chrome (the media drawer owns that name)', () => {
    renderAt('/admin/media/all')
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide navigation' })).toBeInTheDocument()
  })
})
