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
        setCampaign(data)
        // Small delay so the popup feels intentional, not jarring
        setTimeout(() => setVisible(true), 600)
      } catch {
        /* silent — popup is non-critical */
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!campaign || !visible) return null

  const dismiss = () => setVisible(false)

  const handleCTA = () => {
    setVisible(false)
    if (campaign.redirect_url && campaign.redirect_url.trim()) {
      if (campaign.redirect_url.startsWith('http')) {
        window.location.href = campaign.redirect_url
      } else {
        navigate(campaign.redirect_url)
      }
      return
    }
    const amountStr = campaign.amount > 0
      ? `?amount=${campaign.amount.toFixed(2)}&purpose=${encodeURIComponent(campaign.title)}`
      : ''
    navigate(`/donate${amountStr}`)
  }

  const hasImage = !!(campaign.image_url && campaign.image_url.trim())

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-popup-title"
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — floating over the image */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white shadow-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image — the focal element. Clickable, never cropped. */}
        {hasImage && (
          <button
            type="button"
            onClick={handleCTA}
            className="block w-full bg-gray-50 cursor-pointer group focus:outline-none"
            aria-label={campaign.cta_text}
          >
            <img
              src={campaign.image_url!}
              alt={campaign.title}
              className="w-full max-h-[78vh] object-contain group-hover:opacity-95 transition-opacity"
            />
          </button>
        )}

        {/* Compact footer: only the CTA + optional title for accessibility */}
        <div className={`px-5 py-4 border-t border-gray-100 ${hasImage ? '' : 'pt-6'}`}>
          {/* Visually-hidden title when image carries the content; visible otherwise */}
          <h2
            id="campaign-popup-title"
            className={hasImage
              ? 'sr-only'
              : 'text-2xl font-heading font-bold text-gray-900 mb-3'}
          >
            {campaign.title}
          </h2>

          {/* When there is no image, fall back to text so the popup still works */}
          {!hasImage && campaign.description && (
            <p className="text-gray-600 leading-relaxed mb-5 whitespace-pre-wrap">
              {campaign.description}
            </p>
          )}

          <button
            onClick={handleCTA}
            className="w-full bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md flex items-center justify-center gap-2 transition-all"
          >
            {campaign.cta_text}
            {campaign.amount > 0 && (
              <span className="opacity-90">
                — ${campaign.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            )}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default CampaignPopup
