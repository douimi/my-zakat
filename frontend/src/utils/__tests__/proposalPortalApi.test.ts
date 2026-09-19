import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  PORTAL_TOKEN_KEY, clearPortalToken, fetchMyProposals, hasPortalToken, portalApi,
  requestPortalCode, verifyPortalCode,
} from '../proposalPortalApi'

describe('proposalPortalApi', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('keeps its token in sessionStorage, never in localStorage', async () => {
    vi.spyOn(portalApi, 'post').mockResolvedValue({ data: { token: 'portal-token', expires_in: 1800 } })

    await verifyPortalCode('amina@example.com', '123456')

    expect(sessionStorage.getItem(PORTAL_TOKEN_KEY)).toBe('portal-token')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('never reads the staff token', async () => {
    localStorage.setItem('auth_token', 'staff-token')

    const config = await (portalApi.interceptors.request as any).handlers[0].fulfilled({ headers: {} })

    expect(config.headers.Authorization).toBeUndefined()
  })

  it('attaches its own token once it has one', async () => {
    sessionStorage.setItem(PORTAL_TOKEN_KEY, 'portal-token')

    const config = await (portalApi.interceptors.request as any).handlers[0].fulfilled({ headers: {} })

    expect(config.headers.Authorization).toBe('Bearer portal-token')
  })

  it('is a different axios instance from the shared client', () => {
    expect(portalApi).not.toBe(axios)
    expect(portalApi.defaults.withCredentials).toBeFalsy()
  })

  it('reports and clears its session', () => {
    expect(hasPortalToken()).toBe(false)
    sessionStorage.setItem(PORTAL_TOKEN_KEY, 'portal-token')
    expect(hasPortalToken()).toBe(true)
    clearPortalToken()
    expect(hasPortalToken()).toBe(false)
  })

  it('keeps the address /portal/me answers with, not just the list', async () => {
    // A reloaded tab holds the token and has lost every piece of React state.
    // This address is the only thing that can tell it whose proposals it is
    // showing, and therefore where to send a fresh code when the token lapses
    // mid-revision -- so it must not be dropped on the floor here.
    vi.spyOn(portalApi, 'get').mockResolvedValue({
      data: { email: 'amina@example.com', items: [{ id: 7 }] },
    })

    const dossiers = await fetchMyProposals()

    expect(dossiers.email).toBe('amina@example.com')
    expect(dossiers.items).toHaveLength(1)
  })

  it('survives a payload with neither key', async () => {
    vi.spyOn(portalApi, 'get').mockResolvedValue({ data: {} })

    expect(await fetchMyProposals()).toEqual({ email: '', items: [] })
  })

  it('asks for a code by email', async () => {
    const post = vi.spyOn(portalApi, 'post').mockResolvedValue({ data: { message: 'ok' } })

    await requestPortalCode('amina@example.com')

    expect(post).toHaveBeenCalledWith('/api/project-proposals/portal/request-code', {
      email: 'amina@example.com',
    })
  })
})
