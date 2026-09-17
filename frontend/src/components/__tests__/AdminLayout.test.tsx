import { describe, it, expect } from 'vitest'
import { NAV, ROLE_ALLOWED, filterNavForRole } from '../adminNav'
import type { Role } from '../../store/authStore'

// Flatten a nav tree (top-level links + group items) down to hrefs.
const hrefsOf = (nav: typeof NAV) =>
  nav.flatMap((e) => (e.kind === 'link' ? [e.href] : e.items.map((i) => i.href)))

describe('filterNavForRole', () => {
  it('gives admins the full NAV back unchanged', () => {
    expect(filterNavForRole(NAV, 'admin')).toBe(NAV)
  })

  it('gives field_staff exactly one link', () => {
    const nav = filterNavForRole(NAV, 'field_staff')
    expect(hrefsOf(nav)).toEqual(['/admin/media'])
  })

  it('gives managers their four sections plus both media links', () => {
    const hrefs = hrefsOf(filterNavForRole(NAV, 'manager'))
    expect(hrefs.sort()).toEqual([...ROLE_ALLOWED.manager!].sort())
  })

  it('gives an unknown role nothing', () => {
    // 'user' has an explicit empty Set in ROLE_ALLOWED, but any role absent
    // from the map entirely must fail closed the same way. Cast past the
    // Role union deliberately — the whole point is an unrecognized value.
    expect(filterNavForRole(NAV, 'unknown-role' as unknown as Role)).toEqual([])
  })

  it('drops a group entirely once every one of its children is filtered out', () => {
    const nav = filterNavForRole(NAV, 'field_staff')
    // field_staff is only allowed /admin/media, which lives in the 'media'
    // group alongside other links (Gallery, S3 Browser, Cleanup) that must
    // all be filtered out — the group itself must not survive as an empty
    // shell, and no group other than 'media' should remain at all.
    const groupIds = nav.filter((e) => e.kind === 'group').map((e) => (e as { id: string }).id)
    expect(groupIds).toEqual(['media'])
    const mediaGroup = nav.find((e) => e.kind === 'group' && e.id === 'media') as
      | { kind: 'group'; items: { href: string }[] }
      | undefined
    expect(mediaGroup?.items.map((i) => i.href)).toEqual(['/admin/media'])
  })

  it('keeps every ROLE_ALLOWED entry consistent with an href that actually exists in NAV', () => {
    const NAV_HREFS = new Set(hrefsOf(NAV))
    for (const [role, allowed] of Object.entries(ROLE_ALLOWED)) {
      for (const href of allowed ?? []) {
        expect(NAV_HREFS, `${role} allows ${href}`).toContain(href)
      }
    }
  })
})
