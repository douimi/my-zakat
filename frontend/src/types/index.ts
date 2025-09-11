export interface Donation {
  id: number
  name: string
  email: string
  amount: number
  frequency: string
  donated_at: string
}

export interface ContactSubmission {
  id: number
  name: string
  email: string
  message: string
  submitted_at: string
  resolved: boolean
}

export interface Event {
  id: number
  title: string
  description: string
  date: string
  location: string
  image?: string
  created_at: string
}

export interface Story {
  id: number
  title: string
  summary: string
  content: string
  image_filename?: string
  video_url?: string
  is_active: boolean
  is_featured: boolean
}

export interface Testimonial {
  id: number
  name: string
  country?: string
  image?: string
  text: string
  rating?: number
  video_url?: string
  category?: string
  created_at: string
  is_approved: boolean
}

export interface Volunteer {
  id: number
  name: string
  email: string
  interest: string
  submitted_at: string
}

export interface Subscription {
  id: number
  name?: string
  email: string
  phone?: string
  wants_email: boolean
  wants_sms: boolean
  subscribed_at: string
}

export interface Admin {
  id: number
  username: string
}

export interface ZakatCalculation {
  liabilities: number
  cash: number
  receivables: number
  stocks: number
  retirement: number
  gold_weight: number
  gold_price_per_gram: number
  silver_weight: number
  silver_price_per_gram: number
  business_goods: number
  agriculture_value: number
  investment_property: number
  other_valuables: number
  livestock: number
  other_assets: number
}

export interface ZakatResult {
  wealth: number
  gold: number
  silver: number
  business_goods: number
  agriculture: number
  total: number
}

export interface DonationStats {
  total_donations: number
  total_donors: number
  recent_donations: Donation[]
  impact: {
    meals: number
    families: number
    orphans: number
  }
}

export interface DashboardStats {
  donations: {
    total_amount: number
    total_donors: number
    top_donor: {
      name: string | null
      amount: number
    }
  }
  contacts: {
    total_messages: number
    pending: number
    resolved: number
  }
  volunteers: {
    total: number
    by_interest: Record<string, number>
  }
  content: {
    events: number
    stories: number
    active_stories: number
    pending_testimonials: number
    subscriptions: number
  }
}

export interface PaymentSession {
  id: string
}

export interface Setting {
  id: number
  key: string
  value: string
  description?: string
  updated_at: string
}
