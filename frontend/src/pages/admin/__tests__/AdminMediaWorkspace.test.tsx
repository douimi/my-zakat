import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminMediaWorkspace from '../AdminMediaWorkspace'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'
import type { MediaAsset } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: {
    list: vi.fn(),
  },
}))

const showError = vi.fn()
const showSuccess = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showError, showSuccess }),
}))

// The page is deliberately thin — it delegates every pixel to Task 12-15
// components. Rather than re-testing MediaDetailDrawer's internals here (it
// already has its own suite), capture the props the page hands it so we can
// assert on the wiring: does My Workspace grant review capability, and does
// it pass a currentUserId it doesn't need?
type CapturedProps = Record<string, unknown>
const drawerCalls: CapturedProps[] = []
vi.mock('../../../components/media/MediaDetailDrawer', () => ({
  default: (props: CapturedProps) => {
    drawerCalls.push(props)
    return <div data-testid="drawer" />
  },
}))

const makeAsset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 1,
  owner_id: 7,
  object_key: 'workspaces/7/2026/03/photo.jpg',
  filename: 'photo.jpg',
  media_type: 'image',
  content_type: 'image/jpeg',
  size_bytes: 1024,
  width: null,
  height: null,
  duration_seconds: null,
  title: null,
  description: null,
  tags: [],
  status: 'private',
  review_note: null,
  reviewed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  url: '/api/media-library/1/file',
  thumbnail_url: null,
  ...overrides,
})

describe('AdminMediaWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drawerCalls.length = 0
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 48 })
  })

  it('loads the workspace with the default query on mount', async () => {
    render(<AdminMediaWorkspace />)
    await waitFor(() =>
      expect(mediaLibraryApi.list).toHaveBeenCalledWith({
        q: '',
        type: 'all',
        status: 'all',
        sort: 'created_at',
        order: 'desc',
        page: 1,
        pageSize: 48,
      })
    )
  })

  it('guides a brand-new field worker who has uploaded nothing yet', async () => {
    render(<AdminMediaWorkspace />)
    expect(
      await screen.findByText(/drop a photo or video above to add your first item/i)
    ).toBeInTheDocument()
  })

  it('shows the item count once media has loaded', async () => {
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({
      items: [makeAsset()],
      total: 1,
      page: 1,
      page_size: 48,
    })
    render(<AdminMediaWorkspace />)
    expect(await screen.findByText('1 item')).toBeInTheDocument()
  })

  it('opens the detail drawer without review capability — this is the owner\'s own workspace, not a review surface', async () => {
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({
      items: [makeAsset()],
      total: 1,
      page: 1,
      page_size: 48,
    })
    render(<AdminMediaWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: /photo\.jpg/i }))

    await waitFor(() => expect(drawerCalls).toHaveLength(1))
    expect(drawerCalls[0].canReview).toBe(false)
    expect(drawerCalls[0].currentUserId).toBeUndefined()
    expect(drawerCalls[0].workspaces).toBeUndefined()
  })

  it('shows an error toast when the workspace fails to load', async () => {
    vi.mocked(mediaLibraryApi.list).mockRejectedValue(new Error('boom'))
    render(<AdminMediaWorkspace />)
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load your media.'))
  })
})
