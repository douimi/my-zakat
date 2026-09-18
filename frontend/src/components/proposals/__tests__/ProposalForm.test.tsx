import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProposalForm, {
  EMPTY_PROPOSAL_FORM,
  buildProposalPayload,
  humanizePydanticError,
} from '../ProposalForm'
import type { ProposalFormValues } from '../ProposalForm'

const renderForm = (props: Partial<React.ComponentProps<typeof ProposalForm>> = {}) =>
  render(
    <MemoryRouter>
      <ProposalForm
        mode="create"
        onSubmit={vi.fn()}
        submitting={false}
        fieldErrors={[]}
        genericError=""
        {...props}
      />
    </MemoryRouter>,
  )

const filled = (): ProposalFormValues => ({
  ...EMPTY_PROPOSAL_FORM,
  full_name: 'Amina Yusuf',
  email: 'amina@example.com',
  project_name: 'Fresh Food Parcels',
  number_of_beneficiaries: '200',
  cost_per_unit_usd: '20',
  unit_type: 'family',
  additional_expenses_usd: '500',
})

describe('ProposalForm', () => {
  it('starts on step 1 with an editable email in create mode', () => {
    renderForm()

    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    expect(email).not.toBeDisabled()
    expect(email.value).toBe('')
  })

  it('prefills and locks the email in revise mode', () => {
    renderForm({ mode: 'revise', initialValues: filled() })

    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    expect(email.value).toBe('amina@example.com')
    expect(email).toBeDisabled()
    expect(screen.getByDisplayValue('Amina Yusuf')).toBeInTheDocument()
  })

  it('explains why the email is locked rather than just greying it out', () => {
    renderForm({ mode: 'revise', initialValues: filled() })

    expect(screen.getByText(/contact us.*change.*email/i)).toBeInTheDocument()
  })

  it('labels the submit button for the mode it is in', () => {
    const { unmount } = renderForm({ mode: 'create' })
    expect(screen.getByTestId('proposal-form')).toHaveAttribute('data-mode', 'create')
    unmount()

    renderForm({ mode: 'revise', initialValues: filled() })
    expect(screen.getByTestId('proposal-form')).toHaveAttribute('data-mode', 'revise')
  })

  it('jumps to the earliest step that has a server-side error', () => {
    renderForm({
      fieldErrors: [
        { field: 'feasibility', label: 'Feasibility', step: 3, msg: 'needs at least 10 characters' },
        { field: 'email', label: 'Email', step: 1, msg: 'not a valid email address' },
      ],
    })

    expect(screen.getByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('shows a generic error when the server sent one', () => {
    renderForm({ genericError: 'Network error. Please try again.' })

    expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument()
  })

  it('associates every visible label with its control', () => {
    renderForm()

    // Step 1's seven fields; the same Field component renders every step, so
    // one step proves the wiring. An unassociated label is invisible to a
    // screen reader as well as to getByLabelText.
    for (const label of [/^full name/i, /^national id number/i, /^date of birth/i,
                         /^place of residence/i, /^mobile number/i, /^email/i,
                         /^educational level/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('advances to step 2 once every step-1 field is filled', async () => {
    const user = userEvent.setup()
    renderForm({ initialValues: {
      ...EMPTY_PROPOSAL_FORM,
      full_name: 'Amina Yusuf',
      national_id: 'ID-90210',
      date_of_birth_year: '1992',
      place_of_residence: 'Sanaa',
      mobile_number: '+967700000000',
      email: 'amina@example.com',
      educational_level: 'BSc Agriculture',
    } })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByRole('heading', { name: /project information/i })).toBeInTheDocument()
  })
})

describe('buildProposalPayload', () => {
  it('computes the total from the breakdown the backend re-checks', () => {
    const payload = buildProposalPayload(filled(), false)

    expect(payload.total_amount_usd).toBe(200 * 20 + 500)
    expect(payload.number_of_beneficiaries).toBe(200)
    expect(payload.cost_per_unit_usd).toBe(20)
  })

  it('sends the consent wording only when the box was ticked', () => {
    expect(buildProposalPayload(filled(), false).sms_consent_text).toBeNull()
    expect(buildProposalPayload(filled(), true).sms_consent_text).toContain('Customer care')
  })

  it('trims text and nulls an empty optional description', () => {
    const payload = buildProposalPayload(
      { ...filled(), full_name: '  Amina Yusuf  ', additional_expenses_description: '   ' },
      false,
    )

    expect(payload.full_name).toBe('Amina Yusuf')
    expect(payload.additional_expenses_description).toBeNull()
  })
})

describe('humanizePydanticError', () => {
  it('turns validator prose into something an applicant can act on', () => {
    expect(humanizePydanticError('String should have at least 10 characters'))
      .toBe('needs at least 10 characters')
    expect(humanizePydanticError('value is not a valid email address'))
      .toBe('not a valid email address')
    expect(humanizePydanticError('Input should be greater than 0'))
      .toBe('must be greater than zero')
  })
})
