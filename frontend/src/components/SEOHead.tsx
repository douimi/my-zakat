import { Helmet } from 'react-helmet-async'

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
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  const canonicalUrl = canonicalPath ? `${BASE_URL}${canonicalPath}` : undefined

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={ogImage} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

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
