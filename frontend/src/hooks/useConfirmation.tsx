import { useState, useCallback } from 'react'
import ConfirmationModal from '../components/ConfirmationModal'

interface ConfirmationOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

interface PendingConfirmation extends ConfirmationOptions {
  resolve: (value: boolean) => void
}

export const useConfirmation = () => {
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)

  const confirm = useCallback((options: ConfirmationOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingConfirmation({
        ...options,
        resolve
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (pendingConfirmation) {
      pendingConfirmation.resolve(true)
      setPendingConfirmation(null)
    }
  }, [pendingConfirmation])

  const handleCancel = useCallback(() => {
    if (pendingConfirmation) {
      pendingConfirmation.resolve(false)
      setPendingConfirmation(null)
    }
  }, [pendingConfirmation])

  const ConfirmationDialog = () => {
    if (!pendingConfirmation) return null

    return (
      <ConfirmationModal
        isOpen={!!pendingConfirmation}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={pendingConfirmation.title}
        message={pendingConfirmation.message}
        confirmText={pendingConfirmation.confirmText}
        cancelText={pendingConfirmation.cancelText}
        variant={pendingConfirmation.variant}
        isLoading={false}
      />
    )
  }

  return { confirm, ConfirmationDialog }
}

