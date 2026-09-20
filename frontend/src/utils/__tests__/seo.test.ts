import { describe, it, expect } from 'vitest'
import { currentYear, getHowToJsonLd, getWebApplicationJsonLd } from '../seo'

describe('schema generators', () => {
  it('stamps the real current year, so a title cannot go stale', () => {
    expect(currentYear()).toBe(new Date().getFullYear())
  })

  it('describes a calculator as a free web application', () => {
    const ld = getWebApplicationJsonLd({
      name: 'Zakat Calculator', description: 'Work out what you owe', path: '/zakat-calculator',
    })

    expect(ld['@type']).toBe('WebApplication')
    expect(ld.url).toBe('https://myzakat.org/zakat-calculator')
    expect(ld.isAccessibleForFree).toBe(true)
    expect((ld.offers as Record<string, unknown>).price).toBe('0')
  })

  it('numbers HowTo steps from one, in order', () => {
    const ld = getHowToJsonLd({
      name: 'How to calculate zakat',
      description: 'Four steps',
      steps: [{ name: 'Add assets', text: 'Total what you own.' },
              { name: 'Compare', text: 'Check it against the nisab.' }],
    })

    const steps = ld.step as { position: number; name: string }[]
    expect(steps.map((s) => s.position)).toEqual([1, 2])
    expect(steps[0].name).toBe('Add assets')
  })
})
