import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { HelmetProvider } from 'react-helmet-async'
import type { ReactNode } from 'react'

vi.mock('../../utils/api', () => ({
  eventsAPI: { getAll: vi.fn(), getById: vi.fn() },
  testimonialsAPI: { getAll: vi.fn() },
  storiesAPI: { getAll: vi.fn(), getById: vi.fn() },
  getStaticFileUrl: (path: string) => `http://localhost:8000${path}`,
}))

vi.mock('../../utils/mediaHelpers', () => ({
  getOptimizedImageUrl: () => null,
  IMAGE_WIDTHS: { THUMB: 400, CARD: 800, LARGE: 1600 },
}))

import Events from '../Events'
import Testimonials from '../Testimonials'
import StoryDetail from '../StoryDetail'
import { eventsAPI, testimonialsAPI, storiesAPI } from '../../utils/api'

const renderAt = (ui: ReactNode, path = '/', routePath = '*') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

const daysFromNow = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

describe('Events page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists upcoming events first and folds past events, newest first', async () => {
    vi.mocked(eventsAPI.getAll).mockResolvedValue([
      { id: 1, title: 'Old drive', description: 'd', date: daysFromNow(-90), location: 'A', created_at: '' },
      { id: 2, title: 'Recent drive', description: 'd', date: daysFromNow(-10), location: 'B', created_at: '' },
      { id: 3, title: 'Later fundraiser', description: 'd', date: daysFromNow(30), location: 'C', created_at: '' },
      { id: 4, title: 'Next fundraiser', description: 'd', date: daysFromNow(5), location: 'D', created_at: '' },
    ])
    renderAt(<Events />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Our Events' })).toBeInTheDocument()

    // Upcoming: soonest first
    const upcoming = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(upcoming).toEqual(['Next fundraiser', 'Later fundraiser'])

    // Past: a labelled, closed <details>, sorted newest first, still in the DOM
    const pastSummary = screen.getByText('Past events (2)')
    const details = pastSummary.closest('details')!
    expect(details).not.toHaveAttribute('open')
    const pastTitles = within(details).getAllByRole('link', { hidden: true }).map((a) => a.textContent)
    expect(pastTitles).toEqual(['Recent drive', 'Old drive'])
  })

  it('says so when nothing is coming up', async () => {
    vi.mocked(eventsAPI.getAll).mockResolvedValue([
      { id: 1, title: 'Old drive', description: 'd', date: daysFromNow(-3), location: 'A', created_at: '' },
    ])
    renderAt(<Events />)

    expect(await screen.findByText(/no upcoming events right now/i)).toBeInTheDocument()
    expect(screen.getByText('Past events (1)')).toBeInTheDocument()
  })
})

describe('Testimonials page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a short honest empty state', async () => {
    vi.mocked(testimonialsAPI.getAll).mockResolvedValue([])
    renderAt(<Testimonials />)

    expect(await screen.findByText('No testimonials published yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /share your experience/i })).toHaveAttribute('href', '/contact')
    expect(screen.queryByRole('link', { name: /make a donation/i })).toBeNull()
  })

  it('shows stars only for testimonials that carry a rating', async () => {
    vi.mocked(testimonialsAPI.getAll).mockResolvedValue([
      { id: 1, name: 'Rated', text: 'Great work', rating: 4, created_at: '', is_approved: true },
      { id: 2, name: 'Unrated', text: 'Thank you', created_at: '', is_approved: true },
    ])
    renderAt(<Testimonials />)

    expect(await screen.findByText('Rated')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /rated \d out of 5/i })).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Rated 4 out of 5' })).toBeInTheDocument()
  })
})

describe('Story detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gives the story a donate link carrying its purpose, and no fake date', async () => {
    vi.mocked(storiesAPI.getById).mockResolvedValue({
      id: 2,
      title: 'Healing Hearts in Yemen',
      summary: 'One family in Yemen.',
      content: 'First paragraph.\n\nTap the link to donate.',
      is_active: true,
      is_featured: false,
    })
    renderAt(<StoryDetail />, '/stories/2', '/stories/:id')

    expect(await screen.findByRole('heading', { level: 1, name: 'Healing Hearts in Yemen' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^donate$/i })).toHaveAttribute(
      'href',
      `/donate?purpose=${encodeURIComponent('Healing Hearts in Yemen')}`,
    )
    expect(screen.getAllByRole('link', { name: /all stories/i })[0]).toHaveAttribute('href', '/stories')
    expect(screen.queryByText(/published recently/i)).toBeNull()
  })
})
