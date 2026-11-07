/**
 * The completion-report form: the limits it checks before sending, and the
 * session it renews without costing the team its text or its files.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportForm, { problemWith } from '../ReportForm'
import {
  clearPortalToken, portalTokenSecondsLeft, requestPortalCode, submitCompletionReport,
  verifyPortalCode,
} from '../../../utils/proposalPortalApi'

vi.mock('../../../utils/proposalPortalApi', async (importActual) => ({
  ...(await importActual<typeof import('../../../utils/proposalPortalApi')>()),
  clearPortalToken: vi.fn(),
  portalTokenSecondsLeft: vi.fn(),
  requestPortalCode: vi.fn(),
  submitCompletionReport: vi.fn(),
  verifyPortalCode: vi.fn(),
}))

const MB = 1024 * 1024
const EMAIL = 'team@example.com'
const RESULT = { status: 'report_submitted', attachments_stored: 1, attachments_offered: 1, report: {} as never }

const fileOf = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const setup = (props: Partial<Parameters<typeof ReportForm>[0]> = {}) => {
  const onSubmitted = vi.fn()
  const onCancel = vi.fn()
  render(
    <ReportForm proposal={{ id: 7, status: 'funded' }} email={EMAIL}
      onSubmitted={onSubmitted} onCancel={onCancel} {...props} />,
  )
  return { onSubmitted, onCancel, user: userEvent.setup() }
}

const describeWork = (user: ReturnType<typeof userEvent.setup>, text = 'Fed 48 families.') =>
  user.type(screen.getByLabelText(/describe what was done/i), text)

const attach = (user: ReturnType<typeof userEvent.setup>, ...files: File[]) =>
  user.upload(screen.getByTestId('report-file-input'), files)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(portalTokenSecondsLeft).mockReturnValue(30 * 60)
  vi.mocked(requestPortalCode).mockResolvedValue({ message: 'sent' })
  vi.mocked(verifyPortalCode).mockResolvedValue(undefined)
  vi.mocked(submitCompletionReport).mockResolvedValue(RESULT)
})

describe('problemWith', () => {
  it('accepts a 50 MB PDF, the file the agreement asks for', () => {
    expect(problemWith(fileOf('report.pdf', 'application/pdf', 50 * MB))).toBeNull()
  })

  it('refuses a file over 100 MB, and says what to do about it', () => {
    expect(problemWith(fileOf('report.pdf', 'application/pdf', 101 * MB)))
      .toMatch(/limit is 100 MB per file.*split it/i)
  })

  it('names iPhone HEIC photos rather than calling them unsupported', () => {
    expect(problemWith(fileOf('IMG_1.HEIC', '', 2 * MB))).toMatch(/HEIC/)
  })

  it('refuses a document that is not a PDF', () => {
    expect(problemWith(fileOf('notes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', MB)))
      .toMatch(/photos, videos and PDF/i)
  })
})

describe('ReportForm', () => {
  it('sends the text and files, with progress, and clears the saved draft', async () => {
    let report: ((loaded: number, total: number) => void) | undefined
    let finish: (value: typeof RESULT) => void = () => {}
    vi.mocked(submitCompletionReport).mockImplementation((_id, _text, _files, onProgress) => {
      report = onProgress
      return new Promise((resolve) => { finish = resolve })
    })
    const { user, onSubmitted } = setup()
    const pdf = fileOf('report.pdf', 'application/pdf', 50 * MB)

    await describeWork(user)
    await attach(user, pdf)
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(submitCompletionReport).toHaveBeenCalledWith(7, 'Fed 48 families.', [pdf], expect.any(Function))
    report?.(25 * MB, 50 * MB)
    expect(await screen.findByText(/sending… 50%/i)).toHaveTextContent('25.0 MB of 50.0 MB')

    finish(RESULT)
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(RESULT))
    expect(localStorage.getItem('myzakat:report-draft:7')).toBeNull()
  })

  it('will not send a file the server would refuse', async () => {
    const { user } = setup()
    await describeWork(user)
    await attach(user, fileOf('huge.pdf', 'application/pdf', 120 * MB))

    expect(screen.getByText(/limit is 100 MB per file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /remove huge\.pdf/i }))
    expect(screen.getByRole('button', { name: /send report/i })).toBeEnabled()
  })

  it('flags a batch over the 300 MB total', async () => {
    const { user } = setup()
    await describeWork(user)
    await attach(user, ...[1, 2, 3, 4].map((n) => fileOf(`part${n}.pdf`, 'application/pdf', 90 * MB)))
    expect(screen.getByText(/over the 300 MB limit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled()
  })

  it('keeps the text on the device and brings it back', async () => {
    const { user } = setup()
    await describeWork(user, 'Half written')
    expect(localStorage.getItem('myzakat:report-draft:7')).toBe('Half written')
  })

  it('restores a saved draft', () => {
    localStorage.setItem('myzakat:report-draft:7', 'From yesterday')
    setup()
    expect(screen.getByLabelText(/describe what was done/i)).toHaveValue('From yesterday')
  })

  it('asks for a fresh code BEFORE uploading when the session would lapse mid-upload', async () => {
    vi.mocked(portalTokenSecondsLeft).mockReturnValue(4 * 60)
    const { user, onSubmitted } = setup()
    const pdf = fileOf('report.pdf', 'application/pdf', 50 * MB)
    await describeWork(user)
    await attach(user, pdf)

    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(submitCompletionReport).not.toHaveBeenCalled()
    expect(requestPortalCode).toHaveBeenCalledWith(EMAIL)
    expect(screen.getByText(/your text and files are kept/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/six-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /confirm and send/i }))

    expect(verifyPortalCode).toHaveBeenCalledWith(EMAIL, '123456')
    await waitFor(() =>
      expect(submitCompletionReport).toHaveBeenCalledWith(7, 'Fed 48 families.', [pdf], expect.any(Function)))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
  })

  it('recovers from a 401 without losing the text or the files', async () => {
    vi.mocked(submitCompletionReport)
      .mockRejectedValueOnce({ response: { status: 401, data: {} } })
      .mockResolvedValueOnce(RESULT)
    const { user, onSubmitted } = setup()
    const pdf = fileOf('report.pdf', 'application/pdf', 5 * MB)
    await describeWork(user)
    await attach(user, pdf)
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(await screen.findByText(/session expired while sending/i)).toBeInTheDocument()
    expect(clearPortalToken).toHaveBeenCalled()
    expect(screen.getByLabelText(/describe what was done/i)).toHaveValue('Fed 48 families.')
    expect(screen.getByText('report.pdf')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/six-digit code/i), '654321')
    await user.click(screen.getByRole('button', { name: /confirm and send/i }))

    await waitFor(() => expect(submitCompletionReport).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitCompletionReport).mock.calls[1][2]).toEqual([pdf])
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
  })

  it('keeps everything when a wrong code is entered', async () => {
    vi.mocked(portalTokenSecondsLeft).mockReturnValue(0)
    vi.mocked(verifyPortalCode).mockRejectedValueOnce({ response: { status: 401, data: {} } })
    const { user } = setup()
    await describeWork(user)
    await user.click(screen.getByRole('button', { name: /send report/i }))

    await user.type(await screen.findByLabelText(/six-digit code/i), '000000')
    await user.click(screen.getByRole('button', { name: /confirm and send/i }))

    expect(await screen.findByText(/not valid or has expired/i)).toBeInTheDocument()
    expect(submitCompletionReport).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/describe what was done/i)).toHaveValue('Fed 48 families.')
  })

  it('shows the server reason when a send is refused, and lets the team retry', async () => {
    vi.mocked(submitCompletionReport).mockRejectedValueOnce(
      { response: { status: 400, data: { detail: 'That file says it is a PDF but its contents are not.' } } })
    const { user } = setup()
    await describeWork(user)
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(await screen.findByText(/contents are not/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send report/i })).toBeEnabled()
  })
})

describe('ReportForm — an admin acting for the team', () => {
  it('never emails the team a code; it tells the admin to reopen the view', async () => {
    vi.mocked(portalTokenSecondsLeft).mockReturnValue(60)
    const { user } = setup({ adminView: true })
    await describeWork(user)
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(await screen.findByText(/admin view of this portal has expired/i)).toBeInTheDocument()
    expect(requestPortalCode).not.toHaveBeenCalled()
    expect(submitCompletionReport).not.toHaveBeenCalled()
  })
})
