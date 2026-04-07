import { Outlet } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Header from './Header'
import Footer from './Footer'
import StickyDonationBar from './StickyDonationBar'
import { getGlobalJsonLd } from '../utils/seo'

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(getGlobalJsonLd())}
        </script>
      </Helmet>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <StickyDonationBar />
    </div>
  )
}

export default Layout
