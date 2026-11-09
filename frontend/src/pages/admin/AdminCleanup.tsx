import { useState } from 'react'
import { useMutation } from 'react-query'
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import axios from 'axios'
import { PageHeader, EmptyState, Collapsible } from '../../components/admin'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface CleanupResult {
  orphaned_count: number
  deleted_count: number
  summary: {
    gallery_items: number
    stories: number
    testimonials: number
    events: number
    programs: number
    program_categories: number
    slideshow_slides: number
  }
  orphaned_items: {
    gallery_items: Array<{ id: number; media_filename: string; type: string }>
    stories: Array<{ id: number; title: string; video_filename: string }>
    testimonials: Array<{ id: number; name: string; video_filename?: string; image?: string }>
    events: Array<{ id: number; title: string; image: string }>
    programs: Array<{ id: number; title: string; video_filename?: string; image_url?: string }>
    program_categories: Array<{ id: number; name: string; video_filename?: string; image_url?: string }>
    slideshow_slides: Array<{ id: number; title: string; image: string }>
  }
}

const AdminCleanup = () => {
  const [scanResult, setScanResult] = useState<CleanupResult | null>(null)
  const { showSuccess, showError } = useToast()
  const { confirm, ConfirmationDialog } = useConfirmation()

  const scanMutation = useMutation(
    async () => {
      const response = await api.post('/api/cleanup/orphaned-media', null, {
        params: { auto_delete: false }
      })
      return response.data as CleanupResult
    },
    {
      onSuccess: (data) => {
        setScanResult(data)
        if (data.orphaned_count > 0) {
          showSuccess('Scan Complete', `Found ${data.orphaned_count} orphaned media entries`)
        } else {
          showSuccess('Scan Complete', 'No orphaned media found')
        }
      },
      onError: (error: any) => {
        showError('Scan Failed', error?.response?.data?.detail || 'Failed to scan for orphaned media')
      }
    }
  )

  const cleanupMutation = useMutation(
    async () => {
      const response = await api.post('/api/cleanup/auto-cleanup')
      return response.data as CleanupResult
    },
    {
      onSuccess: (data) => {
        setScanResult(data)
        showSuccess('Cleanup Complete', `Deleted ${data.deleted_count} orphaned media entries`)
      },
      onError: (error: any) => {
        showError('Cleanup Failed', error?.response?.data?.detail || 'Failed to cleanup orphaned media')
      }
    }
  )

  const handleScan = () => {
    scanMutation.mutate()
  }

  const handleCleanup = async () => {
    const confirmed = await confirm({
      title: 'Delete Orphaned Media',
      message: `Are you sure you want to delete ${scanResult?.orphaned_count || 0} orphaned media entries? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      variant: 'danger'
    })
    if (confirmed) {
      cleanupMutation.mutate()
    }
  }

  // One folded list per content type, with the count in the title, so a big
  // scan result stays one screen tall until someone opens a group.
  const groups = scanResult
    ? [
        { label: 'Gallery items', lines: scanResult.orphaned_items.gallery_items.map((i) => ({ id: i.id, text: `${i.media_filename} (${i.type})` })) },
        { label: 'Stories', lines: scanResult.orphaned_items.stories.map((i) => ({ id: i.id, text: `${i.title} - ${i.video_filename}` })) },
        { label: 'Testimonials', lines: scanResult.orphaned_items.testimonials.map((i) => ({ id: i.id, text: `${i.name} - ${i.video_filename || i.image}` })) },
        { label: 'Events', lines: scanResult.orphaned_items.events.map((i) => ({ id: i.id, text: `${i.title} - ${i.image}` })) },
        { label: 'Programs', lines: scanResult.orphaned_items.programs.map((i) => ({ id: i.id, text: `${i.title} - ${i.video_filename || i.image_url}` })) },
        { label: 'Program categories', lines: scanResult.orphaned_items.program_categories.map((i) => ({ id: i.id, text: `${i.name} - ${i.video_filename || i.image_url}` })) },
        { label: 'Slideshow slides', lines: scanResult.orphaned_items.slideshow_slides.map((i) => ({ id: i.id, text: `${i.title} - ${i.image}` })) },
      ].filter((g) => g.lines.length > 0)
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cleanup"
        icon={Trash2}
        description="Find database entries whose media file no longer exists in S3."
        help={<p>Orphaned entries are normally cleaned up automatically when files are deleted from S3. Run a scan to catch any that were missed.</p>}
        actions={
          <>
            <button
              onClick={handleScan}
              disabled={scanMutation.isLoading}
              className="btn-primary gap-2"
            >
              {scanMutation.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Scan for orphaned media
                </>
              )}
            </button>
            {scanResult && scanResult.orphaned_count > 0 && (
              <button
                onClick={handleCleanup}
                disabled={cleanupMutation.isLoading}
                className="btn-danger gap-2"
              >
                {cleanupMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Delete all orphaned ({scanResult.orphaned_count})
                  </>
                )}
              </button>
            )}
          </>
        }
      />

      {!scanResult ? (
        <EmptyState icon={RefreshCw} title="No scan yet" body="Run a scan to check every media entry against S3." />
      ) : (
        <div className="space-y-4">
          {scanResult.orphaned_count > 0 ? (
            <div className="alert-warning">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Found {scanResult.orphaned_count} orphaned media entries</p>
                <p className="text-sm">These files were deleted from S3 but still exist in the database.</p>
              </div>
            </div>
          ) : (
            <div className="alert-success">
              <CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">No orphaned media found</p>
                <p className="text-sm">All media files in the database exist in S3.</p>
              </div>
            </div>
          )}

          {scanResult.deleted_count > 0 && (
            <div className="alert-success">
              <CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">Deleted {scanResult.deleted_count} orphaned entries</span>
            </div>
          )}

          {groups.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {groups.map((group) => (
                <Collapsible
                  key={group.label}
                  title={`${group.label} (${group.lines.length})`}
                  preview={group.lines.slice(0, 2).map((l) => l.text).join(' · ')}
                >
                  <ul className="space-y-1">
                    {group.lines.map((line) => (
                      <li key={line.id} className="text-sm text-gray-700 break-all">
                        <span className="font-medium">#{line.id}</span>: {line.text}
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmationDialog />
    </div>
  )
}

export default AdminCleanup
