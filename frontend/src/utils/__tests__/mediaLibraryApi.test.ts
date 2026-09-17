import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildListParams, mediaLibraryApi } from '../mediaLibraryApi'
import api from '../api'

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getStaticFileUrl: (path: string) => `http://api.test${path}`,
}))

describe('buildListParams', () => {
  it('omits empty values so the URL stays clean', () => {
    expect(buildListParams({ q: '', type: 'all', page: 1 })).toEqual({ page: 1 })
  })

  it('keeps real filters', () => {
    expect(
      buildListParams({ q: 'gaza', type: 'video', status: 'submitted', tag: 'well', page: 2 })
    ).toEqual({ q: 'gaza', type: 'video', status: 'submitted', tag: 'well', page: 2 })
  })

  it('passes ownerId through as owner_id', () => {
    expect(buildListParams({ ownerId: 'unassigned' })).toEqual({ owner_id: 'unassigned' })
  })

  it('treats a null ownerId as no filter', () => {
    expect(buildListParams({ ownerId: null })).toEqual({})
  })
})

describe('mediaLibraryApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists with the built params', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 48 } })
    await mediaLibraryApi.list({ q: 'gaza', type: 'all' })
    expect(api.get).toHaveBeenCalledWith('/api/media-library', { params: { q: 'gaza' } })
  })

  it('uploads as multipart with the metadata fields', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1 } })
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await mediaLibraryApi.upload(file, { title: 'T', description: 'D', tags: ['a', 'b'] })

    const [url, body] = vi.mocked(api.post).mock.calls[0]
    expect(url).toBe('/api/media-library')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('title')).toBe('T')
    expect((body as FormData).get('tags')).toBe('a,b')
  })

  it('builds an absolute thumbnail URL with a width', () => {
    expect(mediaLibraryApi.thumbUrl(7, 400)).toBe('http://api.test/api/media-library/7/thumb?w=400')
  })

  it('withdraws a submitted asset back to private', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1, status: 'private' } })
    await mediaLibraryApi.withdraw(1)
    expect(api.post).toHaveBeenCalledWith('/api/media-library/1/withdraw')
  })

  it('rejects with a note', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1, status: 'private' } })
    await mediaLibraryApi.review(1, 'reject', 'Blurry')
    expect(api.post).toHaveBeenCalledWith('/api/media-library/1/review', { decision: 'reject', note: 'Blurry' })
  })
})
