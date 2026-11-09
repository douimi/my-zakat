import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { HelmetProvider } from 'react-helmet-async'
import Layout from '../Layout'

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false, isAdmin: false, isStaff: false, user: null, logout: vi.fn() }),
}))

vi.mock('../../utils/api', () => ({
  urgentNeedsAPI: { getAll: vi.fn(async () => []) },
  settingsAPI: { getAll: vi.fn(async () => []) },
  getStaticFileUrl: (path: string) => path,
}))

const renderLayout = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<p>Page body</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('Layout', () => {
  it('renders the header, the page inside <main>, and the footer', () => {
    renderLayout()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Page body'))
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/MyZakat Distribution Foundation/)
  })

  it('starts with a skip link that targets the main landmark', () => {
    const { container } = renderLayout()

    const skip = screen.getByRole('link', { name: /skip to content/i })
    expect(skip).toHaveAttribute('href', '#main')
    expect(container.querySelector('a, button')).toBe(skip)

    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main')
    // Focusable by script only, so following the skip link moves keyboard focus into the page.
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(main).toHaveClass('flex-1')
  })

  it('applies the full-height column layout', () => {
    const { container } = renderLayout()

    expect(container.firstChild).toHaveClass('min-h-screen', 'flex', 'flex-col')
  })

  it('names nothing "Email" around the page (e2e substring selectors on /login, /submit-proposal)', () => {
    renderLayout()

    expect(screen.queryAllByLabelText(/email/i)).toHaveLength(0)
    expect(screen.queryAllByPlaceholderText(/email/i)).toHaveLength(0)
  })
})
