import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js'
import { ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react'
import { donationsAPI } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../contexts/ToastContext'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useFormat, useLocale, useT, type Message } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  seoTitle: { en: 'Donate Zakat & Sadaqa Online', ar: 'أدِّ زكاتك وصدقتك عبر الإنترنت' },
  seoDescription: {
    en: 'Make a secure Zakat or Sadaqa donation online. Support families in need with one-time or recurring donations through our trusted, PCI-compliant payment platform.',
    ar: 'أدِّ زكاتك أو صدقتك عبر الإنترنت بأمان، وادعم الأسر المحتاجة بتبرع لمرة واحدة أو تبرع دوري عبر منصة دفع موثوقة متوافقة مع معيار PCI.',
  },
  title: { en: 'Make a Donation', ar: 'قدّم تبرعك' },
  lead: {
    en: 'Choose an amount and a cause. Payment is handled securely by Stripe.',
    ar: 'اختر المبلغ ووجهة تبرعك. تتم معالجة الدفع بأمان عبر Stripe.',
  },

  // Toasts
  paymentLoadingTitle: { en: 'Payment system loading', ar: 'نظام الدفع قيد التحميل' },
  paymentLoadingBody: { en: 'Please wait a moment and try again.', ar: 'يُرجى الانتظار قليلًا ثم المحاولة مرة أخرى.' },
  invalidAmountTitle: { en: 'Invalid amount', ar: 'مبلغ غير صالح' },
  invalidAmountBody: {
    en: 'Please enter a donation amount of at least $1.',
    ar: 'يُرجى إدخال مبلغ تبرع لا يقل عن دولار واحد.',
  },
  redirectFailedTitle: { en: 'Payment redirect failed', ar: 'تعذّر الانتقال إلى صفحة الدفع' },
  redirectFailedBody: {
    en: 'Could not redirect to payment page. Please try again.',
    ar: 'تعذّر تحويلك إلى صفحة الدفع. يُرجى المحاولة مرة أخرى.',
  },
  paymentFailedTitle: { en: 'Payment failed', ar: 'تعذّر إتمام الدفع' },
  paymentFailedBody: {
    en: 'Something went wrong. Please try again or contact us at info@myzakat.org.',
    ar: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى أو التواصل معنا على info@myzakat.org.',
  },
  nameRequiredTitle: { en: 'Name required', ar: 'الاسم مطلوب' },
  nameRequiredBody: { en: 'Please enter your full name.', ar: 'يُرجى إدخال اسمك الكامل.' },
  emailRequiredTitle: { en: 'Email required', ar: 'البريد الإلكتروني مطلوب' },
  emailRequiredBody: { en: 'Please enter a valid email address.', ar: 'يُرجى إدخال بريد إلكتروني صحيح.' },
  amountRequiredTitle: { en: 'Amount required', ar: 'المبلغ مطلوب' },
  amountRequiredBody: {
    en: 'Please select or enter a donation amount of at least $1.',
    ar: 'يُرجى اختيار مبلغ التبرع أو إدخاله، على ألا يقل عن دولار واحد.',
  },

  // Amount
  amount: { en: 'Donation Amount', ar: 'مبلغ التبرع' },
  customAmount: { en: 'Enter custom amount', ar: 'أدخل مبلغًا آخر' },
  amountMissing: { en: 'Please enter an amount', ar: 'يُرجى إدخال المبلغ' },
  amountMin: { en: 'Minimum donation is $1', ar: 'الحد الأدنى للتبرع دولار واحد' },
  amountInvalid: { en: 'Please enter a valid amount', ar: 'يُرجى إدخال مبلغ صحيح' },

  // Purpose
  purpose: { en: 'Purpose', ar: 'وجهة التبرع' },

  // Frequency
  recurringTitle: { en: 'Recurring Payment', ar: 'تبرع دوري' },
  scheduleLabel: { en: 'Payment Schedule:', ar: 'موعد الدفعات:' },
  scheduleMonthly: {
    en: "Your first payment will be processed immediately. Future payments will occur monthly from today's date.",
    ar: 'ستُخصم دفعتك الأولى فورًا، ثم تُخصم الدفعات التالية شهريًا ابتداءً من تاريخ اليوم.',
  },
  scheduleAnnually: {
    en: "Your first payment will be processed immediately. Future payments will occur annually from today's date.",
    ar: 'ستُخصم دفعتك الأولى فورًا، ثم تُخصم الدفعات التالية سنويًا ابتداءً من تاريخ اليوم.',
  },

  // Donor
  fullName: { en: 'Full Name *', ar: 'الاسم الكامل *' },
  fullNameMissing: { en: 'Please enter your full name', ar: 'يُرجى إدخال اسمك الكامل' },
  fullNamePlaceholder: { en: 'Enter your full name', ar: 'أدخل اسمك الكامل' },
  email: { en: 'Email Address *', ar: 'البريد الإلكتروني *' },
  emailMissing: { en: 'Please enter your email address', ar: 'يُرجى إدخال بريدك الإلكتروني' },
  emailInvalid: { en: 'Please enter a valid email address', ar: 'يُرجى إدخال بريد إلكتروني صحيح' },
  emailPlaceholder: { en: 'Enter your email', ar: 'أدخل بريدك الإلكتروني' },

  // Submit
  processing: { en: 'Processing...', ar: 'جارٍ المعالجة...' },
  setUpRecurring: { en: 'Set up Recurring Donation', ar: 'إعداد التبرع الدوري' },
  proceed: { en: 'Proceed to Payment', ar: 'المتابعة إلى الدفع' },

  // Sidebar
  impactTitle: { en: 'Your Impact', ar: 'أثر تبرعك' },
  meals: { en: 'Meals provided:', ar: 'الوجبات المقدَّمة:' },
  families: { en: 'Families helped:', ar: 'الأسر المستفيدة:' },
  children: { en: 'Children supported:', ar: 'الأطفال المدعومون:' },
  estimates: {
    en: 'Rough estimates: {meal} a meal, {child} a child, {family} a family.',
    ar: 'تقديرات تقريبية: {meal} للوجبة، و{child} للطفل، و{family} للأسرة.',
  },
  secureTitle: { en: 'Secure & Trusted', ar: 'آمن وموثوق' },
  ssl: { en: '256-bit SSL encryption', ar: 'تشفير SSL بقوة 256 بت' },
  pci: { en: 'PCI DSS compliant', ar: 'متوافق مع معيار PCI DSS' },
  receipt: { en: 'Receipt by email', ar: 'إيصال عبر البريد الإلكتروني' },
  recentTitle: { en: 'Recent Donations', ar: 'أحدث التبرعات' },

  // Purposes (the English name is the value sent to Stripe and stored)
  generalDonation: { en: 'General Donation', ar: 'تبرع عام' },
  zakat: { en: 'Zakat', ar: 'زكاة' },
  emergencyRelief: { en: 'Emergency Relief', ar: 'إغاثة عاجلة' },
  supportFamily: { en: 'Support a Family', ar: 'دعم أسرة' },
  orphanCare: { en: 'Orphan Care', ar: 'رعاية الأيتام' },
  foodWater: { en: 'Food & Water Aid', ar: 'الغذاء والماء' },
  education: { en: 'Education', ar: 'التعليم' },
  healthcare: { en: 'Healthcare', ar: 'الرعاية الصحية' },
})

