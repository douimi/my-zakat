import { useCallback } from 'react'
import { useFormat, useLocale } from '../../i18n'

/**
 * Counted phrases. Arabic agrees the noun with the number in six ways
 * (zero, one, two, few = 3–10, many = 11–99, other), so "{n} years" cannot be
 * one template; CLDR's plural rules pick the form.
 */
export const useCounts = () => {
  const locale = useLocale()
  const { plural } = useFormat()

  const age = useCallback((n: number) => locale === 'ar'
    ? plural(n, { zero: 'أقل من سنة', one: 'سنة واحدة', two: 'سنتان', few: '{count} سنوات', many: '{count} سنة', other: '{count} سنة' })
    : plural(n, { one: '{count} year old', other: '{count} years old' }), [locale, plural])

  const household = useCallback((n: number) => locale === 'ar'
    ? plural(n, { one: 'فرد واحد', two: 'فردان', few: 'أسرة من {count} أفراد', many: 'أسرة من {count} فردًا', other: 'أسرة من {count} فرد' })
    : plural(n, { one: 'One person', other: 'Household of {count}' }), [locale, plural])

  const sponsors = useCallback((n: number) => locale === 'ar'
    ? plural(n, { zero: 'لا يوجد كفيل بعد', one: 'كفيل واحد', two: 'كفيلان', few: '{count} كفلاء', many: '{count} كفيلًا', other: '{count} كفيل' })
    : plural(n, { zero: 'no sponsor yet', one: 'one sponsor', other: '{count} sponsors' }), [locale, plural])

  const children = useCallback((n: number) => locale === 'ar'
    ? plural(n, { one: 'طفل واحد', two: 'طفلان', few: '{count} أطفال', many: '{count} طفلًا', other: '{count} طفل' })
    : plural(n, { one: 'one child', other: '{count} children' }), [locale, plural])

  return { age, household, sponsors, children }
}
