import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocaleProvider, detectLocale, interpolate, localeHref, stripLocale, useFormat, useT, defineMessages } from '..'

describe('locale from the URL', () => {
  it('is Arabic under /ar and English everywhere else', () => {
    expect(detectLocale('/ar')).toBe('ar')
    expect(detectLocale('/ar/donate')).toBe('ar')
    expect(detectLocale('/arabic-page')).toBe('en')
    expect(detectLocale('/donate')).toBe('en')
  })

  it('strips the prefix the router does not see', () => {
    expect(stripLocale('/ar')).toBe('/')
    expect(stripLocale('/ar/sponsor/O-ABC123')).toBe('/sponsor/O-ABC123')
    expect(stripLocale('/sponsor')).toBe('/sponsor')
  })

  it('points the same page at the other language, keeping query and hash', () => {
    const loc = { pathname: '/ar/sponsor/orphans', search: '?age=young', hash: '#top' }
    expect(localeHref('en', loc)).toBe('/sponsor/orphans?age=young#top')
    expect(localeHref('ar', { pathname: '/', search: '', hash: '' })).toBe('/ar')
    expect(localeHref('ar', { pathname: '/donate', search: '', hash: '' })).toBe('/ar/donate')
  })
})

describe('messages', () => {
  const M = defineMessages({ hello: { en: 'Hello {name}', ar: 'مرحبًا {name}' } })
  const Hello = () => {
    const t = useT()
    return <p>{t(M.hello, { name: 'Amina' })}</p>
  }

  it('interpolates variables', () => {
    expect(interpolate('{a} and {b}', { a: 1, b: 'two' })).toBe('1 and two')
  })

  it('defaults to English without a provider, which keeps every pinned test string intact', () => {
    render(<Hello />)
    expect(screen.getByText('Hello Amina')).toBeInTheDocument()
  })

  it('renders Arabic inside an Arabic provider', () => {
    render(<LocaleProvider locale="ar"><Hello /></LocaleProvider>)
    expect(screen.getByText('مرحبًا Amina')).toBeInTheDocument()
  })
})

describe('formatting', () => {
  const Money = ({ cents }: { cents: number }) => <p data-testid="m">{useFormat().money(cents)}</p>
  const Count = ({ n }: { n: number }) => {
    const { plural } = useFormat()
    return <p data-testid="c">{plural(n, { zero: 'صفر', one: 'واحد', two: 'اثنان', few: '{count} قليل', many: '{count} كثير', other: '{count} آخر' })}</p>
  }

  it('shows dollars the English way and keeps Western digits in Arabic', () => {
    const { unmount } = render(<Money cents={5000} />)
    expect(screen.getByTestId('m').textContent).toBe('$50')
    unmount()
    render(<LocaleProvider locale="ar"><Money cents={12550} /></LocaleProvider>)
    expect(screen.getByTestId('m').textContent).toMatch(/125\.50/)
  })

  it('picks the Arabic plural category', () => {
    const cases: [number, string][] = [[0, 'صفر'], [1, 'واحد'], [2, 'اثنان'], [5, '5 قليل'], [11, '11 كثير'], [100, '100 آخر']]
    for (const [n, expected] of cases) {
      const { unmount } = render(<LocaleProvider locale="ar"><Count n={n} /></LocaleProvider>)
      expect(screen.getByTestId('c').textContent).toBe(expected)
      unmount()
    }
  })
})
