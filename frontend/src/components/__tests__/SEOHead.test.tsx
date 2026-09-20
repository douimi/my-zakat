/**
 * SEOHead — the canonical tag, and the fact that there is exactly one of it.
 *
 * The bug this guards: `index.html` used to hardcode
 * `<link rel="canonical" href="https://myzakat.org/">`, and react-helmet-async
 * does not remove static tags from the document — it appends its own. Every
 * page therefore shipped two canonicals, one of them pointing at the homepage.
 * Consolidating every URL to `/` is the single most effective way to make a
 * site rank for its brand and nothing else.
 *
 * So there are two halves to assert, and both matter:
 *   - the rendered head carries exactly one canonical, pointing at the page;
 *   - `index.html` contributes none of its own.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import SEOHead from '../SEOHead'

const canonicals = () =>
  Array.from(document.head.querySelectorAll('link[rel="canonical"]')).map((el) =>
    el.getAttribute('href'),
  )

const renderAt = (path: string, node: React.ReactElement) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </HelmetProvider>,
  )

describe('SEOHead canonical', () => {
  afterEach(() => {
    cleanup()
    document.head.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove())
  })

  it('emits exactly one canonical, pointing at the page rather than the homepage', async () => {
    renderAt('/nisab', <SEOHead title="Nisab" canonicalPath="/nisab" />)

    await waitFor(() => expect(canonicals()).toEqual(['https://myzakat.org/nisab']))
  })

  it('falls back to the current path, so no page is left without one', async () => {
    renderAt('/zakat-calculator', <SEOHead title="Zakat Calculator" />)

    await waitFor(() => expect(canonicals()).toEqual(['https://myzakat.org/zakat-calculator']))
  })

  it('points og:url at the same URL as the canonical', async () => {
    renderAt('/about', <SEOHead title="About" />)

    await waitFor(() =>
      expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
        'https://myzakat.org/about',
      ),
    )
  })

  it('is not joined by a second canonical hardcoded in index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8')

    expect(html).not.toMatch(/rel=["']canonical["']/)
  })
})
