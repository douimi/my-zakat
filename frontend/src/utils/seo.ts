/**
 * Shared SEO constants and JSON-LD schema generators for MyZakat.
 */

export const SEO = {
  siteName: 'MyZakat – Zakat Distribution Foundation',
  baseUrl: 'https://myzakat.org',
  defaultDescription:
    'MyZakat is a nonprofit Zakat distribution foundation empowering communities through transparent Zakat, Sadaqa, and charitable giving. Calculate your Zakat, donate securely, and support families in need.',
  phone: '+1-540-676-0330',
  email: 'info@myzakat.org',
  address: {
    street: '544 Monticello Street',
    city: 'Winchester',
    state: 'VA',
    zip: '22601',
    country: 'US',
  },
} as const

/** Global Organization + WebSite JSON-LD — rendered once in Layout */
export function getGlobalJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'NonprofitOrganization',
      '@id': `${SEO.baseUrl}/#organization`,
      name: 'MyZakat Zakat Distribution Foundation',
      alternateName: 'MyZakat',
      url: SEO.baseUrl,
      logo: `${SEO.baseUrl}/logo.png`,
      description: SEO.defaultDescription,
      telephone: SEO.phone,
      email: SEO.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: SEO.address.street,
        addressLocality: SEO.address.city,
        addressRegion: SEO.address.state,
        postalCode: SEO.address.zip,
        addressCountry: SEO.address.country,
      },
      sameAs: [
        'https://facebook.com/myzakat',
        'https://twitter.com/myzakat',
        'https://instagram.com/myzakat',
        'https://youtube.com/myzakat',
      ],
      nonprofitStatus: '501c3',
      areaServed: {
        '@type': 'Country',
        name: 'United States',
      },
      knowsAbout: [
        'Zakat',
        'Sadaqa',
        'Islamic Charitable Giving',
        'Zakat Calculation',
        'Zakat Distribution',
        'Kaffarah',
        'Zakat Al-Fitr',
        'Community Support',
        'Humanitarian Aid',
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SEO.baseUrl}/#website`,
      name: SEO.siteName,
      url: SEO.baseUrl,
      publisher: { '@id': `${SEO.baseUrl}/#organization` },
      description: SEO.defaultDescription,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SEO.baseUrl}/programs?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ]
}

/** Breadcrumb JSON-LD helper */
export function getBreadcrumbJsonLd(
  items: { name: string; path: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SEO.baseUrl}${item.path}`,
    })),
  }
}

/** FAQ JSON-LD helper — useful for educational pages */
export function getFaqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}
