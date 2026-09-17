import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MediaPickerDialog from '../MediaPickerDialog'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: { list: vi.fn(), thumbUrl: (id: number) => `http://api.test/t/${id}` },
}))

const asset = (id: number, filename: string) => ({
  id, owner_id: 3, object_key: 'k', filename, media_type: 'image',
  content_type: 'image/jpeg', size_bytes: 10, width: null, height: null,
  duration_seconds: null, title: null, description: null, tags: [],
  status: 'public', review_note: null, reviewed_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  url: `/api/media-library/${id}/file`, thumbnail_url: `/api/media-library/${id}/thumb`,
})

describe('MediaPickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only ever offers published media', async () => {
    vi.mocked(mediaLibraryApi.list).mockResolvedValue(
      { items: [asset(1, 'a.jpg')], total: 1, page: 1, page_size: 48 } as never
    )
    render(<MediaPickerDialog open onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => expect(mediaLibraryApi.list).toHaveBeenCalled())
    expect(vi.mocked(mediaLibraryApi.list).mock.calls[0][0]).toMatchObject({ status: 'public' })
  })

  it('hands back exactly the URL the in-use guards match on', async () => {
    vi.mocked(mediaLibraryApi.list).mockResolvedValue(
      { items: [asset(7, 'well.jpg')], total: 1, page: 1, page_size: 48 } as never
    )
    const onPick = vi.fn()
    render(<MediaPickerDialog open onClose={vi.fn()} onPick={onPick} />)

    fireEvent.click(await screen.findByRole('button', { name: /well\.jpg/i }))
    // Exact string: get_media_usage compares by equality, so any other shape
    // silently disables the delete and unpublish guards.
    expect(onPick).toHaveBeenCalledWith('/api/media-library/7/file', expect.objectContaining({ id: 7 }))
  })
})
