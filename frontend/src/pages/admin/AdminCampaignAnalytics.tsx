import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Mail, Eye, MousePointerClick, AlertTriangle, ShieldOff, RefreshCw, ExternalLink } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../contexts/ToastContext'

interface Analytics {
  campaign_id: number
  name: string
  status: string
  total_recipients: number
  queued: number
  sent: number
  suppressed: number
  failed: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  mpp_only_opens: number
  open_rate: number
  click_rate: number
  ctor: number
  bounce_rate: number
  top_urls: { url: string; clicks: number }[]
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-800',
  sending: 'bg-amber-100 text-amber-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-500',
}

const KpiCard = ({ label, value, secondary, accent }: { label: string; value: string | number; secondary?: string; accent?: string }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${accent || 'text-gray-900'}`}>{value}</p>
    {secondary && <p className="text-xs text-gray-500 mt-1">{secondary}</p>}
  </div>
)

const AdminCampaignAnalytics = () => {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const token = useAuthStore((s) => s.token)
  const { showError } = useToast()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const fetchAnalytics = async () => {
    if (!campaignId) return
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/marketing/campaigns/${campaignId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) setData(await resp.json())
      else showError('Error', 'Failed to load analytics')
    } catch {
      showError('Error', 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAnalytics() }, [campaignId])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/marketing-campaigns" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3 truncate">
              <BarChart3 className="w-6 h-6 text-pink-600 flex-shrink-0" />
              <span className="truncate">{data.name}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Campaign #{data.campaign_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[data.status] || 'bg-gray-100'}`}>
            {data.status}
          </span>
          <button
            onClick={fetchAnalytics}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Recipients" value={data.queued} secondary={`${data.total_recipients} total · ${data.suppressed} suppressed`} />
        <KpiCard
          label="Open rate"
          value={`${data.open_rate}%`}
          secondary={`${data.opened.toLocaleString()} engaged opens`}
          accent="text-blue-700"
        />
        <KpiCard
          label="Click rate"
          value={`${data.click_rate}%`}
          secondary={`${data.clicked.toLocaleString()} unique clicks`}
          accent="text-emerald-700"
        />
        <KpiCard
          label="Click-to-open"
          value={`${data.ctor}%`}
          secondary="of openers who clicked"
          accent="text-purple-700"
        />
      </div>

      {/* Engagement breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-gray-500" />
          Engagement breakdown
        </h2>
        <div className="space-y-3 text-sm">
          <Stat icon={<Mail className="w-4 h-4 text-gray-500" />} label="Queued" value={data.queued} />
          <Stat icon={<Eye className="w-4 h-4 text-blue-500" />} label="Engaged opens (excl. MPP)" value={data.opened} percent={data.queued > 0 ? data.open_rate : 0} />
          <Stat icon={<MousePointerClick className="w-4 h-4 text-emerald-500" />} label="Unique clicks" value={data.clicked} percent={data.queued > 0 ? data.click_rate : 0} />
          <Stat icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Bounced (hard)" value={data.bounced} percent={data.queued > 0 ? data.bounce_rate : 0} />
          <Stat icon={<ShieldOff className="w-4 h-4 text-red-700" />} label="Complaints" value={data.complained} />
          {data.mpp_only_opens > 0 && (
            <Stat icon={<Eye className="w-4 h-4 text-gray-400" />} label="MPP-only opens (excluded)" value={data.mpp_only_opens} muted />
          )}
        </div>
      </div>

      {/* Top URLs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-gray-500" />
          Top-clicked URLs
        </h2>
        {data.top_urls.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No clicks tracked yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.top_urls.map((u, i) => (
              <li key={i} className="flex items-center justify-between gap-4 text-sm">
                <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 truncate flex-1 min-w-0" title={u.url}>
                  {u.url}
                </a>
                <span className="text-xs font-semibold text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">{u.clicks} clicks</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500 italic">
        Apple Mail Privacy Protection pre-fetches images, which inflates raw open numbers. The "Engaged opens"
        figure excludes detected MPP fetches; the click-to-open ratio is the most reliable engagement signal.
      </p>
    </div>
  )
}

const Stat = ({ icon, label, value, percent, muted }: { icon: React.ReactNode; label: string; value: number; percent?: number; muted?: boolean }) => (
  <div className={`flex items-center justify-between ${muted ? 'opacity-60' : ''}`}>
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-gray-700">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-semibold text-gray-900">{value.toLocaleString()}</span>
      {percent !== undefined && <span className="text-xs text-gray-500 w-12 text-right">{percent}%</span>}
    </div>
  </div>
)

export default AdminCampaignAnalytics
