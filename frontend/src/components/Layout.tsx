import { Outlet } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Header from './Header'
import Footer from './Footer'
import StickyDonationBar from './StickyDonationBar'
import { getGlobalJsonLd } from '../utils/seo'

// /login, /register and /verify-email deliberately render outside this layout (see App.tsx).
// Nothing inside it may carry an accessible name or placeholder containing "Email":
// the e2e suite's getByLabel('Email') and getByPlaceholder(/enter your email/i) are substring matches.
const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(getGlobalJsonLd())}
        </script>
      </Helmet>
      <a href="#main" className="skip-link">Skip to content</a>
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
