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

/** Every field long enough to clear MIN_LEN, so Continue and Submit enable. */
const complete = (): ProposalFormValues => ({
  full_name: 'Amina Yusuf',
  national_id: 'ID-90210',
  date_of_birth_year: '1992',
  place_of_residence: 'Gaza City',
  mobile_number: '+970599000000',
  email: 'amina@example.com',
  educational_level: 'BSc Agricultural Engineering',
  project_name: 'Community Water Well',
  project_description: 'Drilling and equipping a community water well for displaced families.',
  problem_solved: 'There is no safe drinking water within four kilometres of the camp.',
  target_beneficiaries: '250 displaced families in the northern camp.',
  community_impact: 'Free, metered water points open to every household in the camp.',
  expected_impact: 'Fewer waterborne illnesses and hours of walking returned to schooling.',
  implementation_steps: 'Survey the site\nDrill the borehole\nInstall the pump',
  implementation_location: 'Northern displacement camp',
  required_materials: 'Drilling rig\nSubmersible pump\nStorage tank',
  expected_duration: 'Two weeks after procurement',
  continuity_plan: 'A local water committee collects a small maintenance fee.',
  feasibility: 'The aquifer is shallow here and the contractor is already on site.',
  expected_challenges: 'Fuel shortages: stockpile diesel before drilling starts.',
  number_of_beneficiaries: '250',
  cost_per_unit_usd: '20',
  unit_type: 'family',
  additional_expenses_usd: '0',
  additional_expenses_description: '',
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

  it('seeds the SMS opt-in from the dossier when revising', async () => {
    // A revision rewrites the consent columns from whatever the form posts, so
    // a form that can only ever post `false` withdraws an opt-in the applicant
    // gave earlier and never touched. Seeding it restates that consent.
    renderForm({ mode: 'revise', initialValues: complete(), initialSmsConsent: true })

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('says out loud that a ticked box is a restatement, and can be undone', async () => {
    const user = userEvent.setup()
    renderForm({ mode: 'revise', initialValues: complete(), initialSmsConsent: true })

    expect(screen.getByText(/opted in to SMS messages on your previous submission/i))
      .toBeInTheDocument()

    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('never pre-ticks the SMS box on a first submission', () => {
    // 10DLC requires the applicant's own affirmative act the first time, so
    // `create` mode refuses the seed outright rather than trusting callers.
    renderForm({ mode: 'create', initialValues: complete(), initialSmsConsent: true })

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.queryByText(/opted in to SMS messages on your previous submission/i))
      .toBeNull()
  })

  it('carries the seeded consent through to the payload it submits', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderForm({ mode: 'revise', initialValues: complete(), initialSmsConsent: true, onSubmit })

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: /^continue$/i }))
    }
    await user.click(screen.getByRole('button', { name: /^resubmit proposal$/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.sms_consent).toBe(true)
    expect(payload.sms_consent_text).toContain('Customer care')
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
    expect(buildProposalPayload(filled(), false).sms_consent).toBe(false)
    expect(buildProposalPayload(filled(), false).sms_consent_text).toBeNull()
    expect(buildProposalPayload(filled(), true).sms_consent).toBe(true)
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
