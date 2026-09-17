import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MediaDetailDrawer from '../MediaDetailDrawer'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'
import type { MediaAsset } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: {
    detail: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    withdraw: vi.fn(),
    review: vi.fn(),
    remove: vi.fn(),
    reassign: vi.fn(),
    fileUrl: (id: number) => `http://api.test/api/media-library/${id}/file`,
    thumbUrl: (id: number) => `http://api.test/api/media-library/${id}/thumb`,
  },
}))

const showSuccess = vi.fn()
const showError = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess, showError }),
}))

const asset: MediaAsset = {
  id: 1, owner_id: 3, object_key: 'k', filename: 'IMG_1.jpg', media_type: 'image',
  content_type: 'image/jpeg', size_bytes: 2048, width: 800, height: 600, duration_seconds: null,
  title: null, description: null, tags: [], status: 'private', review_note: null,
  reviewed_at: null, created_at: '2026-03-14T10:00:00Z', updated_at: '2026-03-14T10:00:00Z',
  url: '/api/media-library/1/file', thumbnail_url: '/api/media-library/1/thumb',
}

const detail = (overrides: Partial<MediaAsset> = {}) =>
  ({ ...asset, ...overrides, usage: {}, usage_count: 0 })

describe('MediaDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail() as never)
  })

  it('offers Submit for review on a private asset the owner can edit', async () => {
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /submit for review/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })

  it('offers review actions to a reviewer on a submitted asset', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /publish/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('saves edited metadata', async () => {
    vi.mocked(mediaLibraryApi.update).mockResolvedValue(detail({ title: 'Well opening' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/title/i), { target: { value: 'Well opening' } })
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: 'gaza, water-well' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mediaLibraryApi.update).toHaveBeenCalledWith(1, {
        title: 'Well opening',
        description: '',
        tags: ['gaza', 'water-well'],
      })
    )
  })

  it('warns instead of deleting when the asset is used on the site', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(
      { ...detail({ status: 'public' }), usage_count: 2, usage: { stories: [{ id: 1 }] } } as never
    )
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText(/used in 2 place/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })

  // --- Correction 1: withdraw ------------------------------------------

  it('offers Withdraw on a submitted asset to its owner', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)
    const button = await screen.findByRole('button', { name: /withdraw/i })
    expect(button).toBeInTheDocument()

    vi.mocked(mediaLibraryApi.withdraw).mockResolvedValue(detail({ status: 'private' }) as never)
    fireEvent.click(button)
    await waitFor(() => expect(mediaLibraryApi.withdraw).toHaveBeenCalledWith(1))
  })

  it('does not offer Withdraw to a reviewer who is not the owner', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted', owner_id: 3 }) as never)
    render(
      <MediaDetailDrawer assetId={1} canReview currentUserId={99} onClose={vi.fn()} onChanged={vi.fn()} />
    )
    await screen.findByRole('button', { name: /publish/i })
    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument()
  })

  it('does not offer Submit for review to a reviewer browsing someone else\'s private asset', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'private', owner_id: 3 }) as never)
    render(
      <MediaDetailDrawer assetId={1} canReview currentUserId={99} onClose={vi.fn()} onChanged={vi.fn()} />
    )
    await screen.findByLabelText(/title/i)
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument()
  })

  it('offers Submit for review to a reviewer who owns the private asset', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'private', owner_id: 42 }) as never)
    render(
      <MediaDetailDrawer assetId={1} canReview currentUserId={42} onClose={vi.fn()} onChanged={vi.fn()} />
    )
    expect(await screen.findByRole('button', { name: /submit for review/i })).toBeInTheDocument()
  })

  // --- Correction 2: rejection requires a note ---------------------------

  it('refuses to send a rejection when the reviewer cancels the prompt', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /reject/i }))

    expect(mediaLibraryApi.review).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  it('refuses to send a rejection with a blank note', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ')
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /reject/i }))

    expect(mediaLibraryApi.review).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  it('sends the rejection once a real note is given', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    vi.mocked(mediaLibraryApi.review).mockResolvedValue(detail({ status: 'private' }) as never)
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Beneficiary face visible, needs consent')
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /reject/i }))

    await waitFor(() =>
      expect(mediaLibraryApi.review).toHaveBeenCalledWith(1, 'reject', 'Beneficiary face visible, needs consent')
    )
    promptSpy.mockRestore()
  })

  // --- Correction 3: owner cannot edit a public asset ---------------------

  it('disables metadata editing for the owner once the asset is public', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'public' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(await screen.findByLabelText(/title/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^save/i })).not.toBeInTheDocument()
    expect(screen.getByText(/only a reviewer can edit/i)).toBeInTheDocument()
  })

  it('still lets a reviewer edit a public asset', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'public' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(await screen.findByLabelText(/title/i)).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /^save/i })).toBeInTheDocument()
  })

  // --- Correction 4: server-side tag rule violations are surfaced --------

  it('surfaces the server tag-validation message rather than swallowing it', async () => {
    vi.mocked(mediaLibraryApi.update).mockRejectedValue({
      response: { status: 400, data: { detail: { tags: ["Tag 'far|west' cannot contain \"|\"."] } } },
    })
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/tags/i), { target: { value: 'far|west' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(showError).toHaveBeenCalled())
    const [, message] = showError.mock.calls[showError.mock.calls.length - 1]
    expect(message).toMatch(/cannot contain/i)
  })

  // --- "can I tell at a glance whether this is live?" ---------------------

  it('makes the public status visually distinct so a field worker can tell the photo is live', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'public' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText(/live on the public site/i)).toBeInTheDocument()
  })
})
