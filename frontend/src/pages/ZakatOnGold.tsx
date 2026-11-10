/**
 * /zakat-on-gold — what is due on bullion, coins and jewellery, and the one
 * point on which this page deliberately declines to rule.
 *
 * Two constraints carried over from /nisab and /zakat-calculator:
 *   - the nisab weight is read from the /api/nisab snapshot, never hardcoded.
 *     One definition of the mass, in one place, is what stopped the 85-versus-
 *     87.48 contradiction from coming back;
 *   - the worked example is gated on `hasUsableFigure`. The page must never
 *     print invented dollar arithmetic on the same screen where it has just
 *     declined to print a real figure.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Info, ArrowRight } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import { fetchNisab, hasUsableFigure, type Nisab as NisabData } from '../utils/nisabApi'
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getHowToJsonLd,
} from '../utils/seo'
import { defineMessages, useFormat, useLocale, useT, LOCALES } from '../i18n'
import { C } from '../i18n/common'

const CARD = 'card sm:p-8'
const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const M = defineMessages({
  title: { en: 'Zakat on Gold {year} — How Much Do You Pay?', ar: 'زكاة الذهب {year}: كم تدفع؟' },
  seoDescription: {
    en: 'Zakat on gold is 2.5% of its value once it has been held for a lunar year. See how to weigh and value bullion, coins and jewellery, and where scholars differ on worn jewellery.',
    ar: 'زكاة الذهب ربع العشر (2.5%) من قيمته متى حال عليه حول قمري. تعرّف على طريقة وزن السبائك والعملات الذهبية والحُليّ وتقويمها، وعلى موضع اختلاف العلماء في الحُليّ الملبوس.',
  },
  eyebrow: { en: 'Zakat guide', ar: 'دليل الزكاة' },
  lead: {
    en: 'Gold is zakatable at 2.5% of its value once it has been yours for a full lunar year. The work is in weighing it, valuing it by karat, and knowing which pieces to count.',
    ar: 'تجب الزكاة في الذهب بنسبة 2.5% من قيمته متى مضى على ملكك له حول قمري كامل. ويبقى العمل في وزنه، وتقويمه بحسب عياره، ومعرفة القطع التي تدخل في الحساب.',
  },

  thresholdGrams: {
    en: '{grams} grams of gold, valued at the market price on the day you work it out',
    ar: '{grams} غرام من الذهب، يُقوَّم بسعر السوق في اليوم الذي تحسب فيه زكاتك',
  },
  thresholdWords: {
    en: 'a set weight of gold, valued at the market price on the day you work it out',
    ar: 'وزن محدد من الذهب، يُقوَّم بسعر السوق في اليوم الذي تحسب فيه زكاتك',
  },

  // Karat table
  k24: { en: 'Bullion, investment bars and most coins.', ar: 'الذهب الخام وسبائك الاستثمار ومعظم العملات الذهبية.' },
  k22: { en: 'Common in South Asian and Middle Eastern jewellery.', ar: 'شائع في حُليّ جنوب آسيا والشرق الأوسط.' },
  k21: { en: 'Widely used in Gulf jewellery.', ar: 'منتشر في حُليّ دول الخليج.' },
  k18: { en: 'Common in European and American jewellery.', ar: 'شائع في الحُليّ الأوروبية والأمريكية.' },
  k14: { en: 'Common in American jewellery.', ar: 'شائع في الحُليّ الأمريكية.' },
  karatLabel: { en: '{karat}k', ar: 'عيار {karat}' },
  thKarat: { en: 'Karat', ar: 'العيار' },
  thContent: { en: 'Gold content', ar: 'نسبة الذهب' },
  thTypically: { en: 'Typically', ar: 'الاستخدام الشائع' },

  // FAQ
  faq1Q: { en: 'Is there zakat on gold jewellery I wear?', ar: 'هل تجب الزكاة في حُليّ الذهب الذي ألبسه؟' },
  faq1A: {
    en: 'This is the one point on this page where scholars genuinely differ, and we do not adjudicate it. Many hold that jewellery in regular personal use is exempt, treating it as a personal effect in the same category as clothing, and some who take that view set a customary limit beyond which the excess becomes zakatable. Others hold that gold is zakatable by its nature regardless of what it is used for, and that an exemption for adornment would leave a great deal of real wealth untouched. Both positions are held by serious scholars, so follow the one your school or teacher takes.',
    ar: 'هذه هي المسألة الوحيدة في هذه الصفحة التي اختلف فيها العلماء اختلافًا حقيقيًا، ونحن لا نرجّح فيها قولًا على آخر. فكثير منهم يرون أن الحُليّ المعدّ للاستعمال الشخصي المعتاد لا زكاة فيه، ويُلحقونه بالمتاع الشخصي كالثياب، ومن أصحاب هذا القول من يجعل له حدًّا عُرفيًا تجب الزكاة فيما زاد عليه. ويرى آخرون أن الذهب تجب فيه الزكاة لذاته أيًّا كان استعماله، وأن إعفاء ما يُتزيَّن به يُخرج قدرًا كبيرًا من الثروة الحقيقية عن الزكاة. وكلا القولين قال به علماء معتبرون، فاتبع ما عليه مذهبك أو شيخك.',
  },
  faq2Q: { en: 'How do I work out the weight of my gold?', ar: 'كيف أعرف وزن ذهبي؟' },
  faq2A: {
    en: 'Weigh it in grams on a jeweller’s scale or an accurate kitchen scale, item by item, and write the weights down so you can repeat the exercise next year. Many pieces are stamped with their karat, and a receipt or valuation certificate will usually give both the weight and the purity. If a piece has stones set in it, the stones are not gold and their weight should come out of the figure — a jeweller can tell you the gold-only weight.',
    ar: 'زِنه بالغرام على ميزان صائغ أو ميزان مطبخ دقيق، قطعةً قطعة، ودوّن الأوزان لتعيد الحساب في العام القادم. وكثير من القطع مختوم عليها عيارها، وغالبًا ما تذكر فاتورة الشراء أو شهادة التقييم الوزن والعيار معًا. وإن كانت في القطعة أحجار مرصّعة فهي ليست ذهبًا، فيُطرح وزنها من الحساب، ويستطيع الصائغ أن يخبرك بوزن الذهب وحده.',
  },
  faq3Q: { en: 'Does the karat matter?', ar: 'هل للعيار أثر؟' },
  faq3A: {
    en: 'It matters for the valuation, because karat measures how much of the piece is actually gold: 24k is close to pure, 22k is about 91.7% gold, 18k is 75% and 14k is about 58.3%. The usual approach is to value each item at the market price for its own karat, or to convert it to its pure gold content and value that at the fine gold price. Weighing a 14k chain as though it were bullion would roughly double what you thought you owed, so it is worth sorting your pieces by karat before you start.',
    ar: 'له أثر في التقويم، لأن العيار يبيّن مقدار الذهب الخالص في القطعة: فعيار 24 يقارب الذهب الخالص، وعيار 22 فيه نحو 91.7% من الذهب، وعيار 18 فيه 75%، وعيار 14 فيه نحو 58.3%. والطريقة المعتادة أن تُقوَّم كل قطعة بسعر السوق لعيارها، أو أن تُحوَّل إلى ما فيها من ذهب خالص ويُقوَّم ذلك بسعر الذهب الخالص. ولو عاملت سلسلة من عيار 14 كأنها سبيكة خالصة لتضاعف تقريبًا ما تظن أنه عليك، فيحسن أن تفرز قطعك بحسب العيار قبل أن تبدأ.',
  },
  faq4Q: { en: 'What is the nisab for gold?', ar: 'ما نصاب الذهب؟' },
  faq4A: {
    en: 'The gold nisab is {threshold}. If gold is all you hold, that weight sets the threshold your holding is measured against; if you also hold cash, savings or other zakatable assets, the whole total is measured against a single threshold rather than each asset being tested on its own. Which threshold to use — the gold one or the much lower silver one — is itself a question scholars differ on, and the nisab page sets out both.',
    ar: 'نصاب الذهب {threshold}. فإن لم تملك من المال الزكوي غير الذهب، فهذا الوزن هو الحدّ الذي يُقاس عليه ما تملكه؛ وإن كنت تملك معه نقودًا أو مدخرات أو غيرها من الأموال الزكوية، فإن المجموع كله يُقاس على نصاب واحد، ولا يُنظر في كل مال على حدة. أما أيّ النصابين يُعتمد — نصاب الذهب أم نصاب الفضة الأدنى منه بكثير — فمسألة اختلف فيها العلماء أيضًا، وقد عرضت صفحة النصاب القولين كليهما.',
  },
  faq5Q: { en: 'Do I pay zakat on gold I inherited?', ar: 'هل تجب عليّ الزكاة في الذهب الذي ورثته؟' },
  faq5A: {
    en: 'Inherited gold is yours once the estate has been settled, and from that point it is treated like any other gold you own. The commonly taught position is that the lunar year runs from when you took ownership rather than from when the deceased acquired it, so the first zakat on it falls due a full lunar year after it came to you. If the estate is still unsettled, or the division is disputed, the position is less clear-cut and worth asking about.',
    ar: 'يصير الذهب الموروث ملكًا لك بعد قسمة التركة، ومن حينها يُعامل معاملة أي ذهب آخر تملكه. والقول الذي يُدرَّس عادةً أن الحول يبدأ من وقت تملّكك له، لا من وقت تملّك المتوفى إياه، فتجب أول زكاة فيه بعد مرور حول قمري كامل على دخوله في ملكك. أما إن لم تُقسم التركة بعد، أو كان في قسمتها نزاع، فالحكم أقل وضوحًا، ويحسن السؤال عنه.',
  },
  faq6Q: { en: 'What about gold held as an investment?', ar: 'وماذا عن الذهب المقتنى للاستثمار؟' },
  faq6A: {
    en: 'Gold bought to hold or to trade is zakatable, and there is no serious disagreement about it — the exemption some scholars extend to worn jewellery is argued from personal use, which does not apply here. That covers bars, coins, and gold held for you in an allocated account or vault. Gold-backed funds and ETFs are usually treated by reference to the metal behind them, though scholars differ on how to treat a product that settles in cash and never gives you a claim on physical metal.',
    ar: 'الذهب المشترى للادخار أو للتجارة تجب فيه الزكاة، ولا خلاف معتبر في ذلك؛ فالإعفاء الذي يقول به بعض العلماء في الحُليّ الملبوس مبنيّ على الاستعمال الشخصي، وهو غير متحقق هنا. ويشمل ذلك السبائك والعملات الذهبية والذهب المحفوظ لك في حساب مخصّص أو في خزينة. أما الصناديق المدعومة بالذهب وصناديق المؤشرات المتداولة (ETF) فتُعامل عادةً بالنظر إلى المعدن الذي تقوم عليه، وإن اختلف العلماء في المنتج الذي يُسوّى نقدًا ولا يمنحك حقًّا في معدن فعلي.',
  },

  // HowTo schema
  howToName: { en: 'How to calculate zakat on gold', ar: 'كيف تحسب زكاة الذهب' },
  howToDescription: {
    en: 'Four steps from the gold in your drawer to the amount of zakat due on it.',
    ar: 'أربع خطوات من الذهب الذي في درجك إلى مقدار الزكاة الواجبة فيه.',
  },
  step1Name: { en: 'Sort your gold by karat', ar: 'افرز ذهبك بحسب العيار' },
  step1Text: {
    en: 'Put 24k bullion, 22k jewellery and 18k or 14k pieces into separate groups, since each is valued at a different price.',
    ar: 'ضع سبائك عيار 24، وحُليّ عيار 22، والقطع من عيار 18 أو 14 في مجموعات منفصلة، لأن لكل منها سعرًا مختلفًا.',
  },
  step2Name: { en: 'Weigh each group in grams', ar: 'زِن كل مجموعة بالغرام' },
  step2Text: {
    en: 'Use an accurate scale, and take out the weight of any stones, which are not gold.',
    ar: 'استخدم ميزانًا دقيقًا، واطرح وزن الأحجار، فهي ليست ذهبًا.',
  },
  step3Name: { en: 'Value it at today’s price per gram', ar: 'قوّمه بسعر الغرام اليوم' },
  step3Text: {
    en: 'Multiply the weight of each group by the price per gram for that karat, or convert each group to its pure gold content and value that at the fine gold price.',
    ar: 'اضرب وزن كل مجموعة في سعر الغرام لعيارها، أو حوّل كل مجموعة إلى ما فيها من ذهب خالص وقوّمه بسعر الذهب الخالص.',
  },
  step4Name: { en: 'Compare against the nisab and pay 2.5%', ar: 'قارن بالنصاب وأخرج 2.5%' },
  step4Text: {
    en: 'The gold threshold is {threshold}. At or above it, 2.5% of the value is due; below it, no zakat is owed this year.',
    ar: 'نصاب الذهب {threshold}. فإن بلغه ما عندك أو زاد عليه وجب ربع العشر (2.5%) من قيمته، وإن نقص عنه فلا زكاة عليك هذا العام.',
  },

  // 1. Short answer
  shortTitle: { en: 'The short answer', ar: 'الجواب المختصر' },
  shortP1: {
    en: 'Zakat on gold is 2.5% of what the gold is worth today, not of what you paid for it, and it falls due once the gold has been in your possession for a full lunar year — a hawl, about 354 days — and your zakatable wealth sits at or above the nisab. Gold is measured by weight and purity rather than by the form it happens to take, so bullion, coins, bangles and a broken chain in a drawer are all treated the same way.',
    ar: 'زكاة الذهب ربع العشر (2.5%) من قيمته اليوم، لا من ثمن شرائه، وتجب متى مضى على الذهب في ملكك حول قمري كامل — أي نحو 354 يومًا — وكانت أموالك الزكوية بالغة النصاب أو زائدة عليه. والذهب يُعتبر بوزنه وعياره لا بالشكل الذي هو عليه، فالسبائك والعملات والأساور وسلسلة مكسورة في درج كلها تُعامل معاملة واحدة.',
  },
  shortP2: {
    en: 'Once you are at or above the threshold the rate applies to the whole value, not only to the part above the line. Below the threshold, no zakat is due this year.',
    ar: 'فإذا بلغت النصاب أو تجاوزته وجبت النسبة في القيمة كلها، لا في القدر الزائد على النصاب وحده. وإن كنت دون النصاب فلا زكاة عليك هذا العام.',
  },

  // 2. Which gold counts
  countsTitle: { en: 'Which gold counts', ar: 'أيّ الذهب يدخل في الحساب' },
  countsBefore: {
    en: 'Bullion, bars, coins, investment gold and gold kept unworn are zakatable; there is no serious disagreement on that. ',
    ar: 'الذهب الخام والسبائك والعملات الذهبية وذهب الاستثمار والذهب المحفوظ غير الملبوس كلها تجب فيها الزكاة، ولا خلاف معتبر في ذلك. ',
  },
  countsStrong: {
    en: 'Jewellery worn regularly is the contested case:',
    ar: 'أما الحُليّ الملبوس بانتظام فهو موضع الخلاف:',
  },
  countsAfter: {
    en: ' many scholars exempt it as a personal effect, others hold that gold is zakatable whatever its use. Both views are long-standing; follow your school or teacher.',
    ar: ' فكثير من العلماء يعفونه بوصفه من المتاع الشخصي، ويرى آخرون أن الذهب تجب فيه الزكاة أيًّا كان استعماله. وكلا القولين قديم معتبر، فاتبع مذهبك أو شيخك.',
  },

  // 3. Weighing and valuing
  weighTitle: { en: 'How to weigh and value it', ar: 'كيف تزنه وتقوّمه' },
  weighP1: {
    en: 'The method is the same for every piece: weight in grams, multiplied by today’s price per gram for that purity. Weigh each item on an accurate scale, and take out the weight of any stones, since a sapphire is not gold. Then sort the pieces by karat, because karat is what tells you how much of that weight is actually gold.',
    ar: 'الطريقة واحدة لكل قطعة: الوزن بالغرام مضروبًا في سعر الغرام اليوم لذلك العيار. زِن كل قطعة على ميزان دقيق، واطرح وزن ما فيها من أحجار، فالياقوت ليس ذهبًا. ثم افرز القطع بحسب العيار، لأن العيار هو الذي يبيّن كم من ذلك الوزن ذهب حقيقي.',
  },
  weighP2: {
    en: 'Value each karat group at its own price, or convert to pure gold and use the fine-gold price. The answer is the same.',
    ar: 'قوّم كل مجموعة بسعر عيارها، أو حوّلها إلى ذهب خالص واستخدم سعر الذهب الخالص، والنتيجة واحدة.',
  },

  // 4. Threshold
  thresholdTitle: { en: 'Measuring it against the threshold', ar: 'المقارنة بالنصاب' },
  thresholdP1: {
    en: 'If gold is the only zakatable wealth you hold, it is measured against the gold nisab: {threshold}. Hold less than that and no zakat is due on it this year; hold that much or more and 2.5% of the value is due.',
    ar: 'إذا كان الذهب هو كل ما تملكه من المال الزكوي، فإنه يُقاس على نصاب الذهب: {threshold}. فإن ملكت أقل من ذلك فلا زكاة فيه هذا العام، وإن ملكت ذلك القدر أو أكثر وجب ربع العشر (2.5%) من قيمته.',
  },
  thresholdP2: {
    en: 'If you hold cash, savings or investments as well, the gold does not get a separate test of its own. Everything is added together and the total is measured against a single threshold, which is why a few grams of gold can matter even when the gold on its own would fall well short.',
    ar: 'وإن كنت تملك معه نقودًا أو مدخرات أو استثمارات، فلا يُنظر في الذهب وحده، بل يُضمّ ذلك كله بعضه إلى بعض ويُقاس المجموع على نصاب واحد؛ ولهذا قد يكون لبضعة غرامات من الذهب أثر، حتى لو كان الذهب وحده دون النصاب بكثير.',
  },
  thresholdLink: { en: 'How the nisab is worked out, with the current figures', ar: 'كيف يُحسب النصاب، مع الأرقام الحالية' },

  // 5. Worked example
  exampleTitle: { en: 'A worked example', ar: 'مثال تطبيقي' },
  exampleSummary: { en: '100 g of 22-karat jewellery', ar: '100 غرام من حُليّ عيار 22' },
  exampleNote: {
    en: 'Illustrative only. The gold price below is a round invented number chosen to show the arithmetic — it is not market data. Use the dated figures on the nisab page.',
    ar: 'للتوضيح فقط. سعر الذهب أدناه رقم مفترض اختير لبيان طريقة الحساب، وليس سعرًا من السوق. اعتمد الأرقام المؤرّخة في صفحة النصاب.',
  },
  exampleIntro: {
    en: 'Suppose you hold 100 grams of 22-karat jewellery, on the view that it is zakatable, and suppose fine gold is trading at an illustrative $100 a gram.',
    ar: 'لنفترض أنك تملك 100 غرام من حُليّ عيار 22، على القول بوجوب الزكاة فيه، وأن سعر الذهب الخالص {price} للغرام على سبيل المثال.',
  },
  pureLabel: { en: 'Pure gold content:', ar: 'محتوى الذهب الخالص:' },
  pureBody: {
    en: '100 g at 22 karat is 22 ÷ 24, or about 91.7% gold — roughly 91.7 grams of fine gold.',
    ar: '100 غرام من عيار 22 فيها 22 ÷ 24، أي نحو 91.7% ذهبًا — قرابة 91.7 غرامًا من الذهب الخالص.',
  },
  valueLabel: { en: 'Value:', ar: 'القيمة:' },
  valueBody: {
    en: '91.7 g × $100 a gram = about $9,170.',
    ar: '91.7 غرام × {price} للغرام = نحو {value}.',
  },
  dayThresholdLabel: { en: 'The threshold that day:', ar: 'النصاب في ذلك اليوم:' },
  dayThresholdBody: {
    en: '{grams} g × $100 a gram = ${total}.',
    ar: '{grams} غرام × {price} للغرام = {total}.',
  },
  dueLabel: { en: 'Zakat due:', ar: 'الزكاة الواجبة:' },
  dueBody: {
    en: '$9,170 is above that threshold, so 2.5% of $9,170 is about $229.',
    ar: '{value} أعلى من ذلك النصاب، فيجب ربع العشر (2.5%) من {value}، أي نحو {due}.',
  },

  // 6, 7, 8
  faqTitle: { en: 'Common questions', ar: 'أسئلة شائعة' },
  disclaimer: {
    en: 'This page is general guidance, not a religious ruling. Zakat depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.',
    ar: 'هذه الصفحة إرشاد عام، وليست فتوى شرعية. فالزكاة تختلف باختلاف الأحوال، وفي كل ما يخصّ حالتك تحديدًا يُرجى سؤال عالم مؤهَّل.',
  },
  toCalculator: { en: 'Work it out in the zakat calculator', ar: 'احسبها في حاسبة الزكاة' },
})

const KARATS = [
  { karat: '24', purity: '99.9%', note: M.k24 },
  { karat: '22', purity: '91.7%', note: M.k22 },
  { karat: '21', purity: '87.5%', note: M.k21 },
  { karat: '18', purity: '75.0%', note: M.k18 },
  { karat: '14', purity: '58.3%', note: M.k14 },
]

const ZakatOnGold = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing money anywhere on this page.
  const showFigure = loaded && hasUsableFigure(nisab)

  // The mass comes from the snapshot, which is the one definition of it. It
  // survives a stale price, because the method never expires; only an
  // unreachable endpoint leaves us without it, and then the page states the
  // method in words rather than falling back on a constant of its own.
  const goldGrams = nisab?.gold_grams ?? null

  const year = currentYear()
  // English keeps its original formatting byte for byte; Arabic goes through Intl.
  const grams = (g: number) => (locale === 'en' ? String(g) : fmt.number(g))
  const prefix = LOCALES[locale].prefix

  const thresholdSentence =
    goldGrams !== null
      ? t(M.thresholdGrams, { grams: grams(goldGrams) })
      : t(M.thresholdWords)

  const faqs = [
    { question: t(M.faq1Q), answer: t(M.faq1A) },
    { question: t(M.faq2Q), answer: t(M.faq2A) },
    { question: t(M.faq3Q), answer: t(M.faq3A) },
    { question: t(M.faq4Q), answer: t(M.faq4A, { threshold: thresholdSentence }) },
    { question: t(M.faq5Q), answer: t(M.faq5A) },
    { question: t(M.faq6Q), answer: t(M.faq6A) },
  ]

  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: t(C.home), path: prefix || '/' },
      { name: t(C.zakatOnGold), path: `${prefix}/zakat-on-gold` },
    ]),
    getFaqJsonLd(faqs),
    // No WebApplication here. This page is prose and a karat table — it has no
    // inputs and nothing to run — so declaring one, with browserRequirements
    // and all, told search engines and crawlers about a calculator that does
    // not exist on it. HowTo describes what the page actually does: it explains
    // the method. The calculator itself lives at /zakat-calculator.
    getHowToJsonLd({
      name: t(M.howToName),
      description: t(M.howToDescription),
      steps: [
        { name: t(M.step1Name), text: t(M.step1Text) },
        { name: t(M.step2Name), text: t(M.step2Text) },
        { name: t(M.step3Name), text: t(M.step3Text) },
        { name: t(M.step4Name), text: t(M.step4Text, { threshold: thresholdSentence }) },
      ],
    }),
  ]

  const title = t(M.title, { year })

  // Worked-example figures. English prints them as written; Arabic formats the
  // same invented numbers through Intl.
  const exampleVars = {
    price: fmt.money(10000),
    value: fmt.money(917000),
    due: fmt.money(22900),
    grams: goldGrams === null ? null : grams(goldGrams),
    total:
      goldGrams === null
        ? null
        : locale === 'en'
          ? (goldGrams * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })
          : fmt.money(Math.round(goldGrams * 100) * 100),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={title}
        description={t(M.seoDescription)}
        canonicalPath="/zakat-on-gold"
        jsonLd={jsonLd}
      />

      <PageHeader
        eyebrow={t(M.eyebrow)}
        title={title}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* 1. The short answer */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.shortTitle)}</h2>
            <p className={PROSE}>
              {t(M.shortP1)}
            </p>
            <p className={`${PROSE} mt-4`}>
              {t(M.shortP2)}
            </p>
          </section>

          {/* 2. Which gold counts — the contested point, named and left open.
              The long version of both views is FAQ #1. */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.countsTitle)}</h2>
            <p className={PROSE}>
              {t(M.countsBefore)}<strong>{t(M.countsStrong)}</strong>{t(M.countsAfter)}
            </p>
          </section>

          {/* 3. Weighing and valuing */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.weighTitle)}</h2>
            <p className={PROSE}>
              {t(M.weighP1)}
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-start text-gray-500 uppercase tracking-wide text-xs">
                    <th className="py-2 pe-4 font-medium">{t(M.thKarat)}</th>
                    <th className="py-2 pe-4 font-medium">{t(M.thContent)}</th>
                    <th className="py-2 font-medium">{t(M.thTypically)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {KARATS.map((row) => (
                    <tr key={row.karat}>
                      <td className="py-2 pe-4 font-semibold text-gray-900">{t(M.karatLabel, { karat: row.karat })}</td>
                      <td className="py-2 pe-4 text-gray-700">{row.purity}</td>
                      <td className="py-2 text-gray-600">{t(row.note)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`${PROSE} mt-6`}>
              {t(M.weighP2)}
            </p>
          </section>

          {/* 4. The threshold */}
          <section className={CARD}>
            <h2 className={HEADING}>{t(M.thresholdTitle)}</h2>
            <p className={PROSE}>
              {t(M.thresholdP1, { threshold: thresholdSentence })}
            </p>
            <p className={`${PROSE} mt-4`}>
              {t(M.thresholdP2)}
            </p>
            <Link to="/nisab" className="link mt-4 inline-flex items-center">
              {t(M.thresholdLink)}
              <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
            </Link>
          </section>

          {/* 5. A worked example — withheld whenever the page is withholding
              dollar figures, so it never shows invented arithmetic on the same
              screen where it has just declined to print a real figure. Folded. */}
          {showFigure && goldGrams !== null && (
            <Disclosure title={t(M.exampleTitle)} summary={t(M.exampleSummary)}>
              <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-gray-600">
                  {t(M.exampleNote)}
                </p>
              </div>
              <p className={PROSE}>
                {t(M.exampleIntro, exampleVars)}
              </p>
              <ul className="space-y-2 text-gray-700">
                <li>
                  <strong>{t(M.pureLabel)}</strong> {t(M.pureBody)}
                </li>
                <li>
                  <strong>{t(M.valueLabel)}</strong> {t(M.valueBody, exampleVars)}
                </li>
                <li>
                  <strong>{t(M.dayThresholdLabel)}</strong> {t(M.dayThresholdBody, exampleVars)}
                </li>
                <li>
                  <strong>{t(M.dueLabel)}</strong> {t(M.dueBody, exampleVars)}
                </li>
              </ul>
            </Disclosure>
          )}

          {/* 6. FAQ — the same text that goes into the FAQPage schema, one
              closed item per question. */}
          <section aria-labelledby="gold-faq">
            <h2 id="gold-faq" className={HEADING}>{t(M.faqTitle)}</h2>
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

          {/* 8. Through to the calculator */}
          <div className="text-center">
            <Link to="/zakat-calculator" className="btn-primary gap-2">
              <Calculator className="w-5 h-5" aria-hidden="true" />
              {t(M.toCalculator)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZakatOnGold
