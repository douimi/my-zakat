/**
 * /nisab — the current zakat threshold, dated, with the method behind it.
 *
 * The page has two faces. When `hasUsableFigure` is true it leads with the
 * dollar figure and the date the price was taken. When it is false — a stale
 * price, or an unreachable endpoint — it prints no dollar amount anywhere on
 * the page, including in the worked example, and shows the method instead. A
 * wrong number carrying a date reads as authoritative; the absence of one at
 * least tells the truth.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Coins, Wallet, Wheat, Info } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import {
  fetchNisab,
  hasUsableFigure,
  formatNisabDate,
  formatUsd,
  type Nisab as NisabData,
} from '../utils/nisabApi'
import { currentYear, getBreadcrumbJsonLd, getFaqJsonLd } from '../utils/seo'
import { defineMessages, useFormat, useLocale, useT, LOCALES } from '../i18n'
import { C } from '../i18n/common'

const CARD = 'card sm:p-8'
const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const M = defineMessages({
  seoTitle: {
    en: 'Nisab {year} — Current Gold & Silver Threshold for Zakat',
    ar: 'النصاب {year}: نصاب الزكاة الحالي بالذهب والفضة',
  },
  seoDescription: {
    en: 'The nisab is the minimum wealth at which zakat becomes due. See the current gold and silver thresholds in USD, the date they were taken, and how they are worked out.',
    ar: 'النصاب هو الحدّ الأدنى من المال الذي تجب عنده الزكاة. اطّلع على نصاب الذهب والفضة الحالي بالدولار الأمريكي، وتاريخ احتسابه، وطريقة حسابه.',
  },
  eyebrow: { en: 'Zakat guide', ar: 'دليل الزكاة' },
  title: { en: 'Nisab: the threshold at which zakat becomes due', ar: 'النصاب: الحدّ الذي تجب عنده الزكاة' },
  lead: {
    en: 'The nisab is defined as the value of a fixed weight of gold or of silver, so it has no fixed dollar value — it moves with the metal markets.',
    ar: 'النصاب هو قيمة وزن محدد من الذهب أو من الفضة، فليس له مبلغ ثابت بالدولار، بل يتغير بتغيّر أسعار المعدنين.',
  },

  // Masses
  goldMass: { en: '{grams} g of gold', ar: '{grams} غرام من الذهب' },
  goldMassWords: { en: 'a set weight of gold', ar: 'وزن محدد من الذهب' },
  silverMass: { en: '{grams} g of silver', ar: '{grams} غرام من الفضة' },
  silverMassWords: { en: 'a set weight of silver', ar: 'وزن محدد من الفضة' },
  gramsWord: { en: '{grams} grams', ar: '{grams} غرام' },
  gramsWordWords: { en: 'a set weight', ar: 'وزن محدد' },

  // FAQ
  faq1Q: { en: 'What is the nisab for zakat?', ar: 'ما نصاب الزكاة؟' },
  faq1A: {
    en: 'Nisab is the minimum amount of wealth a Muslim must hold before zakat becomes due on it. If your qualifying wealth stays at or above that threshold for a full lunar year, zakat is due at 2.5% of it; below the threshold, nothing is owed. The threshold is not a fixed sum of money — it is defined as the value of a set weight of gold or of silver, so it moves with those markets.',
    ar: 'النصاب هو الحدّ الأدنى من المال الذي يجب أن يملكه المسلم حتى تجب عليه فيه الزكاة. فإذا بقي مالك الزكوي بالغًا هذا الحدّ أو زائدًا عليه حولًا قمريًا كاملًا، وجب فيه ربع العشر (2.5%)؛ وإن كان دونه فلا شيء عليك. وليس النصاب مبلغًا ثابتًا من المال، بل هو قيمة وزن محدد من الذهب أو من الفضة، فيتغير بتغيّر أسعارهما.',
  },
  faq2Q: { en: 'Is the nisab based on gold or silver?', ar: 'هل يُقدَّر النصاب بالذهب أم بالفضة؟' },
  faq2A: {
    en: 'Both are in use, and there is no single agreed answer on which one to apply. The silver threshold is much the lower of the two, so it brings more people into zakat and more wealth to those entitled to receive it, and many scholars prefer it for that reason. Others hold that gold is the sounder benchmark today, on the grounds that silver has lost a great deal of value against everyday goods since the two were set as equivalents. If you follow a particular school or teacher, follow their position.',
    ar: 'كلاهما معمول به، ولا يوجد قول واحد متفق عليه في أيّهما يُعتمد. فنصاب الفضة أدنى بكثير من نصاب الذهب، فيُدخل في الزكاة عددًا أكبر من الناس، ويوصل إلى مستحقيها مالًا أكثر، ولذلك يرجّحه كثير من العلماء. ويرى آخرون أن الذهب هو المعيار الأسلم في زماننا، لأن الفضة فقدت كثيرًا من قيمتها مقارنةً بالسلع اليومية منذ أن جُعل النصابان متكافئين. فإن كنت تتبع مذهبًا معيّنًا أو شيخًا بعينه، فاتبع قوله.',
  },
  faq3Q: { en: 'How much is the nisab in {year}?', ar: 'كم يبلغ النصاب في عام {year}؟' },
  faq3AFigure: {
    en: 'There is no fixed figure for the year: the nisab tracks the gold and silver markets, so it moves whenever they do. The current thresholds, together with the date the prices behind them were taken, are shown at the top of this page. We publish them only while the underlying price is recent enough for us to vouch for.',
    ar: 'ليس للنصاب رقم ثابت طوال العام، فهو يتبع أسعار الذهب والفضة ويتغير بتغيّرها. وتجد النصاب الحالي في أعلى هذه الصفحة، مع تاريخ الأسعار التي حُسب على أساسها. ولا ننشره إلا ما دام السعر الذي بُني عليه حديثًا بما يكفي لنطمئن إليه.',
  },
  faq3AMethod: {
    en: 'There is no fixed figure for the year: the nisab tracks the gold and silver markets, so it moves whenever they do. We are not showing a dollar amount right now because we do not hold a price recent enough to vouch for. To work it out yourself, multiply {goldMass} — or {silverMass} — by today’s price per gram.',
    ar: 'ليس للنصاب رقم ثابت طوال العام، فهو يتبع أسعار الذهب والفضة ويتغير بتغيّرها. ولا نعرض الآن مبلغًا بالدولار لأننا لا نملك سعرًا حديثًا بما يكفي لنطمئن إليه. ولتحسبه بنفسك، احسب قيمة {goldMass} — أو {silverMass} — بسعر الغرام اليوم.',
  },
  faq4Q: { en: 'Does the nisab change?', ar: 'هل يتغير النصاب؟' },
  faq4A: {
    en: 'Yes, continuously. Because it is defined as the value of a weight of metal rather than as a sum of money, it rises and falls with the gold and silver markets, and it can differ noticeably from one year to the next. That is why any threshold you read should carry the date it was taken, and why a figure from last year is not a safe substitute for today’s.',
    ar: 'نعم، باستمرار. فلأنه قيمة وزن من المعدن لا مبلغ من المال، فإنه يرتفع وينخفض مع أسعار الذهب والفضة، وقد يختلف اختلافًا ملحوظًا من عام إلى آخر. ولهذا ينبغي أن يكون كل نصاب تقرؤه مقرونًا بتاريخ احتسابه، ولا يصح الاعتماد على رقم العام الماضي بدلًا من رقم اليوم.',
  },
  faq5Q: { en: 'Do I pay zakat if I am just below the nisab?', ar: 'هل تجب عليّ الزكاة إن كان مالي دون النصاب بقليل؟' },
  faq5A: {
    en: 'No. Zakat is not due on wealth that stays below the threshold — that is what the threshold is for. Voluntary charity, sadaqa, remains open to you at any level of wealth and is encouraged. If you are close to the line it is worth noting that the silver threshold is the lower of the two, so which one you follow can change the answer.',
    ar: 'لا. لا تجب الزكاة في مال بقي دون النصاب، فهذه هي فائدة النصاب. أما الصدقة، وهي العطاء التطوعي، فبابها مفتوح لك مهما كان مالك، وهي مستحبة مرغَّب فيها. وإن كنت قريبًا من الحدّ فتنبّه إلى أن نصاب الفضة هو الأدنى من النصابين، فقد يتغير الجواب بحسب النصاب الذي تأخذ به.',
  },
  faq6Q: { en: 'Does the nisab apply per person or per household?', ar: 'هل يُعتبر النصاب لكل فرد أم لكل أسرة؟' },
  faq6A: {
    en: 'Zakat is assessed per person, on the wealth that each individual owns, rather than on a household total. A husband and wife would each measure their own qualifying wealth against the nisab separately instead of pooling it, and jointly owned assets are generally counted by each owner’s share. Where finances are genuinely intermingled the picture is less clear-cut, so ask a scholar how to divide them.',
    ar: 'تُحسب الزكاة على كل فرد في المال الذي يملكه، لا على مجموع أموال الأسرة. فيقيس كلٌّ من الزوج والزوجة ماله الزكوي على النصاب منفردًا دون ضمّه إلى مال الآخر، والأموال المشتركة تُحسب في الغالب بحصة كل مالك منها. وحيث تكون الأموال متداخلة فعلًا يكون الأمر أقل وضوحًا، فاسأل أهل العلم عن كيفية قسمتها.',
  },

  // 1. The figure
  currentThreshold: { en: 'The current threshold', ar: 'النصاب الحالي' },
  checking: { en: 'Checking the latest gold and silver prices…', ar: 'جارٍ التحقق من أحدث أسعار الذهب والفضة…' },
  goldNisab: { en: 'Gold nisab', ar: 'نصاب الذهب' },
  silverNisab: { en: 'Silver nisab', ar: 'نصاب الفضة' },
  asOf: { en: 'as of {date}', ar: 'بتاريخ {date}' },
  source: { en: ' · source: {source}', ar: ' · المصدر: {source}' },
  noFigure: {
    en: 'We show the threshold in dollars only when we have a price we can vouch for. Right now we do not, so here is the method instead — work it out against today’s gold or silver price.',
    ar: 'لا نعرض النصاب بالدولار إلا حين يكون لدينا سعر موثوق. وليس لدينا ذلك الآن، فإليك طريقة الحساب بدلًا منه: احسبه بسعر الذهب أو الفضة اليوم.',
  },

  // 2. What it is
  whatTitle: { en: 'What the nisab is', ar: 'ما النصاب' },
  whatBody: {
    en: 'Nisab is the minimum amount of wealth a Muslim must hold, for a full lunar year, before zakat becomes due on it. Below the nisab, no zakat is owed. At or above it, zakat is due at 2.5% of the qualifying wealth.',
    ar: 'النصاب هو الحدّ الأدنى من المال الذي يجب أن يملكه المسلم حولًا قمريًا كاملًا حتى تجب فيه الزكاة. فما كان دون النصاب فلا زكاة فيه، وما بلغه أو زاد عليه وجب فيه ربع العشر (2.5%) من المال الزكوي.',
  },

  // 3-5. Method, gold or silver, worked example
  methodTitle: { en: 'How it is worked out', ar: 'طريقة حسابه' },
  methodSummary: {
    en: 'The weights behind the figure, and the other convention in use',
    ar: 'الأوزان التي يقوم عليها الرقم، والتقدير الآخر المعمول به',
  },
  methodP1: {
    en: 'We use {gold} of gold and {silver} of silver — the same threshold our zakat calculator measures against. Multiply the weight by today’s price per gram and you have the threshold in your own currency.',
    ar: 'نعتمد نصابًا قدره {gold} من الذهب أو {silver} من الفضة، وهو النصاب نفسه الذي تقيس عليه حاسبة الزكاة لدينا. اضرب الوزن في سعر الغرام اليوم تحصل على النصاب بعملتك.',
  },
  methodP2: {
    en: 'These weights are the Hanafi conversion of 20 mithqal of gold and 200 dirhams of silver. Another common convention rounds the same measures to 85 grams and 595 grams. The difference is small, but it is real.',
    ar: 'وهذه الأوزان هي تقدير الحنفية لعشرين مثقالًا من الذهب ومئتي درهم من الفضة. وثمة تقدير آخر شائع يقرّب المقدارين نفسيهما إلى 85 غرامًا و595 غرامًا. والفرق بينهما يسير، لكنه حقيقي.',
  },
  goldOrSilverTitle: { en: 'Gold or silver?', ar: 'الذهب أم الفضة؟' },
  goldOrSilverSummary: {
    en: 'The silver threshold is the lower one; follow your school',
    ar: 'نصاب الفضة هو الأدنى؛ اتبع مذهبك',
  },
  goldOrSilverP1: {
    en: 'Scholars differ on which threshold to use. The silver nisab is far lower, so it brings more people into zakat and more wealth to those entitled to it; many scholars prefer it for that reason. Others hold that gold is the sounder benchmark today, on the grounds that silver’s value relative to everyday goods has fallen a long way since the two thresholds were set as equivalents.',
    ar: 'اختلف العلماء في النصاب الذي يُعتمد. فنصاب الفضة أدنى بكثير، فيُدخل في الزكاة عددًا أكبر من الناس، ويوصل إلى مستحقيها مالًا أكثر، ولذلك يرجّحه كثير من العلماء. ويرى آخرون أن الذهب هو المعيار الأسلم في زماننا، لأن قيمة الفضة مقارنةً بالسلع اليومية تراجعت كثيرًا منذ أن جُعل النصابان متكافئين.',
  },
  goldOrSilverP2: {
    en: 'If you follow a particular school or teacher, follow their position.',
    ar: 'فإن كنت تتبع مذهبًا معيّنًا أو شيخًا بعينه، فاتبع قوله.',
  },
  exampleTitle: { en: 'A worked example', ar: 'مثال تطبيقي' },
  exampleSummary: {
    en: '$4,000 in savings, held for a lunar year',
    ar: 'مدخرات قدرها {savings} حال عليها حول قمري',
  },
  exampleNote: {
    en: 'Illustrative only. The round numbers below are invented to show the arithmetic — they are not market data. Use the dated figures at the top of this page.',
    ar: 'للتوضيح فقط. الأرقام أدناه مفترضة لبيان طريقة الحساب، وليست أسعارًا من السوق. اعتمد الأرقام المؤرّخة في أعلى هذه الصفحة.',
  },
  exampleBody: {
    en: 'Suppose the silver nisab works out at $640 and you hold $4,000 in savings that you have had for a full lunar year. $4,000 is above $640, so zakat is due: 2.5% of $4,000 is $100.',
    ar: 'لنفترض أن نصاب الفضة يبلغ {nisab}، وأن لديك مدخرات قدرها {savings} مضى عليها حول قمري كامل. ولأن {savings} أعلى من {nisab} فالزكاة واجبة: وربع العشر (2.5%) من {savings} يساوي {due}.',
  },

  // 6-8
  faqTitle: { en: 'Common questions', ar: 'أسئلة شائعة' },
  disclaimer: {
    en: 'This page is general guidance, not a religious ruling. Zakat depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.',
    ar: 'هذه الصفحة إرشاد عام، وليست فتوى شرعية. فالزكاة تختلف باختلاف الأحوال، وفي كل ما يخصّ حالتك تحديدًا يُرجى سؤال عالم مؤهَّل.',
  },
  workOutTitle: { en: 'Work out what you owe', ar: 'احسب ما عليك' },
  calcBlurb: {
    en: 'Total your cash, gold, investments and business assets, and see whether they clear the threshold.',
    ar: 'اجمع نقودك وذهبك واستثماراتك وأصول تجارتك، واعرف هل بلغت النصاب.',
  },
  goldBlurb: {
    en: 'Work out what is due on jewellery and bullion from its weight and purity.',
    ar: 'احسب الزكاة الواجبة في الحُليّ والسبائك بحسب الوزن والعيار.',
  },
  fitrBlurb: {
    en: 'The per-person charity due before the Eid prayer at the end of Ramadan.',
    ar: 'الصدقة الواجبة عن كل فرد قبل صلاة العيد في ختام رمضان.',
  },
  kaffarahBlurb: {
    en: 'Expiation for a deliberately broken fast or oath, costed by the number of days.',
    ar: 'كفارة الإفطار المتعمَّد في رمضان أو الحنث في اليمين، محسوبة بعدد الأيام.',
  },
})

const CALCULATORS = [
  { path: '/zakat-calculator', name: C.zakatCalculator, blurb: M.calcBlurb, icon: Calculator },
  { path: '/zakat-on-gold', name: C.zakatOnGold, blurb: M.goldBlurb, icon: Coins },
  { path: '/zakat-al-fitr-calculator', name: C.zakatAlFitrCalculator, blurb: M.fitrBlurb, icon: Wheat },
  { path: '/kaffarah-calculator', name: C.kaffarahCalculator, blurb: M.kaffarahBlurb, icon: Wallet },
]

const Nisab = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing money. Nothing else on this page may decide it.
  const showFigure = loaded && hasUsableFigure(nisab)

  // English keeps the shared nisab formatters exactly; Arabic goes through Intl.
  const usd = (amount: number) => (locale === 'en' ? formatUsd(amount) : fmt.money(Math.round(amount) * 100))
  const asOfDate = (iso: string | null) => (locale === 'en' ? formatNisabDate(iso) : fmt.date(iso, 'long'))
  const num = (n: number) => (locale === 'en' ? String(n) : fmt.number(n))

  // The masses come from the snapshot wherever the page states them as ours.
  // nisab.gold_grams is a setting precisely so the foundation can follow the
  // other convention without a code change; a hardcoded "87.48" in the prose
  // would contradict the dollar figure the moment it did. They survive
  // staleness — the method never expires — so they need no gate of their own.
  // The 85 g / 595 g sentence further down stays literal: that is a fact about
  // other schools, not about our configuration.
  const goldGrams = nisab?.gold_grams ?? null
  const silverGrams = nisab?.silver_grams ?? null
  const goldMass = goldGrams !== null ? t(M.goldMass, { grams: num(goldGrams) }) : t(M.goldMassWords)
  const silverMass = silverGrams !== null ? t(M.silverMass, { grams: num(silverGrams) }) : t(M.silverMassWords)
  const goldGramsWord = goldGrams !== null ? t(M.gramsWord, { grams: num(goldGrams) }) : t(M.gramsWordWords)
  const silverGramsWord = silverGrams !== null ? t(M.gramsWord, { grams: num(silverGrams) }) : t(M.gramsWordWords)

  const year = currentYear()

  const howMuchAnswer = showFigure
    ? t(M.faq3AFigure)
    : t(M.faq3AMethod, { goldMass, silverMass })

  const faqs = [
    { question: t(M.faq1Q), answer: t(M.faq1A) },
    { question: t(M.faq2Q), answer: t(M.faq2A) },
    { question: t(M.faq3Q, { year }), answer: howMuchAnswer },
    { question: t(M.faq4Q), answer: t(M.faq4A) },
    { question: t(M.faq5Q), answer: t(M.faq5A) },
    { question: t(M.faq6Q), answer: t(M.faq6A) },
  ]

  const prefix = LOCALES[locale].prefix
  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: t(C.home), path: prefix || '/' },
      { name: t(C.nisab), path: `${prefix}/nisab` },
    ]),
    getFaqJsonLd(faqs),
  ]

  // Invented round numbers for the worked example (Arabic only; English prints them as written).
  const exampleVars = {
    nisab: fmt.money(64000),
    savings: fmt.money(400000),
    due: fmt.money(10000),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={t(M.seoTitle, { year })}
        description={t(M.seoDescription)}
        canonicalPath="/nisab"
        jsonLd={jsonLd}
      />

      <PageHeader
        eyebrow={t(M.eyebrow)}
        title={t(M.title)}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* 1. The figure, first */}
          <section className="card-tinted sm:p-8" aria-labelledby="current-threshold">
            <h2 id="current-threshold" className="text-xl font-heading font-bold text-gray-900 mb-6">
              {t(M.currentThreshold)}
            </h2>

            {!loaded && (
              <p className={PROSE}>{t(M.checking)}</p>
            )}

            {loaded && showFigure && nisab && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      {t(M.goldNisab)}
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {usd(nisab.nisab_gold_usd as number)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{goldMass}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      {t(M.silverNisab)}
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {usd(nisab.nisab_silver_usd as number)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{silverMass}</p>
                  </div>
                </div>
                {/* A citable statement has to say where it came from, not
                    only when it was taken. The source is withheld with the
                    money, because it is only a provenance while there is
                    something to have provenance for. */}
                <p className="text-sm text-gray-600 mt-4">
                  {t(M.asOf, { date: asOfDate(nisab.as_of) })}
                  {nisab.source ? <>{t(M.source, { source: nisab.source })}</> : null}
                </p>
              </>
            )}

            {loaded && !showFigure && (
              <>
                <p className={PROSE}>
                  {t(M.noFigure)}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      {t(M.goldNisab)}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{goldMass}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
                      {t(M.silverNisab)}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{silverMass}</p>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* 2. What the nisab is. Its second paragraph repeated the header
              word for word, so it went. */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.whatTitle)}</h2>
            <p className={PROSE}>
              {t(M.whatBody)}
            </p>
          </section>

          {/* 3-5. The method, the gold-or-silver question and the worked
              example, folded until asked for. The text stays in the DOM.
              Summaries must not repeat the pinned sentences ("scholars
              differ", "85 g of gold", "grams of gold"): tests expect one match. */}
          <div className="space-y-3">
            <Disclosure
              title={t(M.methodTitle)}
              summary={t(M.methodSummary)}
            >
              <p className={PROSE}>
                {t(M.methodP1, { gold: goldGramsWord, silver: silverGramsWord })}
              </p>
              <p className={PROSE}>
                {t(M.methodP2)}
              </p>
            </Disclosure>

            <Disclosure title={t(M.goldOrSilverTitle)} summary={t(M.goldOrSilverSummary)}>
              <p className={PROSE}>
                {t(M.goldOrSilverP1)}
              </p>
              <p className={PROSE}>{t(M.goldOrSilverP2)}</p>
            </Disclosure>

            {/* A worked example — withheld whenever the page is withholding
                dollar figures, so the page never mixes made-up money with a
                missing real one. */}
            {showFigure && (
              <Disclosure title={t(M.exampleTitle)} summary={t(M.exampleSummary, exampleVars)}>
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    {t(M.exampleNote)}
                  </p>
                </div>
                <p className={PROSE}>
                  {t(M.exampleBody, exampleVars)}
                </p>
              </Disclosure>
            )}
          </div>

          {/* 6. FAQ — the same text that goes into the FAQPage schema, one
              closed item per question. */}
          <section aria-labelledby="nisab-faq">
            <h2 id="nisab-faq" className={HEADING}>{t(M.faqTitle)}</h2>
            <div className="card py-1 sm:py-1 divide-y divide-gray-200">
              {faqs.map((faq) => (
                <Disclosure key={faq.question} variant="plain" title={faq.question}>
                  <p className={PROSE}>{faq.answer}</p>
                </Disclosure>
              ))}
            </div>
          </section>

          {/* 7. The disclaimer — stays open */}
          <section className="alert-warning block p-6 sm:p-8 text-base">
            <p className="text-amber-900 leading-relaxed">
              {t(M.disclaimer)}
            </p>
          </section>

          {/* 8. The calculators */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.workOutTitle)}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CALCULATORS.map((calc) => (
                <Link
                  key={calc.path}
                  to={calc.path}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                >
                  <calc.icon className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold text-gray-900">{t(calc.name)}</span>
                    <span className="block text-sm text-gray-600 mt-1">{t(calc.blurb)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Nisab
