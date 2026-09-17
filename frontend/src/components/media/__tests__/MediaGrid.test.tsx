import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MediaGrid from '../MediaGrid'
import type { MediaAsset } from '../../../utils/mediaLibraryApi'

const asset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 1,
  owner_id: 3,
  object_key: 'workspaces/3/2026/03/a.jpg',
  filename: 'IMG_4821.jpg',
  media_type: 'image',
  content_type: 'image/jpeg',
  size_bytes: 2048,
  width: 800,
  height: 600,
  duration_seconds: null,
  title: null,
  description: null,
  tags: [],
  status: 'private',
  review_note: null,
  reviewed_at: null,
  created_at: '2026-03-14T10:00:00Z',
  updated_at: '2026-03-14T10:00:00Z',
  url: '/api/media-library/1/file',
  thumbnail_url: '/api/media-library/1/thumb',
  ...overrides,
})

describe('MediaGrid', () => {
  it('shows the empty state when there is nothing to show', () => {
    render(<MediaGrid items={[]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/no media yet/i)).toBeInTheDocument()
  })

  it('shows a skeleton while loading rather than the empty state', () => {
    render(<MediaGrid items={[]} loading onSelect={vi.fn()} />)
    expect(screen.queryByText(/no media yet/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('media-grid-loading')).toBeInTheDocument()
  })

  it('falls back to the filename when an asset has no title', () => {
    render(<MediaGrid items={[asset()]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText('IMG_4821.jpg')).toBeInTheDocument()
  })

  it('prefers the title when one is set', () => {
    render(<MediaGrid items={[asset({ title: 'Well opening' })]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Well opening')).toBeInTheDocument()
  })

  it('labels the status so private media is obvious at a glance', () => {
    render(<MediaGrid items={[asset({ status: 'submitted' })]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/in review/i)).toBeInTheDocument()
  })

  it('calls onSelect with the asset when a card is clicked', () => {
    const onSelect = vi.fn()
    const item = asset()
    render(<MediaGrid items={[item]} loading={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /IMG_4821.jpg/i }))
    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it('labels a public asset distinctly from private and submitted', () => {
    render(<MediaGrid items={[asset({ status: 'public' })]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/public/i)).toBeInTheDocument()
  })
})
