import { describe, it, expect } from 'vitest'
import { NAV, filterNavForRole, type NavGroup } from '../../../../components/adminNav'

const sponsorshipGroup = (role: Parameters<typeof filterNavForRole>[1]) =>
  filterNavForRole(NAV, role).find((e) => e.kind === 'group' && e.id === 'sponsorship') as NavGroup | undefined

describe('Sponsorship navigation', () => {
  it('sits right after Project Proposals, at the top of the nav', () => {
    const i = NAV.findIndex((e) => e.kind === 'link' && e.href === '/admin/project-proposals')
    expect(NAV[i + 1]).toMatchObject({ kind: 'group', id: 'sponsorship', label: 'Sponsorship' })
  })

  it('is visible to managers and admins; only admins see the monthly transfers, which move money', () => {
    const review = ['/admin/sponsorship', '/admin/sponsorship/families', '/admin/sponsorship/orphans', '/admin/sponsorship/sponsors']
    expect(sponsorshipGroup('admin')?.items.map((i) => i.href)).toEqual([...review, '/admin/sponsorship/transfers'])
    expect(sponsorshipGroup('manager')?.items.map((i) => i.href)).toEqual(review)
  })

  it('stays hidden from field staff', () => {
    expect(sponsorshipGroup('field_staff')).toBeUndefined()
  })
})
