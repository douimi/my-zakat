import { Routes, Route } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { ToastProvider } from './contexts/ToastContext'
import { useEffect, Suspense, lazy } from 'react'
import Layout from './components/Layout'
import AdminRoute from './components/AdminRoute'
import AdminLayout from './components/AdminLayout'
import UserRoute from './components/UserRoute'
import ErrorBoundary from './components/ErrorBoundary'
import ScrollToTop from './components/ScrollToTop'
import { useAuthStore } from './store/authStore'
import PageLoader from './components/PageLoader'

// Lazy load all pages for code splitting - reduces initial bundle size
const Home = lazy(() => import('./pages/Home'))
const About = lazy(() => import('./pages/About'))
const Donate = lazy(() => import('./pages/Donate'))
const DonationSuccess = lazy(() => import('./pages/DonationSuccess'))
const ZakatCalculator = lazy(() => import('./pages/ZakatCalculator'))
const ZakatEducation = lazy(() => import('./pages/ZakatEducation'))
const Stories = lazy(() => import('./pages/Stories'))
const StoryDetail = lazy(() => import('./pages/StoryDetail'))
const Events = lazy(() => import('./pages/Events'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const Programs = lazy(() => import('./pages/Programs'))
const Contact = lazy(() => import('./pages/Contact'))
const Volunteer = lazy(() => import('./pages/Volunteer'))
const Testimonials = lazy(() => import('./pages/Testimonials'))
const UserLogin = lazy(() => import('./pages/UserLogin'))
const UserRegister = lazy(() => import('./pages/UserRegister'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const UserDashboard = lazy(() => import('./pages/UserDashboard'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminDonations = lazy(() => import('./pages/admin/AdminDonations'))
const AdminContacts = lazy(() => import('./pages/admin/AdminContacts'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminStories = lazy(() => import('./pages/admin/AdminStories'))
const AdminTestimonials = lazy(() => import('./pages/admin/AdminTestimonials'))
const AdminVolunteers = lazy(() => import('./pages/admin/AdminVolunteers'))
const AdminSubscriptions = lazy(() => import('./pages/admin/AdminSubscriptions'))
const AdminProgramCategories = lazy(() => import('./pages/admin/AdminProgramCategories'))
const AdminPrograms = lazy(() => import('./pages/admin/AdminPrograms'))
const AdminGallery = lazy(() => import('./pages/admin/AdminGallery'))
const AdminVideos = lazy(() => import('./pages/admin/AdminVideos'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminSlideshow = lazy(() => import('./pages/admin/AdminSlideshow'))
const AdminUrgentNeeds = lazy(() => import('./pages/admin/AdminUrgentNeeds'))
const UrgentNeedDetail = lazy(() => import('./pages/UrgentNeedDetail'))
const CategoryDetail = lazy(() => import('./pages/CategoryDetail'))
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'))
const QuickLinks = lazy(() => import('./pages/QuickLinks'))
const IslamicKnowledge = lazy(() => import('./pages/IslamicKnowledge'))
const BookOfDuas = lazy(() => import('./pages/BookOfDuas'))
const CharityInIslam = lazy(() => import('./pages/CharityInIslam'))
const KaffarahCalculator = lazy(() => import('./pages/KaffarahCalculator'))
const ZakatAlFitrCalculator = lazy(() => import('./pages/ZakatAlFitrCalculator'))
const ZakatOnGold = lazy(() => import('./pages/ZakatOnGold'))
const UmrahGuidelines = lazy(() => import('./pages/UmrahGuidelines'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const DonationPolicy = lazy(() => import('./pages/DonationPolicy'))

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
    <ErrorBoundary>
      <ToastProvider>
        <Elements stripe={stripePromise}>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
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
                <Route path="programs" element={<Programs />} />
                <Route path="programs/:slug" element={<ProgramDetail />} />
                <Route path="categories/:slug" element={<CategoryDetail />} />
                <Route path="contact" element={<Contact />} />
                <Route path="volunteer" element={<Volunteer />} />
                <Route path="testimonials" element={<Testimonials />} />
                <Route path="urgent-needs/:slug" element={<UrgentNeedDetail />} />
                <Route path="quick-links" element={<QuickLinks />} />
                <Route path="islamic-knowledge" element={<IslamicKnowledge />} />
                <Route path="book-of-duas" element={<BookOfDuas />} />
                <Route path="charity-in-islam" element={<CharityInIslam />} />
                <Route path="kaffarah-calculator" element={<KaffarahCalculator />} />
                <Route path="zakat-al-fitr-calculator" element={<ZakatAlFitrCalculator />} />
                <Route path="zakat-on-gold" element={<ZakatOnGold />} />
                <Route path="umrah-guidelines" element={<UmrahGuidelines />} />
                <Route path="privacy-policy" element={<PrivacyPolicy />} />
                <Route path="donation-policy" element={<DonationPolicy />} />
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
                <Route path="program-categories" element={<AdminProgramCategories />} />
                <Route path="programs" element={<AdminPrograms />} />
                <Route path="gallery" element={<AdminGallery />} />
                <Route path="videos" element={<AdminVideos />} />
                <Route path="slideshow" element={<AdminSlideshow />} />
                <Route path="urgent-needs" element={<AdminUrgentNeeds />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Routes>
          </Suspense>
        </Elements>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App