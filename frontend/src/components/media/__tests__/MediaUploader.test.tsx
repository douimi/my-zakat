import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MediaUploader from '../MediaUploader'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: { upload: vi.fn() },
}))

const file = (name: string) => new File(['bytes'], name, { type: 'image/jpeg' })

describe('MediaUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads each selected file and reports completion once', async () => {
    vi.mocked(mediaLibraryApi.upload).mockResolvedValue({ id: 1 } as never)
    const onUploaded = vi.fn()
    render(<MediaUploader onUploaded={onUploaded} />)

    fireEvent.change(screen.getByTestId('media-file-input'), {
      target: { files: [file('a.jpg'), file('b.jpg')] },
    })

    await waitFor(() => expect(mediaLibraryApi.upload).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
  })

  it('shows a duplicate as an explanation, not a crash', async () => {
    vi.mocked(mediaLibraryApi.upload).mockRejectedValue({
      response: { status: 409, data: { detail: { message: 'This file is already in your workspace.' } } },
    })
    render(<MediaUploader onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file('a.jpg')] } })

    expect(await screen.findByText(/already in your workspace/i)).toBeInTheDocument()
  })

  it('surfaces a size rejection from the server', async () => {
    vi.mocked(mediaLibraryApi.upload).mockRejectedValue({
      response: { status: 413, data: { detail: 'File is larger than the 100 MB limit.' } },
    })
    render(<MediaUploader onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file('big.jpg')] } })

    expect(await screen.findByText(/larger than the 100 MB limit/i)).toBeInTheDocument()
  })

  it('surfaces the HEIC hint so an iPhone user knows how to fix it', async () => {
    vi.mocked(mediaLibraryApi.upload).mockRejectedValue({
      response: {
        status: 400,
        data: { detail: "HEIC photos aren't supported yet. On iPhone: Settings → Camera → Formats → Most Compatible." },
      },
    })
    render(<MediaUploader onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file('IMG_1.heic')] } })

    expect(await screen.findByText(/most compatible/i)).toBeInTheDocument()
  })

  it('continues the rest of the queue after one file fails, attributing the failure to it', async () => {
    vi.mocked(mediaLibraryApi.upload)
      .mockRejectedValueOnce({ response: { status: 413, data: { detail: 'File is larger than the 100 MB limit.' } } })
      .mockResolvedValueOnce({ id: 2 } as never)
    const onUploaded = vi.fn()
    render(<MediaUploader onUploaded={onUploaded} />)

    fireEvent.change(screen.getByTestId('media-file-input'), {
      target: { files: [file('big.jpg'), file('ok.jpg')] },
    })

    await waitFor(() => expect(mediaLibraryApi.upload).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/larger than the 100 MB limit/i)).toBeInTheDocument()
    // The failing file's row names it; the row for the succeeding file shows no error.
    const bigRow = screen.getByText('big.jpg').closest('li')
    const okRow = screen.getByText('ok.jpg').closest('li')
    expect(bigRow).toHaveTextContent(/larger than the 100 MB limit/i)
    expect(okRow).not.toHaveTextContent(/larger than the 100 MB limit/i)
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
  })
})
