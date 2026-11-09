import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'
import { useLocale } from '../i18n'

interface SEOHeadProps {
  title?: string
  description?: string
  canonicalPath?: string
  ogType?: string
  ogImage?: string
  noindex?: boolean
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

const SITE_NAME = 'MyZakat – Zakat Distribution Foundation'
const SITE_NAME_AR = 'ماي زكاة – مؤسسة توزيع الزكاة'
const BASE_URL = 'https://myzakat.org'
const DEFAULT_DESCRIPTION =
  'MyZakat is a nonprofit Zakat distribution foundation empowering communities through transparent Zakat, Sadaqa, and charitable giving. Calculate your Zakat, donate securely, and support families in need.'
const DEFAULT_OG_IMAGE = `${BASE_URL}/logo.png`

const SEOHead = ({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd,
}: SEOHeadProps) => {
  // index.html carries no canonical of its own: react-helmet-async does not
  // remove static tags, so a hardcoded one there would ship alongside this one
  // and point every page at the homepage. This is now the only canonical on
  // the page, so it must always be emitted -- defaulting to the current path
  // when a page does not name one explicitly.
  const { pathname } = useLocation()
  const locale = useLocale()
  const siteName = locale === 'ar' ? SITE_NAME_AR : SITE_NAME
  const fullTitle = title ? `${title} | ${siteName}` : siteName
  // The router strips the /ar basename, so `path` is the same for both
  // languages; each version names itself canonical and points at the other.
  const path = canonicalPath ?? pathname
  const enUrl = `${BASE_URL}${path}`
  const arUrl = `${BASE_URL}${path === '/' ? '/ar' : `/ar${path}`}`
  const canonicalUrl = locale === 'ar' ? arUrl : enUrl

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={canonicalUrl} />
      {!noindex && <link rel="alternate" hrefLang="en" href={enUrl} />}
      {!noindex && <link rel="alternate" hrefLang="ar" href={arUrl} />}
      {!noindex && <link rel="alternate" hrefLang="x-default" href={enUrl} />}
      <meta property="og:locale" content={locale === 'ar' ? 'ar_AR' : 'en_US'} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonicalUrl} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  )
}

export default SEOHead
