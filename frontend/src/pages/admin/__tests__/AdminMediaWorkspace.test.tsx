import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import AdminMediaWorkspace from '../AdminMediaWorkspace'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'
import type { MediaAsset, ProjectFolder } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: {
    list: vi.fn(),
    projects: vi.fn(),
    upload: vi.fn(),
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
  project_id: null,
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

const makeFolder = (overrides: Partial<ProjectFolder> = {}): ProjectFolder => ({
  project_id: 5,
  name: 'Rice distribution',
  status: 'funded',
  fileable: true,
  asset_count: 3,
  image_count: 2,
  video_count: 1,
  submitted_count: 0,
  ...overrides,
})

describe('AdminMediaWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drawerCalls.length = 0
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 48 })
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({ projects: [] })
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
        projectId: null,
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

  it('lists project folders with what each holds', async () => {
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({
      projects: [makeFolder(), makeFolder({ project_id: null, name: 'Unassigned', fileable: true, asset_count: 1, image_count: 1, video_count: 0 })],
    })
    render(<AdminMediaWorkspace />)
    const nav = await screen.findByRole('navigation', { name: /projects/i })
    expect(await within(nav).findByText('Rice distribution')).toBeInTheDocument()
    expect(within(nav).getByText('2 photos · 1 video')).toBeInTheDocument()
    expect(within(nav).getByText('Unassigned')).toBeInTheDocument()
  })

  it('opening a folder filters the grid and targets uploads at it', async () => {
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({ projects: [makeFolder()] })
    render(<AdminMediaWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: /rice distribution/i }))

    await waitFor(() =>
      expect(mediaLibraryApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: 5 }))
    )
    expect(screen.getByLabelText(/file under/i)).toHaveValue('5')
  })

  it('uploads into the chosen project', async () => {
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({ projects: [makeFolder()] })
    vi.mocked(mediaLibraryApi.upload).mockResolvedValue(makeAsset())
    render(<AdminMediaWorkspace />)
    await screen.findByRole('button', { name: /rice distribution/i })

    fireEvent.change(screen.getByLabelText(/file under/i), { target: { value: '5' } })
    const file = new File(['x'], 'well.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file] } })

    await waitFor(() =>
      expect(mediaLibraryApi.upload).toHaveBeenCalledWith(file, { projectId: 5 }, expect.any(Function))
    )
  })

  it('does not offer a closed project as an upload destination', async () => {
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({
      projects: [makeFolder({ project_id: 9, name: 'Old project', fileable: false })],
    })
    render(<AdminMediaWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: /old project/i }))

    const select = screen.getByLabelText(/file under/i)
    expect(select).toHaveValue('')
    expect(within(select).queryByText('Old project')).not.toBeInTheDocument()
  })

  it('hands the drawer the folders so the asset can be moved', async () => {
    vi.mocked(mediaLibraryApi.projects).mockResolvedValue({ projects: [makeFolder()] })
    vi.mocked(mediaLibraryApi.list).mockResolvedValue({ items: [makeAsset()], total: 1, page: 1, page_size: 48 })
    render(<AdminMediaWorkspace />)
    await screen.findByRole('button', { name: /rice distribution/i })

    fireEvent.click(await screen.findByRole('button', { name: /photo\.jpg/i }))
    await waitFor(() => expect(drawerCalls.length).toBeGreaterThan(0))
    expect(drawerCalls[drawerCalls.length - 1].projects).toEqual([makeFolder()])
  })

  it('shows an error toast when the workspace fails to load', async () => {
    vi.mocked(mediaLibraryApi.list).mockRejectedValue(new Error('boom'))
    render(<AdminMediaWorkspace />)
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load your media.'))
  })
})
