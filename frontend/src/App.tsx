import { Routes, Route } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { ToastProvider } from './contexts/ToastContext'
import { useEffect } from 'react'
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
import UserLogin from './pages/UserLogin'
import UserRegister from './pages/UserRegister'
import VerifyEmail from './pages/VerifyEmail'
import UserDashboard from './pages/UserDashboard'
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
import AdminUsers from './pages/admin/AdminUsers'
import AdminRoute from './components/AdminRoute'
import AdminLayout from './components/AdminLayout'
import UserRoute from './components/UserRoute'
import { useAuthStore } from './store/authStore'

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')

function App() {
  const initFromStorage = useAuthStore((state) => state.initFromStorage)
  const logout = useAuthStore((state) => state.logout)

  // Initialize auth from localStorage on app start
  useEffect(() => {
    // Check if we need to clear old tokens from previous auth system
    const userType = localStorage.getItem('user_type')
    const adminData = localStorage.getItem('admin_data')
    
    // If old format detected, clear and force re-login
    if (userType === 'admin' || adminData) {
      console.log('Detected old auth format, clearing...')
      logout()
      return
    }
    
    initFromStorage()
  }, [initFromStorage, logout])

  return (
    <ToastProvider>
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

        {/* User authentication routes */}
        <Route path="/login" element={<UserLogin />} />
        <Route path="/register" element={<UserRegister />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        
        {/* User dashboard route */}
        <Route path="/dashboard" element={<UserRoute><UserDashboard /></UserRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="donations" element={<AdminDonations />} />
          <Route path="users" element={<AdminUsers />} />
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
    </ToastProvider>
  )
}

export default App