/** Labels for the standard purposes; a campaign purpose from the URL is shown as given. */
const PURPOSE_LABELS: Record<string, Message> = Object.fromEntries(
  [M.generalDonation, M.zakat, M.emergencyRelief, M.supportFamily, M.orphanCare, M.foodWater, M.education, M.healthcare]
    .map((m) => [m.en, m]),
)

/** The radio value stays English (it drives the Stripe interval); only the label is translated. */
const FREQUENCY_LABELS: Record<string, Message> = {
  'One-Time': C.oneTime,
  Monthly: C.monthly,
  Annually: C.annually,
}

interface DonationForm {
  name: string
  email: string
  amount: number
  frequency: string
  purpose: string
}

const Donate = () => {
  const [searchParams] = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const { showError } = useToast()
  const t = useT()
  const locale = useLocale()
  const { money } = useFormat()

  // Recent donations (real, privacy-masked, sorted by amount)
  const [recentDonations, setRecentDonations] = useState<{ name: string; amount: number }[]>([])

  useEffect(() => {
    donationsAPI
      .getRecentPublic(5)
      .then(setRecentDonations)
      .catch(() => setRecentDonations([]))
  }, [])

  // Get amount from URL params (supports both 'amount' and 'zakat_amount' for backward compatibility)
  const urlAmount = searchParams.get('amount') || searchParams.get('zakat_amount')
  const urlFrequency = searchParams.get('frequency')
  const urlPurpose = searchParams.get('purpose')

  // Marketing attribution — captured from inbound campaign links so we can
  // forward them through Stripe and credit the originating campaign on the
  // donation webhook. Read once on mount and persist in sessionStorage so
  // they survive form re-submits and back/forward navigation.
  const getAttribution = () => {
    const fromUrl = (k: string) => searchParams.get(k) || ''
    const stored = (() => {
      try { return JSON.parse(sessionStorage.getItem('myzakat_attribution') || '{}') }
      catch { return {} as Record<string, string> }
    })()
    const merged = {
      utm_source: fromUrl('utm_source') || stored.utm_source || '',
      utm_medium: fromUrl('utm_medium') || stored.utm_medium || '',
      utm_campaign: fromUrl('utm_campaign') || stored.utm_campaign || '',
      utm_content: fromUrl('utm_content') || stored.utm_content || '',
    }
    if (merged.utm_source || merged.utm_campaign) {
      try { sessionStorage.setItem('myzakat_attribution', JSON.stringify(merged)) } catch { /* ignore */ }
    }
    return merged
  }
  const attribution = getAttribution()

  const [selectedAmount, setSelectedAmount] = useState<number | null>(
    urlAmount ? parseFloat(urlAmount) : null
  )


  const stripe = useStripe()
  const elements = useElements()

  const initialPurpose = urlPurpose && urlPurpose.trim()
    ? urlPurpose.trim()
    : (searchParams.get('zakat_amount') ? 'Zakat' : 'General Donation')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<DonationForm>({
    defaultValues: {
      name: '',
      email: '',
      amount: selectedAmount || 0,
      frequency: urlFrequency || 'One-Time',
      purpose: initialPurpose
    }
  })

  // Pre-fill amount, frequency, and purpose from URL params
  useEffect(() => {
    if (urlAmount) {
      const amount = parseFloat(urlAmount)
      if (!isNaN(amount) && amount > 0) {
        setValue('amount', amount)
        setSelectedAmount(amount)
      }
    }
    if (urlFrequency && ['One-Time', 'Monthly', 'Annually'].includes(urlFrequency)) {
      setValue('frequency', urlFrequency)
    }
    if (urlPurpose && urlPurpose.trim()) {
      setValue('purpose', urlPurpose.trim())
    }
  }, [urlAmount, urlFrequency, urlPurpose, setValue])

  // Pre-fill form with user data if logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.name) {
        setValue('name', user.name)
      }
      if (user.email) {
        setValue('email', user.email)
      }
    }
  }, [isAuthenticated, user, setValue])

  // Scroll to top when page loads (especially when coming from sticky bar)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const watchedAmount = watch('amount')

  const quickAmounts = [25, 50, 100, 250, 500, 1000]
  const basePurposes = [
    'General Donation',
    'Zakat',
    'Emergency Relief',
    'Support a Family',
    'Orphan Care',
    'Food & Water Aid',
    'Education',
    'Healthcare'
  ]
  // Include the campaign / URL-provided purpose at the top if it isn't a standard option
  const watchedPurpose = watch('purpose')
  const purposes = watchedPurpose && !basePurposes.includes(watchedPurpose)
    ? [watchedPurpose, ...basePurposes]
    : basePurposes

  const onSubmit = async (data: DonationForm) => {
    if (!stripe || !elements) {
      showError(t(M.paymentLoadingTitle), t(M.paymentLoadingBody))
      return
    }

    if (!data.amount || data.amount < 1) {
      showError(t(M.invalidAmountTitle), t(M.invalidAmountBody))
      return
    }

    // Marketing attribution: forward UTMs captured from the inbound campaign
    // link through Stripe metadata so the webhook can credit the campaign.
    const attributionPayload = {
      utm_source: attribution.utm_source || undefined,
      utm_medium: attribution.utm_medium || undefined,
      utm_campaign: attribution.utm_campaign || undefined,
      utm_content: attribution.utm_content || undefined,
    }

    setIsProcessing(true)
    try {
      if (data.frequency === 'Monthly' || data.frequency === 'Annually') {
        // Create subscription
        const session = await donationsAPI.createSubscription({
          amount: data.amount,
          name: data.name,
          email: data.email,
          purpose: data.purpose,
          interval: data.frequency === 'Monthly' ? 'month' : 'year',
          payment_day: 1,  // Default to 1st of month
          payment_month: undefined,  // Not used anymore
          ...attributionPayload,
        })

        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({
          sessionId: session.id
        })

        if (error) {
          showError(t(M.redirectFailedTitle), error.message || t(M.redirectFailedBody))
        }
      } else {
        // Create one-time payment session
        const session = await donationsAPI.createPaymentSession({
          amount: data.amount,
          name: data.name,
          email: data.email,
          purpose: data.purpose,
          frequency: data.frequency,
          ...attributionPayload,
        })

        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({
          sessionId: session.id
        })

        if (error) {
          showError(t(M.redirectFailedTitle), error.message || t(M.redirectFailedBody))
        }
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        t(M.paymentFailedBody)
      showError(t(M.paymentFailedTitle), message)
    } finally {
      setIsProcessing(false)
    }
  }

  // Show validation errors via toast when form submit is blocked
  const onFormError = () => {
    if (errors.name) {
      showError(t(M.nameRequiredTitle), t(M.nameRequiredBody))
    } else if (errors.email) {
      showError(t(M.emailRequiredTitle), t(M.emailRequiredBody))
    } else if (errors.amount) {
      showError(t(M.amountRequiredTitle), t(M.amountRequiredBody))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={t(M.seoTitle)}
        description={t(M.seoDescription)}
        canonicalPath="/donate"
      />
      <PageHeader
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Donation Form */}
          <div className="lg:col-span-2">
            <div className="card sm:p-8">
              <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6">
                {/* Amount Selection */}
                <div>
                  <label htmlFor="donate-amount" className="block text-lg font-semibold text-gray-900 mb-3">
                    {t(M.amount)}
                  </label>

                  {/* Quick Amount Buttons */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        data-testid={`donate-amount-${amount}`}
                        aria-pressed={selectedAmount === amount}
                        onClick={() => {
                          setSelectedAmount(amount)
                          setValue('amount', amount, { shouldValidate: true })
                        }}
                        className={`min-h-[44px] py-2.5 px-3 rounded-lg border font-semibold transition-colors ${
                          selectedAmount === amount
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300'
                        }`}
                      >
                        {locale === 'ar' ? money(amount * 100) : `$${amount}`}
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount */}
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-lg">$</span>
                    </div>
                    <input
                      id="donate-amount"
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder={t(M.customAmount)}
                      data-testid="donate-amount-input"
                      {...register('amount', { required: t(M.amountMissing), min: { value: 1, message: t(M.amountMin) }, valueAsNumber: true })}
                      className={`input-field ps-8 text-lg ${errors.amount ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value)
                        setSelectedAmount(isNaN(value) ? null : value)
                      }}
                    />
                  </div>
                  {errors.amount && (
                    <p className="field-error">
                      <AlertCircle className="w-4 h-4" aria-hidden="true" />
                      {errors.amount.message || t(M.amountInvalid)}
                    </p>
                  )}
                </div>

                {/* Purpose */}
                <div>
                  <label htmlFor="donate-purpose" className="block text-lg font-semibold text-gray-900 mb-2">
                    {t(M.purpose)}
                  </label>
                  <select
                    id="donate-purpose"
                    data-testid="donate-purpose"
                    {...register('purpose')}
                    className="input-field"
                  >
                    {purposes.map((purpose) => (
                      <option key={purpose} value={purpose}>
                        {PURPOSE_LABELS[purpose] ? t(PURPOSE_LABELS[purpose]) : purpose}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Frequency */}
                <fieldset>
                  <legend className="block text-lg font-semibold text-gray-900 mb-2">
                    {t(C.frequency)}
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['One-Time', 'Monthly', 'Annually'].map((freq) => (
                      <label
                        key={freq}
                        className="flex items-center min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white cursor-pointer hover:border-primary-300 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50"
                      >
                        <input
                          type="radio"
                          value={freq}
                          data-testid={`donate-freq-${freq.toLowerCase()}`}
                          {...register('frequency')}
                          className="me-3 text-primary-600"
                        />
                        <span className="text-gray-700">{t(FREQUENCY_LABELS[freq])}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Payment Schedule - Show only for recurring payments */}
                {(watch('frequency') === 'Monthly' || watch('frequency') === 'Annually') && (
                  <div className="alert-info block">
                    <h4 className="font-semibold mb-1">{t(M.recurringTitle)}</h4>
                    <p>
                      <strong>{t(M.scheduleLabel)}</strong> {t(watch('frequency') === 'Monthly' ? M.scheduleMonthly : M.scheduleAnnually)}
                    </p>
                  </div>
                )}

                {/* Personal Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="donate-name" className="label">
                      {t(M.fullName)}
                    </label>
                    <input
                      id="donate-name"
                      type="text"
                      data-testid="donate-name"
                      autoComplete="name"
                      {...register('name', { required: t(M.fullNameMissing) })}
                      className={`input-field ${errors.name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
                      placeholder={t(M.fullNamePlaceholder)}
                    />
                    {errors.name && (
                      <p className="field-error">
                        <AlertCircle className="w-4 h-4" aria-hidden="true" />
                        {errors.name.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="donate-email" className="label">
                      {t(M.email)}
                    </label>
                    <input
                      id="donate-email"
                      type="email"
                      data-testid="donate-email"
                      autoComplete="email"
                      {...register('email', {
                        required: t(M.emailMissing),
                        pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t(M.emailInvalid) }
                      })}
                      className={`input-field ${errors.email ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
                      placeholder={t(M.emailPlaceholder)}
                    />
                    {errors.email && (
                      <p className="field-error">
                        <AlertCircle className="w-4 h-4" aria-hidden="true" />
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  data-testid="donate-submit"
                  disabled={isProcessing}
                  className="btn-primary btn-lg w-full gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      {t(M.processing)}
                    </>
                  ) : (
                    watch('frequency') === 'Monthly' || watch('frequency') === 'Annually'
                      ? t(M.setUpRecurring)
                      : t(M.proceed)
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Impact Preview */}
            {watchedAmount > 0 && (
              <div className="card-tinted">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t(M.impactTitle)}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t(M.meals)}</span>
                    <span className="font-semibold text-gray-900">{Math.floor(watchedAmount / 5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t(M.families)}</span>
                    <span className="font-semibold text-gray-900">{Math.floor(watchedAmount / 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t(M.children)}</span>
                    <span className="font-semibold text-gray-900">{Math.floor(watchedAmount / 50)}</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-gray-600">
                  {t(M.estimates, { meal: money(500), child: money(5000), family: money(10000) })}
                </p>
              </div>
            )}

            {/* Security & Trust. Only claims we can stand behind: no
                "100% transparent usage", and the receipt is an email receipt. */}
            <div className="card">
              <div className="flex items-center mb-3">
                <ShieldCheck className="w-5 h-5 text-accent-700 me-2" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900">{t(M.secureTitle)}</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-accent-600 me-2 shrink-0" aria-hidden="true" />
                  {t(M.ssl)}
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-accent-600 me-2 shrink-0" aria-hidden="true" />
                  {t(M.pci)}
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-accent-600 me-2 shrink-0" aria-hidden="true" />
                  {t(M.receipt)}
                </li>
              </ul>
            </div>

            {/* Recent Donations */}
            {recentDonations.length > 0 && (
              <div className="card">
                <h3 className="text-base font-semibold text-gray-900 mb-3">{t(M.recentTitle)}</h3>
                <ul className="space-y-2 text-sm">
                  {recentDonations.map((donation, index) => (
                    <li key={index} className="flex justify-between items-center">
                      <span className="text-gray-600">{donation.name}</span>
                      <span className="font-semibold text-gray-900">
                        {locale === 'ar'
                          ? money(Math.round(donation.amount) * 100)
                          : `$${donation.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Donate
