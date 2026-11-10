import { Link } from 'react-router-dom'
import { BadgeCheck, Home, MapPin, User } from 'lucide-react'
import { clsx } from 'clsx'
import { defineMessages, useFormat, usePick, useT } from '../../i18n'
import { assetUrl, type Coverage, type PublicCard } from '../../utils/sponsorshipApi'
import { FUNDING_LABELS, GENDER_LABELS } from './labels'
import { useCounts } from './useCounts'

export const CARD_MESSAGES = defineMessages({
  perMonth: { en: '{amount}/month', ar: '{amount} شهريًا' },
  stillNeeded: { en: '{amount} still needed each month', ar: 'ما زال مطلوبًا {amount} شهريًا' },
  covered: { en: '{percent}% covered', ar: 'تمت تغطية {percent}%' },
  waitingSince: { en: 'Listed {when}', ar: 'معروض {when}' },
  verified: { en: 'Verified', ar: 'موثّق' },
  view: { en: 'Read {name}’s story', ar: 'اقرأ قصة {name}' },
})

/** Monthly need, coverage and its bar. The bar's label carries the numbers, so the colour is never the only signal. */
export const CoverageBar = ({ coverage, need, className }: { coverage: Coverage; need: number; className?: string }) => {
  const t = useT()
  const { money } = useFormat()
  const label = coverage.state === 'full'
    ? t(FUNDING_LABELS.full)
    : t(CARD_MESSAGES.stillNeeded, { amount: money(coverage.remaining_cents) })
  return (
    <div className={className}>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={coverage.percent}
        aria-label={t(CARD_MESSAGES.covered, { percent: coverage.percent })}
      >
        <div
          className={clsx('h-full rounded-full transition-all', coverage.state === 'full' ? 'bg-accent-600' : 'bg-accent-500')}
          style={{ width: `${Math.max(coverage.percent, coverage.percent > 0 ? 4 : 0)}%` }}
        />
      </div>
      <p className={clsx('mt-1.5 text-sm', coverage.state === 'full' ? 'font-semibold text-accent-700' : 'text-gray-600')}>
        {label}
        {need > 0 && coverage.state === 'partial' && (
          <span className="text-gray-500"> · {t(CARD_MESSAGES.perMonth, { amount: money(need) })}</span>
        )}
      </p>
    </div>
  )
}

/** Initials avatar used when no photo was published — most profiles, by design. */
export const ProfileAvatar = ({ card, size = 'md' }: { card: Pick<PublicCard, 'kind' | 'display_name' | 'photo_url'>; size?: 'md' | 'lg' }) => {
  const photo = assetUrl(card.photo_url)
  const dims = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-14 w-14 text-xl'
  if (photo) {
    return <img src={photo} alt="" className={clsx(dims, 'flex-shrink-0 rounded-2xl object-cover')} loading="lazy" />
  }
  const Icon = card.kind === 'family' ? Home : User
  const initial = (card.display_name || '').trim().charAt(0)
  return (
    <div
      aria-hidden="true"
      className={clsx(dims, 'flex flex-shrink-0 items-center justify-center rounded-2xl font-heading font-bold',
        card.kind === 'family' ? 'bg-primary-50 text-primary-700' : 'bg-accent-50 text-accent-700')}
    >
      {initial || <Icon className="h-1/2 w-1/2" />}
    </div>
  )
}

const CaseCard = ({ card }: { card: PublicCard }) => {
  const t = useT()
  const pick = usePick()
  const { relativeDays } = useFormat()
  const counts = useCounts()
  const name = card.display_name || card.reference
  const title = pick(card.title, card.title_ar)
  const facts: string[] = []
  if (card.kind === 'orphan') {
    if (card.age != null) facts.push(counts.age(card.age))
    if (card.gender) facts.push(t(GENDER_LABELS[card.gender]))
  } else if (card.household_size) {
    facts.push(counts.household(card.household_size))
  }

  return (
    <article className="card-media">
      <div className="card-body gap-4">
        <div className="flex items-start gap-4">
          <ProfileAvatar card={card} />
          <div className="min-w-0 flex-1">
            <h3 className="card-title truncate">{name}</h3>
            {facts.length > 0 && <p className="text-sm text-gray-600">{facts.join(' · ')}</p>}
            <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-600">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{[card.region, card.country].filter(Boolean).join('، ')}</span>
            </p>
          </div>
          {card.verified_at && (
            <span className="badge-success flex-shrink-0" title={t(CARD_MESSAGES.verified)}>
              <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">{t(CARD_MESSAGES.verified)}</span>
            </span>
          )}
        </div>

        {title && <p className="line-clamp-2 text-gray-700">{title}</p>}

        <CoverageBar coverage={card.coverage} need={card.monthly_need_cents} className="mt-auto" />

        <div className="flex items-center justify-between gap-3">
          {card.waiting_since && (
            <span className="text-xs text-gray-500">{t(CARD_MESSAGES.waitingSince, { when: relativeDays(card.waiting_since) })}</span>
          )}
          <Link
            to={`/sponsor/${card.reference}`}
            className="btn-secondary btn-sm ms-auto"
            aria-label={t(CARD_MESSAGES.view, { name })}
          >
            {card.kind === 'orphan'
              ? t({ en: 'Sponsor', ar: 'اكفل' })
              : t({ en: 'Support', ar: 'ادعم' })}
          </Link>
        </div>
      </div>
    </article>
  )
}

export default CaseCard
