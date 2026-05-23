import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowRight } from 'lucide-react'

interface Campaign {
  id: number
  title: string
  description?: string | null
  image_url?: string | null
  amount: number
  cta_text: string
  redirect_url?: string | null
  is_active: boolean
  updated_at: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// localStorage key — value is JSON: { id: number, dismissedAt: ISO string }
// Showing again on the next visit if updated_at is newer than dismissedAt
const STORAGE_KEY = 'myzakat_campaign_dismissed'

function shouldShowCampaign(campaign: Campaign): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const stored = JSON.parse(raw) as { id: number; dismissedAt: string }
    if (stored.id !== campaign.id) return true
    // If the campaign was edited after the user dismissed it, show again
    return new Date(campaign.updated_at).getTime() > new Date(stored.dismissedAt).getTime()
  } catch {
    return true
  }
}

const CampaignPopup = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/campaigns/active`)
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled || !data || !data.id) return
        if (shouldShowCampaign(data)) {
          setCampaign(data)
          // Small delay so the popup feels intentional, not jarring
          setTimeout(() => setVisible(true), 600)
        }
      } catch {
        /* silent — popup is non-critical */
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!campaign || !visible) return null

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ id: campaign.id, dismissedAt: new Date().toISOString() }),
      )
    } catch { /* ignore */ }
  }

  const handleCTA = () => {
    dismiss()
    if (campaign.redirect_url && campaign.redirect_url.trim()) {
      // External or custom redirect
      if (campaign.redirect_url.startsWith('http')) {
        window.location.href = campaign.redirect_url
      } else {
        navigate(campaign.redirect_url)
      }
      return
    }
    // Default: /donate with amount + purpose pre-filled
    const amountStr = campaign.amount > 0 ? `?amount=${campaign.amount.toFixed(2)}&purpose=${encodeURIComponent(campaign.title)}` : ''
    navigate(`/donate${amountStr}`)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-popup-title"
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image */}
        {campaign.image_url && (
          <div className="w-full h-48 sm:h-56 bg-gradient-to-br from-primary-500 to-blue-600 overflow-hidden">
            <img
              src={campaign.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          <h2
            id="campaign-popup-title"
            className="text-2xl font-heading font-bold text-gray-900 mb-3"
          >
            {campaign.title}
          </h2>
          {campaign.description && (
            <p className="text-gray-600 leading-relaxed mb-5 whitespace-pre-wrap">
              {campaign.description}
            </p>
          )}

          {campaign.amount > 0 && (
            <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg px-4 py-3 mb-5 text-center">
              <p className="text-xs uppercase tracking-wide text-primary-700 font-semibold mb-1">
                Suggested donation
              </p>
              <p className="text-3xl font-bold text-primary-700">
                ${campaign.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          )}

          <button
            onClick={handleCTA}
            className="w-full bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md flex items-center justify-center gap-2 transition-all"
          >
            {campaign.cta_text}
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={dismiss}
            className="w-full text-gray-500 hover:text-gray-700 text-sm mt-3"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

export default CampaignPopup
