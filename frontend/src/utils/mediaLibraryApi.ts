import api, { getStaticFileUrl } from './api'

export type MediaStatus = 'private' | 'submitted' | 'public'
export type MediaType = 'image' | 'video'

export interface MediaAsset {
  id: number
  owner_id: number | null
  object_key: string
  filename: string
  media_type: MediaType
  content_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_seconds: number | null
  title: string | null
  description: string | null
  tags: string[]
  status: MediaStatus
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  url: string
  thumbnail_url: string | null
}

export interface MediaAssetDetail extends MediaAsset {
  usage: Record<string, unknown[]>
  usage_count: number
}

export interface MediaListResponse {
  items: MediaAsset[]
  total: number
  page: number
  page_size: number
}

export interface Workspace {
  owner_id: number | null
  owner_name: string
  owner_email: string | null
  asset_count: number
  total_bytes: number
  submitted_count: number
}

export interface ListQuery {
  q?: string
  type?: MediaType | 'all'
  status?: MediaStatus | 'all'
  tag?: string
  ownerId?: number | 'unassigned' | null
  sort?: 'created_at' | 'filename' | 'title' | 'size' | 'type'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

/** Drop empty / "all" filters so the request URL only carries real constraints. */
export function buildListParams(query: ListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (query.q) params.q = query.q
  if (query.type && query.type !== 'all') params.type = query.type
  if (query.status && query.status !== 'all') params.status = query.status
  if (query.tag) params.tag = query.tag
  if (query.ownerId !== undefined && query.ownerId !== null) params.owner_id = query.ownerId
  if (query.sort) params.sort = query.sort
  if (query.order) params.order = query.order
  if (query.page) params.page = query.page
  if (query.pageSize) params.page_size = query.pageSize
  return params
}

export const mediaLibraryApi = {
  async list(query: ListQuery = {}): Promise<MediaListResponse> {
    const { data } = await api.get('/api/media-library', { params: buildListParams(query) })
    return data
  },

  async detail(id: number): Promise<MediaAssetDetail> {
    const { data } = await api.get(`/api/media-library/${id}`)
    return data
  },

  async upload(
    file: File,
    meta: { title?: string; description?: string; tags?: string[] } = {},
    onProgress?: (percent: number) => void
  ): Promise<MediaAsset> {
    const form = new FormData()
    form.append('file', file)
    if (meta.title) form.append('title', meta.title)
    if (meta.description) form.append('description', meta.description)
    if (meta.tags?.length) form.append('tags', meta.tags.join(','))

    const { data } = await api.post('/api/media-library', form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    return data
  },

  async update(
    id: number,
    fields: { title?: string | null; description?: string | null; tags?: string[] }
  ): Promise<MediaAsset> {
    const { data } = await api.patch(`/api/media-library/${id}`, fields)
    return data
  },

  async submit(id: number): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/submit`)
    return data
  },

  /** Owner-only: pulls a `submitted` asset back to `private` before a reviewer acts on it. */
  async withdraw(id: number): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/withdraw`)
    return data
  },

  async review(
    id: number,
    decision: 'approve' | 'reject' | 'unpublish',
    note?: string
  ): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/review`, { decision, note })
    return data
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/media-library/${id}`)
  },

  async reassign(id: number, ownerId: number | null): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/reassign`, { owner_id: ownerId })
    return data
  },

  async workspaces(): Promise<{ workspaces: Workspace[] }> {
    const { data } = await api.get('/api/media-library/workspaces')
    return data
  },

  /** Absolute URL — <img> and <video> cannot use the relative API path in dev. */
  fileUrl(id: number): string {
    return getStaticFileUrl(`/api/media-library/${id}/file`)
  },

  thumbUrl(id: number, width?: number): string {
    const suffix = width ? `?w=${width}` : ''
    return getStaticFileUrl(`/api/media-library/${id}/thumb${suffix}`)
  },
}
