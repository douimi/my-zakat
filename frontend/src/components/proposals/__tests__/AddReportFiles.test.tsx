import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddReportFiles from '../AddReportFiles'
import { addReportAttachments } from '../../../utils/proposalPortalApi'

vi.mock('../../../utils/proposalPortalApi', async (importActual) => ({
  ...(await importActual<typeof import('../../../utils/proposalPortalApi')>()),
  addReportAttachments: vi.fn(),
}))

const MB = 1024 * 1024
const fileOf = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
const RESULT = { status: 'report_submitted', attachments_stored: 1, attachments_offered: 1, report: {} as never }

const setup = (props: Partial<Parameters<typeof AddReportFiles>[0]> = {}) => {
  const onAdded = vi.fn()
  render(<AddReportFiles proposalId={7} existingCount={0} existingBytes={0} onAdded={onAdded} {...props} />)
  return { onAdded, user: userEvent.setup() }
}

beforeEach(() => { vi.clearAllMocks() })

describe('AddReportFiles', () => {
  it('sends the files with visible progress and reports back', async () => {
    let progress: ((loaded: number, total: number) => void) | undefined
    let finish: (v: typeof RESULT) => void = () => {}
    vi.mocked(addReportAttachments).mockImplementation((_id, _files, onProgress) => {
      progress = onProgress
      return new Promise((resolve) => { finish = resolve })
    })
    const { user, onAdded } = setup()
    const pdf = fileOf('report.pdf', 'application/pdf', 48 * MB)

    await user.upload(screen.getByTestId('add-report-file-input'), pdf)
    await user.click(screen.getByRole('button', { name: /add 1 file to the report/i }))

    expect(addReportAttachments).toHaveBeenCalledWith(7, [pdf], expect.any(Function))
    progress?.(12 * MB, 48 * MB)
    expect(await screen.findByText(/sending… 25%/i)).toHaveTextContent('12.0 MB of 48.0 MB')

    finish(RESULT)
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(RESULT))
  })

  it('will not send a file over the limit', async () => {
    const { user } = setup()
    await user.upload(screen.getByTestId('add-report-file-input'), fileOf('huge.pdf', 'application/pdf', 150 * MB))
    expect(screen.getByText(/limit is 100 MB per file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add 1 file/i })).toBeDisabled()
  })

  it('counts what the report already carries against the caps', async () => {
    const { user } = setup({ existingCount: 20 })
    await user.upload(screen.getByTestId('add-report-file-input'), fileOf('one-more.pdf', 'application/pdf', MB))
    expect(screen.getByText(/at most 20 files/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add 1 file/i })).toBeDisabled()
  })

  it('shows the server reason when the files are refused', async () => {
    vi.mocked(addReportAttachments).mockRejectedValue(
      { response: { status: 409, data: { detail: 'Files can only be added to a report that is waiting for review.' } } })
    const { user } = setup()
    await user.upload(screen.getByTestId('add-report-file-input'), fileOf('r.pdf', 'application/pdf', MB))
    await user.click(screen.getByRole('button', { name: /add 1 file/i }))
    expect(await screen.findByText(/waiting for review/i)).toBeInTheDocument()
  })
})
