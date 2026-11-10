import { AlertTriangle, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import type { StaffAction, StaffCase } from '../../../utils/sponsorshipApi'
import {
  ACTION_LABEL, DANGER_ACTIONS, PRIMARY_ACTIONS, STATUS_HINT, explainBlocker, plural, type CaseTab,
} from './format'

const TAB_NAME: Partial<Record<CaseTab, string>> = {
  documents: 'Documents', profile: 'Public profile', links: 'Links', dossier: 'Dossier', sponsorships: 'Sponsorships',
}

/**
 * Where the case stands and the one button that matters, above the tabs so
 * it is visible whatever tab is open. Blockers say what to fix and where.
 */
const NextStep = ({ case: c, onAction, goTo }: {
  case: StaffCase
  onAction: (a: StaffAction) => void
  goTo: (tab: CaseTab) => void
}) => {
  const blockers = c.status === 'submitted' || c.status === 'under_review' ? c.approval_blockers
    : c.status === 'approved' || c.status === 'paused' ? c.publish_blockers : []
  const blockedAction: StaffAction | null = c.status === 'approved' || c.status === 'paused' ? 'publish'
    : c.status === 'under_review' || c.status === 'submitted' ? 'approve' : null
  // The approve dialog sets the amount itself, so a missing amount does not block the button.
  const hardBlockers = blockers.filter((b) => !(blockedAction === 'approve' && b === 'no_monthly_amount'))

  const primary = PRIMARY_ACTIONS.find((a) => c.allowed_actions.includes(a)) ?? null
  const others = c.allowed_actions.filter((a) => a !== primary)
  const isBlocked = (a: StaffAction) => a === blockedAction && hardBlockers.length > 0

  return (
    <section aria-labelledby="next-step-title" className="bg-white rounded-lg border border-gray-200 px-4 sm:px-6 py-4 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <h2 id="next-step-title" className="text-sm font-semibold text-gray-900">Next step</h2>
          <p className="text-sm text-gray-700">{STATUS_HINT[c.status]}</p>
        </div>
        {c.allowed_actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
            {primary && (
              <button type="button" className="btn-primary btn-sm gap-1" onClick={() => onAction(primary)}
                disabled={isBlocked(primary)} aria-describedby={isBlocked(primary) ? 'case-blockers' : undefined}>
                {ACTION_LABEL[primary]} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {others.map((a) => (
              <button key={a} type="button" onClick={() => onAction(a)}
                disabled={isBlocked(a)} aria-describedby={isBlocked(a) ? 'case-blockers' : undefined}
                className={clsx('btn-sm', DANGER_ACTIONS.includes(a) ? 'btn-ghost text-red-700' : 'btn-secondary')}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        )}
      </div>

      {blockers.length > 0 && (
        <div id="case-blockers" className="alert-warning flex-col gap-1">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {blockedAction === 'publish' ? 'Before publishing' : 'Before approving'} · {plural(blockers.length, 'point')} to resolve
          </p>
          <ul className="space-y-0.5 pl-6 list-disc">
            {blockers.map((b) => {
              const { text, tab } = explainBlocker(b)
              return (
                <li key={b}>
                  {text}
                  {tab && TAB_NAME[tab] && (
                    <> <button type="button" className="link text-sm" onClick={() => goTo(tab)}>Go to {TAB_NAME[tab]}</button></>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

export default NextStep
