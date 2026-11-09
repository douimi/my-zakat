/**
 * Slideshow: the homepage's h1 lives here (visually hidden while slides rotate,
 * visible when there are none), and autoplay can be paused (WCAG 2.2.2).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getAll = vi.fn()
vi.mock('../../utils/api', () => ({
  slideshowAPI: { getAll: (...args: unknown[]) => getAll(...args) },
  getStaticFileUrl: (p: string) => p,
}))

import Slideshow from '../Slideshow'

const slide = (id: number, title: string) => ({
  id,
  title,
  description: `Description ${id}`,
  image_url: `https://example.org/${id}.jpg`,
  display_order: id,
  is_active: true,
})

const renderSlideshow = () =>
  render(
    <MemoryRouter>
      <Slideshow heading="MyZakat home" emptyDescription="No slides yet" />
    </MemoryRouter>,
  )

describe('Slideshow', () => {
  afterEach(() => {
    cleanup()
    getAll.mockReset()
  })

  it('renders the page h1 and slide titles as h2', async () => {
    getAll.mockResolvedValue([slide(1, 'First slide'), slide(2, 'Second slide')])
    renderSlideshow()

    expect(await screen.findByRole('heading', { level: 2, name: 'First slide' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('MyZakat home')
  })

  it('has a pause control and dots that switch slides', async () => {
    getAll.mockResolvedValue([slide(1, 'First slide'), slide(2, 'Second slide')])
    renderSlideshow()

    const pause = await screen.findByRole('button', { name: 'Pause slideshow' })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Second slide' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to slide 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('shows a visible h1 when there are no slides', async () => {
    getAll.mockResolvedValue([])
    renderSlideshow()

    expect(await screen.findByText('No slides yet')).toBeInTheDocument()
    const h1 = screen.getByRole('heading', { level: 1, name: 'MyZakat home' })
    expect(h1).not.toHaveClass('sr-only')
  })
})
