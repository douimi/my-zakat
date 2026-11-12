/**
 * The homepage projects section must not present funded projects as open ones:
 * open projects come first, and when none is open the heading says so.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FundraisingProjectsSection, { type Project } from '../FundraisingProjectsSection'

const project = (overrides: Partial<Project>): Project => ({
  id: 1,
  title: 'Project',
  slug: 'project',
  short_description: 'Short description',
  image_url: null,
  goal_amount: 1000,
  spent_amount: 500,
  remaining_amount: 500,
  progress_percent: 50,
  currency: 'USD',
  suggested_donation: null,
  deadline: null,
  status: 'active',
  is_active: true,
  is_featured: false,
  category: 'Food',
  ...overrides,
})

const mockFetch = (projects: Project[]) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => projects }))
}

const renderSection = () =>
  render(
    <MemoryRouter>
      <FundraisingProjectsSection />
    </MemoryRouter>,
  )

describe('FundraisingProjectsSection', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lists open projects first, with a donate link that carries the purpose', async () => {
    mockFetch([
      project({ id: 1, title: 'Funded wells', progress_percent: 100, remaining_amount: 0, spent_amount: 1000, is_featured: true }),
      project({ id: 2, title: 'Winter blankets', progress_percent: 40 }),
    ])
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Projects you can fund' })).toBeInTheDocument()
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Winter blankets', 'Funded wells'])

    const donate = screen.getByRole('link', { name: 'Donate to this project' })
    expect(donate).toHaveAttribute('href', expect.stringContaining('purpose=Winter%20blankets'))
    // Only the open project gets a donate button.
    expect(screen.getAllByRole('link', { name: 'Donate to this project' })).toHaveLength(1)
  })

  it('says "Recently funded" when no project is open', async () => {
    mockFetch([
      project({ id: 1, title: 'Funded wells', progress_percent: 100, remaining_amount: 0, is_featured: true }),
    ])
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Recently funded' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Donate to this project' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'give where the need is greatest' })).toHaveAttribute('href', '/donate')
  })

  it('shows at most two badges per card and no overhead claim', async () => {
    mockFetch([project({ id: 3, title: 'Clinic', progress_percent: 80, is_featured: true, category: 'Health' })])
    const { container } = renderSection()

    const card = (await screen.findByRole('heading', { name: 'Clinic' })).closest('.card-media') as HTMLElement
    expect(within(card).getByText('Health')).toBeInTheDocument()
    expect(within(card).getByText('Urgent')).toBeInTheDocument()
    expect(within(card).queryByText('Featured')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/overhead/i)
  })

  it('renders nothing when there are no projects', async () => {
    mockFetch([])
    const { container } = renderSection()
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('FundraisingProjectsSection: upcoming projects', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  const funded = project({ id: 1, title: 'Wells in Gaza', progress_percent: 100, spent_amount: 1000, remaining_amount: 0 })
  const winter = project({ id: 2, title: 'Winter coats', status: 'upcoming', progress_percent: 0, starts_at: '2026-12-01T00:00:00' })
  const ramadan = project({ id: 3, title: 'Ramadan baskets', status: 'upcoming', progress_percent: 0, starts_at: null })

  it('shows what is coming next under the recently funded projects when nothing is open', async () => {
    mockFetch([funded, ramadan, winter])
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Recently funded', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming projects', level: 3 })).toBeInTheDocument()
    // Soonest first; an undated one last.
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles.indexOf('Winter coats')).toBeLessThan(titles.indexOf('Ramadan baskets'))
    expect(screen.getByText(/Opens for donations on December 1, 2026/)).toBeInTheDocument()
    expect(screen.getByText('Opens for donations soon')).toBeInTheDocument()
  })

  it('never offers to donate to a project that is not open yet', async () => {
    mockFetch([winter])
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Upcoming projects', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Donate to this project' })).toBeNull()
    expect(screen.queryByText(/% funded/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Give where the need is greatest' })).toHaveAttribute('href', '/donate')
  })

  it('keeps the homepage on the open campaign while one exists', async () => {
    mockFetch([project({ id: 4, title: 'Food parcels' }), winter])
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Projects you can fund', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Winter coats')).toBeNull()
  })
})
