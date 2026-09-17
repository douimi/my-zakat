import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import AdminMediaLibrary from '../AdminMediaLibrary'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'
import type { MediaAsset, Workspace } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: {
    list: vi.fn(),
    workspaces: vi.fn(),
    thumbUrl: (id: number) => `http://api.test/api/media-library/${id}/thumb`,
  },
}))

const showError = vi.fn()
const showSuccess = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showError, showSuccess }),
}))

let mockUser: { id: number } | null = { id: 42 }
vi.mock('../../../store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

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

const makeWorkspaces = (overrides: Partial<Workspace>[] = []): Workspace[] =>
  overrides.map((o, i) => ({
    owner_id: i + 1,
    owner_name: `Member ${i + 1}`,
    owner_email: `member${i + 1}@myzakat.org`,
    asset_count: 0,
    total_bytes: 0,
    submitted_count: 0,
    ...o,
  }))

describe('AdminMediaLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drawerCalls.length = 0
    mockUser = { id: 42 }
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 48 })
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({ workspaces: [] })
  })

  it('renders the heading and loads every workspace on mount', async () => {
    render(<AdminMediaLibrary />)
    expect(screen.getByRole('heading', { name: /all media/i })).toBeInTheDocument()
    await waitFor(() => expect(mediaLibraryApi.workspaces).toHaveBeenCalled())
    await waitFor(() =>
      expect(mediaLibraryApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'all', ownerId: null, pageSize: 48 })
      )
    )
  })

  it('lists every workspace in the sidebar, including a member with zero assets', async () => {
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({
      workspaces: makeWorkspaces([
        { owner_id: 1, owner_name: 'Amina', asset_count: 3 },
        { owner_id: 2, owner_name: 'New Field Worker', asset_count: 0 },
      ]),
    })
    render(<AdminMediaLibrary />)

    expect(await screen.findByText('Amina')).toBeInTheDocument()
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByText('New Field Worker')).toBeInTheDocument()
    // You cannot reassign media into a workspace you cannot see.
    expect(within(nav).getByText(/0 items/i)).toBeInTheDocument()
  })

  it('filters the grid to a selected workspace', async () => {
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({
      workspaces: makeWorkspaces([{ owner_id: 1, owner_name: 'Amina', asset_count: 3 }]),
    })
    render(<AdminMediaLibrary />)

    fireEvent.click(await screen.findByText('Amina'))

    await waitFor(() =>
      expect(mediaLibraryApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 1 })
      )
    )
  })

  it('switches the review queue tab to the submitted-status view across every workspace', async () => {
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({
      workspaces: makeWorkspaces([{ owner_id: 1, owner_name: 'Amina', submitted_count: 2 }]),
    })
    render(<AdminMediaLibrary />)

    fireEvent.click(await screen.findByRole('button', { name: /review queue/i }))

    await waitFor(() =>
      expect(mediaLibraryApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'submitted', ownerId: null })
      )
    )
    // The sidebar is a workspace picker for "All media"; it makes no sense
    // once the view is the cross-workspace review queue.
    expect(screen.queryByText('Amina')).not.toBeInTheDocument()
  })

  it('shows the review queue count, matching the workspaces summary total', async () => {
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({
      workspaces: makeWorkspaces([
        { owner_id: 1, owner_name: 'Amina', submitted_count: 2 },
        { owner_id: 2, owner_name: 'Yusuf', submitted_count: 1 },
      ]),
    })
    render(<AdminMediaLibrary />)
    expect(await screen.findByRole('button', { name: /review queue \(3\)/i })).toBeInTheDocument()
  })

  it('opens the detail drawer with review capability and the signed-in reviewer\'s id', async () => {
    vi.mocked(mediaLibraryApi.workspaces).mockResolvedValue({
      workspaces: makeWorkspaces([{ owner_id: 1, owner_name: 'Amina' }]),
    })
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({
      items: [makeAsset()], total: 1, page: 1, page_size: 48,
    })
    render(<AdminMediaLibrary />)

    fireEvent.click(await screen.findByRole('button', { name: /photo\.jpg/i }))

    await waitFor(() => expect(drawerCalls).toHaveLength(1))
    expect(drawerCalls[0].canReview).toBe(true)
    expect(drawerCalls[0].currentUserId).toBe(42)
    expect(drawerCalls[0].workspaces).toEqual(
      expect.arrayContaining([expect.objectContaining({ owner_name: 'Amina' })])
    )
  })

  it('does not crash when the workspaces summary is unavailable, and still shows the caller\'s own media', async () => {
    // What a field-staff account sees if they navigate to /admin/media/all
    // directly: the nav hides the link, but the route itself has no
    // role-specific gate, and /workspaces is admin/manager only.
    vi.mocked(mediaLibraryApi.workspaces).mockRejectedValue({
      response: { status: 403, data: { detail: 'Not allowed' } },
    })
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({
      items: [makeAsset()], total: 1, page: 1, page_size: 48,
    })
    render(<AdminMediaLibrary />)

    expect(await screen.findByText(/photo\.jpg/i)).toBeInTheDocument()
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load workspaces.'))
    expect(screen.getByText('Every workspace')).toBeInTheDocument()
  })
})
