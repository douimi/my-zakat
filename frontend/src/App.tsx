import { Routes, Route } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Donate from './pages/Donate'
import DonationSuccess from './pages/DonationSuccess'
import ZakatCalculator from './pages/ZakatCalculator'
import ZakatEducation from './pages/ZakatEducation'
import Stories from './pages/Stories'
import StoryDetail from './pages/StoryDetail'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Contact from './pages/Contact'
import Volunteer from './pages/Volunteer'
import Testimonials from './pages/Testimonials'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminSettings from './pages/admin/AdminSettings'
import AdminDonations from './pages/admin/AdminDonations'
import AdminContacts from './pages/admin/AdminContacts'
import AdminEvents from './pages/admin/AdminEvents'
import AdminStories from './pages/admin/AdminStories'
import AdminTestimonials from './pages/admin/AdminTestimonials'
import AdminVolunteers from './pages/admin/AdminVolunteers'
import AdminSubscriptions from './pages/admin/AdminSubscriptions'
import AdminMedia from './pages/admin/AdminMedia'
import AdminRoute from './components/AdminRoute'
import AdminLayout from './components/AdminLayout'

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')

function App() {
  return (
    <Elements stripe={stripePromise}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="donate" element={<Donate />} />
          <Route path="donation-success" element={<DonationSuccess />} />
          <Route path="zakat-calculator" element={<ZakatCalculator />} />
          <Route path="zakat-education" element={<ZakatEducation />} />
          <Route path="stories" element={<Stories />} />
          <Route path="stories/:id" element={<StoryDetail />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="contact" element={<Contact />} />
          <Route path="volunteer" element={<Volunteer />} />
          <Route path="testimonials" element={<Testimonials />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="donations" element={<AdminDonations />} />
          <Route path="contacts" element={<AdminContacts />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="stories" element={<AdminStories />} />
          <Route path="testimonials" element={<AdminTestimonials />} />
          <Route path="volunteers" element={<AdminVolunteers />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </Elements>
  )
}

export default App