import { Outlet } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Header from './Header'
import Footer from './Footer'
import StickyDonationBar from './StickyDonationBar'
import { getGlobalJsonLd } from '../utils/seo'
import LanguageSuggestion from './i18n/LanguageSuggestion'
import { useT } from '../i18n'
import { C } from '../i18n/common'

// /login, /register and /verify-email deliberately render outside this layout (see App.tsx).
// Nothing inside it may carry an accessible name or placeholder containing "Email":
// the e2e suite's getByLabel('Email') and getByPlaceholder(/enter your email/i) are substring matches.
const Layout = () => {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(getGlobalJsonLd())}
        </script>
      </Helmet>
      <a href="#main" className="skip-link">{t(C.skipToContent)}</a>
      <LanguageSuggestion />
      <Header />
      <main id="main" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <StickyDonationBar />
    </div>
  )
}

export default Layout
