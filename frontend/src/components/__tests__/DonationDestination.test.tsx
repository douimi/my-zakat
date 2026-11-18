import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import DonationDestination, { purposeOf, type Destination } from '../DonationDestination'
import type { Project } from '../FundraisingProjectsSection'

const project = (id: number, over: Partial<Project> = {}): Project => ({
  id, title: `Project ${id}`, slug: `project-${id}`, short_description: '', image_url: null,
  goal_amount: 1000, spent_amount: 250, remaining_amount: 750, progress_percent: 25, currency: 'USD',
  suggested_donation: null, deadline: null, status: 'active', is_active: true, is_featured: false, category: null,
  ...over,
})

const serve = (projects: Project[]) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => projects }))

const Harness = ({ preselect = null, cause = null, onChange = () => {} }: {
  preselect?: string | null; cause?: string | null; onChange?: (d: Destination) => void
}) => {
  const [value, setValue] = useState<Destination>(cause ? { kind: 'cause', title: cause } : { kind: 'general' })
  const [zakat, setZakat] = useState(false)
  return (
    <DonationDestination value={value} onChange={(d) => { setValue(d); onChange(d) }} cause={cause}
      preselect={preselect} isZakat={zakat} onZakatChange={setZakat} givingType={null} onClearGivingType={() => {}} />
  )
}

describe('DonationDestination', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('stays light with many projects: three cards, the rest in one dropdown', async () => {
    serve([1, 2, 3, 4, 5, 6, 7].map((i) => project(i)))
    render(<Harness />)

    expect(await screen.findByLabelText(/Project 1/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)          // most needed + 3 projects
    const more = screen.getByLabelText('More projects (4)')
    expect(more.querySelectorAll('option')).toHaveLength(5)       // placeholder + 4
  })

  it('selects a project from the dropdown', async () => {
    serve([1, 2, 3, 4].map((i) => project(i)))
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.selectOptions(await screen.findByLabelText('More projects (1)'), '4')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'project', id: 4, title: 'Project 4' })
    expect(screen.getByLabelText(/Where the need is greatest/)).not.toBeChecked()
  })

  it('preselects the project a card linked to, even when it sits in the dropdown', async () => {
    serve([1, 2, 3, 4].map((i) => project(i)))
    render(<Harness preselect="project-4" />)
    await waitFor(() => expect(screen.getByLabelText('More projects (1)')).toHaveValue('4'))
  })

  it('treats a linked cause that is in fact a project as that project, offered once', async () => {
    serve([project(1, { title: 'Water wells', slug: 'water-wells' })])
    render(<Harness cause="Water wells" preselect="Water wells" />)
    await waitFor(() => expect(screen.getByLabelText(/Water wells/)).toBeChecked())
    expect(screen.getAllByLabelText(/Water wells/)).toHaveLength(1)
  })

  it('names the gift by its type and where it goes', () => {
    expect(purposeOf({ kind: 'general' }, false, null)).toBe('General Donation')
    expect(purposeOf({ kind: 'general' }, true, null)).toBe('Zakat')
    expect(purposeOf({ kind: 'project', id: 1, title: 'Water wells' }, true, null)).toBe('Zakat · Water wells')
    expect(purposeOf({ kind: 'cause', title: 'Food for Gaza' }, false, null)).toBe('Food for Gaza')
    expect(purposeOf({ kind: 'general' }, true, 'Kaffarah')).toBe('Kaffarah')
  })
})
