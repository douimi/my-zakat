import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
import { storiesAPI } from '../utils/api'
import { getOptimizedImageUrl, IMAGE_WIDTHS } from '../utils/mediaHelpers'
import type { Story } from '../types'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import { defineMessages, useT } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  pageTitle: { en: 'Stories of Impact', ar: 'قصص الأثر' },
  pageLead: {
    en: 'What your donations paid for, told by the families who received them.',
    ar: 'ما حققته تبرعاتكم، ترويه الأسر التي وصلتها.',
  },
  seoTitle: { en: 'Impact Stories', ar: 'قصص الأثر' },
  seoDescription: {
    en: 'Read real stories of how Zakat and Sadaqa donations have transformed lives. See the tangible impact of your charitable giving through MyZakat programs.',
    ar: 'اقرأ قصصًا حقيقية عن تبرعات الزكاة والصدقة التي غيّرت حياة أسر كثيرة، وشاهد الأثر الملموس لعطائك عبر برامج ماي زكاة.',
  },
  loading: { en: 'Loading stories', ar: 'جارٍ تحميل القصص' },
  loadError: { en: 'Error loading stories. Please try again later.', ar: 'تعذّر تحميل القصص. يُرجى المحاولة لاحقًا.' },
  featuredStories: { en: 'Featured Stories', ar: 'قصص مميزة' },
  moreStories: { en: 'More Stories', ar: 'مزيد من القصص' },
  allStories: { en: 'All Stories', ar: 'جميع القصص' },
  noStories: { en: 'No stories published yet.', ar: 'لم تُنشر أي قصة بعد.' },
  checkBack: { en: 'Check back soon.', ar: 'عُد إلينا قريبًا.' },
  featured: { en: 'Featured', ar: 'مميزة' },
  video: { en: 'Video', ar: 'فيديو' },
  readStory: { en: 'Read the story', ar: 'اقرأ القصة' },
})

const Stories = () => {
  const t = useT()
  const PAGE_TITLE = t(M.pageTitle)
  const PAGE_LEAD = t(M.pageLead)
  const { data: stories, isLoading, error } = useQuery('public-stories', () =>
    storiesAPI.getAll(true, false) // Get active stories, not just featured
  )

  const seo = (
    <SEOHead
      title={t(M.seoTitle)}
      description={t(M.seoDescription)}
      canonicalPath="/stories"
    />
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        {seo}
        <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />
        <div className="flex items-center justify-center py-20" role="status">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" aria-hidden="true" />
          <span className="sr-only">{t(M.loading)}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        {seo}
        <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />
        <div className="section-container section">
          <p className="alert-error" role="alert">{t(M.loadError)}</p>
        </div>
      </div>
    )
  }

  const featuredStories = stories?.filter((story: Story) => story.is_featured) || []
  const regularStories = stories?.filter((story: Story) => !story.is_featured) || []
  const hasStories = featuredStories.length + regularStories.length > 0

  return (
    <div className="min-h-screen bg-white">
      {seo}
      <PageHeader title={PAGE_TITLE} description={PAGE_LEAD} />

      <div className="section-container section space-y-14">
        {/* Featured stories: every one of them (a featured story is never repeated in "All stories"). */}
        {featuredStories.length > 0 && (
          <section aria-labelledby="featured-stories">
            <h2 id="featured-stories" className="section-title mb-8">{t(M.featuredStories)}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {featuredStories.map((story: Story) => (
                <StoryCard key={story.id} story={story} featured />
              ))}
            </div>
          </section>
        )}

        {regularStories.length > 0 && (
          <section aria-labelledby="all-stories">
            <h2 id="all-stories" className="section-title mb-8">
              {featuredStories.length > 0 ? t(M.moreStories) : t(M.allStories)}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {regularStories.map((story: Story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        )}

        {!hasStories && (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900">{t(M.noStories)}</h2>
            <p className="mt-2 text-gray-600">{t(M.checkBack)}</p>
          </div>
        )}

        {hasStories && (
          <div className="flex justify-center border-t border-gray-200 pt-10">
            <Link to="/donate" className="btn-primary gap-2">
              {t(C.donate)} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

interface StoryCardProps {
  story: Story
  featured?: boolean
}

const StoryCard = ({ story, featured = false }: StoryCardProps) => {
  const t = useT()
  const imageUrl = getOptimizedImageUrl(
    story.image_filename,
    featured ? IMAGE_WIDTHS.CARD : IMAGE_WIDTHS.THUMB,
    'stories',
  )

  return (
    <article className="card-media">
      {imageUrl && (
        <div className="aspect-video bg-gray-100 relative overflow-hidden">
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            crossOrigin={imageUrl.startsWith('http://') || imageUrl.startsWith('https://') ? 'anonymous' : undefined}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          {story.video_filename && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center" aria-hidden="true">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-primary-700 ms-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card-body">
        {(featured || story.video_filename) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {featured && <span className="badge-primary">{t(M.featured)}</span>}
            {story.video_filename && <span className="badge-neutral">{t(M.video)}</span>}
          </div>
        )}
        <h3 className={featured ? 'card-title text-xl sm:text-2xl' : 'card-title'}>{story.title}</h3>
        <p className={`mt-2 text-gray-600 ${featured ? '' : 'line-clamp-3'}`}>{story.summary}</p>
        <div className="mt-auto pt-5">
          <Link to={`/stories/${story.id}`} className="link inline-flex items-center gap-1">
            {t(M.readStory)} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">: {story.title}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

export default Stories
