import { describe, it, expect } from 'vitest'
import { NAV, filterNavForRole, type NavGroup } from '../../../../components/adminNav'

const sponsorshipGroup = (role: Parameters<typeof filterNavForRole>[1]) =>
  filterNavForRole(NAV, role).find((e) => e.kind === 'group' && e.id === 'sponsorship') as NavGroup | undefined

describe('Sponsorship navigation', () => {
  it('sits right after Project Proposals, at the top of the nav', () => {
    const i = NAV.findIndex((e) => e.kind === 'link' && e.href === '/admin/project-proposals')
    expect(NAV[i + 1]).toMatchObject({ kind: 'group', id: 'sponsorship', label: 'Sponsorship' })
  })

  it('is visible to managers and admins with its four pages', () => {
    for (const role of ['admin', 'manager'] as const) {
      expect(sponsorshipGroup(role)?.items.map((i) => i.href)).toEqual([
        '/admin/sponsorship', '/admin/sponsorship/families', '/admin/sponsorship/orphans', '/admin/sponsorship/sponsors',
      ])
    }
  })

  it('stays hidden from field staff', () => {
    expect(sponsorshipGroup('field_staff')).toBeUndefined()
  })
})
