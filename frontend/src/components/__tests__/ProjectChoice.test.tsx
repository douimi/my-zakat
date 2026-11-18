import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectChoice from '../ProjectChoice'
import type { Project } from '../FundraisingProjectsSection'

const project = (over: Partial<Project>): Project => ({
  id: 1, title: 'Water wells', slug: 'water-wells', short_description: '', image_url: null,
  goal_amount: 1000, spent_amount: 250, remaining_amount: 750, progress_percent: 25, currency: 'USD',
  suggested_donation: null, deadline: null, status: 'active', is_active: true, is_featured: false, category: null,
  ...over,
})

const serve = (projects: Project[]) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => projects }))

describe('ProjectChoice', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('offers open projects only, with "where most needed" selected by default', async () => {
    serve([project({}), project({ id: 2, title: 'Done', slug: 'done', status: 'completed' }),
      project({ id: 3, title: 'Soon', slug: 'soon', status: 'upcoming' })])
    render(<ProjectChoice value={null} onChange={vi.fn()} />)

    expect(await screen.findByLabelText(/Water wells/)).not.toBeChecked()
    expect(screen.getByLabelText(/Where the need is greatest/)).toBeChecked()
    expect(screen.getByText('$250 raised of $1,000')).toBeInTheDocument()
    expect(screen.queryByText('Done')).toBeNull()
    expect(screen.queryByText('Soon')).toBeNull()
  })

  it('preselects the project a card linked to, by slug or by an older title link', async () => {
    serve([project({})])
    const bySlug = vi.fn()
    render(<ProjectChoice value={null} onChange={bySlug} preselect="water-wells" />)
    await waitFor(() => expect(bySlug).toHaveBeenCalledWith(1, expect.objectContaining({ slug: 'water-wells' })))
    cleanup()

    const byTitle = vi.fn()
    render(<ProjectChoice value={null} onChange={byTitle} preselect="Water Wells" />)
    await waitFor(() => expect(byTitle).toHaveBeenCalledWith(1, expect.anything()))
  })

  it('reports the choice', async () => {
    serve([project({})])
    const onChange = vi.fn()
    render(<ProjectChoice value={null} onChange={onChange} />)
    await userEvent.click(await screen.findByLabelText(/Water wells/))
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1 }))
  })
})
