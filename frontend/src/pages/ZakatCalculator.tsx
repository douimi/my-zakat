/**
 * /zakat-calculator — the calculator, plus the content that makes it findable.
 *
 * The page used to seed its gold and silver price fields from two hardcoded
 * constants. Every figure it produced was therefore built on a guess wearing a
 * comment that told the user to go and check the real rate elsewhere. The
 * prices now come from /api/nisab at render time, and when we do not hold a
 * price we can vouch for the fields start empty and say so. There is no
 * fallback price, under any name: a made-up price produces a made-up zakat
 * figure, and that is worse than an empty box.
 */
import { Fragment, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Calculator, DollarSign, TrendingUp, Info, ArrowRight, CheckCircle, AlertCircle, X, RotateCcw, Scale } from 'lucide-react'
import { donationsAPI } from '../utils/api'
import type { ZakatCalculation, ZakatResult } from '../types'
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
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getWebApplicationJsonLd,
  getHowToJsonLd,
} from '../utils/seo'
import { defineMessages, useFormat, useLocale, useT, LOCALES, type Message } from '../i18n'
import { C } from '../i18n/common'

const M = defineMessages({
  title: {
    en: 'Zakat Calculator {year} — How Much Zakat Do I Owe?',
    ar: 'حاسبة الزكاة {year}: كم تبلغ زكاتي؟',
  },
  seoDescription: {
    en: 'Work out what zakat you owe. Enter your cash, savings, gold, silver, investments and business assets, and see them compared against the current nisab threshold.',
    ar: 'احسب الزكاة الواجبة عليك: أدخل نقدك ومدخراتك وذهبك وفضتك واستثماراتك وأصول تجارتك، وقارنها بحدّ النصاب الحالي.',
  },
  lead: {
    en: 'Total your cash, gold, investments and business assets, see them measured against the current nisab, and find the 2.5% that is due.',
    ar: 'اجمع نقدك وذهبك واستثماراتك وأصول تجارتك، وقِسها على النصاب الحالي، واعرف مقدار الـ2.5% الواجب عليك.',
  },
  priceHint: { en: "Enter today's price per gram", ar: 'أدخل سعر الغرام اليوم' },
  unitGrams: { en: 'g', ar: 'غ' },

  // Masses stated as ours. The Arabic forms carry the metal so that each
  // sentence reads naturally; the English ones keep their original wording.
  goldGramsText: { en: '{grams} grams', ar: '{grams} غرام من الذهب' },
  goldGramsWords: { en: 'a set weight of gold', ar: 'وزن محدد من الذهب' },
  silverGramsText: { en: '{grams} grams', ar: '{grams} غرام من الفضة' },
  silverGramsWords: { en: 'a set weight of silver', ar: 'وزن محدد من الفضة' },
  massSentence: {
    en: 'The threshold set by {gold} g of gold or {silver} g of silver at today’s price.',
    ar: 'الحدّ المقدَّر بـ{gold} غرام من الذهب أو {silver} غرام من الفضة بسعر اليوم.',
  },
  massSentenceWords: {
    en: 'The threshold set by a fixed weight of gold — or of silver — at today’s price.',
    ar: 'الحدّ المقدَّر بوزن محدد من الذهب أو من الفضة بسعر اليوم.',
  },

  // Errors
  missingPrice: {
    en: 'Add a price per gram for the metal you hold. We will not substitute a price of our own.',
    ar: 'أدخل سعر الغرام للمعدن الذي تملكه، فنحن لا نضع سعرًا من عندنا بدلًا منه.',
  },
  nonNegative: {
    en: 'Please make sure all values are non-negative numbers.',
    ar: 'يُرجى التأكد من أن جميع القيم أرقام غير سالبة.',
  },
  calcFailed: { en: 'Could not calculate Zakat. Please try again.', ar: 'تعذّر حساب الزكاة. يُرجى المحاولة مرة أخرى.' },

  // Form sections and fields
  secCash: { en: 'Cash & Liquid Assets', ar: 'النقد والأصول السائلة' },
  fCash: { en: 'Cash in Hand / Bank', ar: 'النقد في اليد أو في البنك' },
  fReceivables: { en: 'Money Owed to You', ar: 'الديون المستحقة لك' },
  fStocks: { en: 'Stocks & Bonds', ar: 'الأسهم والسندات' },
  fRetirement: { en: 'Retirement Funds', ar: 'مدخرات التقاعد' },
  secMetals: { en: 'Precious Metals', ar: 'الذهب والفضة' },
  metalsNote: {
    en: "Live gold and silver prices are temporarily unavailable, so these two fields have been left blank rather than filled with a guess — enter today's price per gram from a source you trust.",
    ar: 'أسعار الذهب والفضة المباشرة غير متاحة مؤقتًا، لذا تُرك حقلا السعر فارغين بدلًا من ملئهما بسعر تقديري. أدخل سعر الغرام اليوم من مصدر تثق به.',
  },
  fGoldWeight: { en: 'Gold Weight (grams)', ar: 'وزن الذهب (بالغرام)' },
  fGoldPrice: { en: 'Gold Price per Gram', ar: 'سعر غرام الذهب' },
  fSilverWeight: { en: 'Silver Weight (grams)', ar: 'وزن الفضة (بالغرام)' },
  fSilverPrice: { en: 'Silver Price per Gram', ar: 'سعر غرام الفضة' },
  secBusiness: { en: 'Business & Investments', ar: 'التجارة والاستثمارات' },
  fBusinessGoods: { en: 'Business Inventory / Goods', ar: 'عروض التجارة (البضائع والمخزون)' },
  fAgriculture: { en: 'Agricultural Produce', ar: 'المحاصيل الزراعية' },
  fInvestmentProperty: { en: 'Investment Property (held for resale)', ar: 'العقارات الاستثمارية (المقتناة لإعادة البيع)' },
  fLivestock: { en: 'Livestock Value', ar: 'قيمة الماشية' },
  secOther: { en: 'Other Assets', ar: 'أصول أخرى' },
  fOtherValuables: { en: 'Other Valuable Assets', ar: 'مقتنيات أخرى ذات قيمة' },
  fOtherAssets: { en: 'Miscellaneous Assets', ar: 'أصول متنوعة' },
  secLiabilities: { en: 'Liabilities & Debts', ar: 'الالتزامات والديون' },
  fLiabilities: { en: 'Total Debts & Liabilities', ar: 'إجمالي الديون والالتزامات' },

  calculating: { en: 'Calculating...', ar: 'جارٍ الحساب...' },
  calculateZakat: { en: 'Calculate Zakat', ar: 'احسب الزكاة' },
  resetCalculator: { en: 'Reset Calculator', ar: 'إعادة تعيين الحاسبة' },

  // Sidebar
  comparedTitle: { en: 'What your total is compared against', ar: 'الحدّ الذي يُقاس عليه مجموع مالك' },
  checking: { en: 'Checking the latest gold and silver prices…', ar: 'جارٍ التحقق من أحدث أسعار الذهب والفضة…' },
  comparedGold: {
    en: 'Compared against the gold nisab of {nisab} — {grams} grams of gold at {price} a gram.',
    ar: 'مقارنةً بنصاب الذهب البالغ {nisab}، أي {grams} غرام من الذهب بسعر {price} للغرام.',
  },
  noGoldPrice: {
    en: 'We hold no gold price we can vouch for, so there is no threshold to show yet. The nisab is {gold} grams of gold, or {silver} grams of silver, valued at the market price on the day you work it out.',
    ar: 'لا نملك سعرًا موثوقًا للذهب، لذا لا يوجد حدّ نعرضه بعد. والنصاب {gold} غرام من الذهب، أو {silver} غرام من الفضة، يُقوَّم بسعر السوق في اليوم الذي تحسب فيه زكاتك.',
  },
  noFigures: {
    en: 'We could not reach the figures behind the threshold, so there is none to show here. The nisab is a set weight of gold — or of silver — valued at the market price on the day you work it out; the nisab page sets out both weights.',
    ar: 'تعذّر علينا الوصول إلى البيانات التي يقوم عليها النصاب، فلا يوجد حدّ نعرضه هنا. والنصاب وزن محدد من الذهب أو من الفضة، يُقوَّم بسعر السوق في اليوم الذي تحسب فيه زكاتك، وتعرض صفحة النصاب الوزنين كليهما.',
  },
  livePrices: { en: 'Live gold and silver prices, as of {date}.', ar: 'أسعار الذهب والفضة المباشرة، بتاريخ {date}.' },
  yourPrice: {
    en: 'That uses the price you entered, not a live figure of ours.',
    ar: 'يعتمد هذا على السعر الذي أدخلته، لا على سعر مباشر من عندنا.',
  },
  silverAlt: {
    en: 'Many scholars use the silver threshold instead, which is the lower of the two: {amount} for {grams} grams of silver. Which threshold applies to you is a point on which scholars differ.',
    ar: 'ويعتمد كثير من العلماء نصاب الفضة بدلًا منه، وهو الأدنى من النصابين: {amount} مقابل {grams} غرام من الفضة. وأيّ النصابين ينطبق عليك مسألة اختلف فيها العلماء.',
  },
  howWorkedOut: { en: 'How the nisab is worked out', ar: 'كيف يُحسب النصاب' },

  // Result card
  resultTitle: { en: 'Your Zakat Calculation', ar: 'نتيجة حساب زكاتك' },
  resultSub: { en: 'Based on your provided information', ar: 'بناءً على المعلومات التي أدخلتها' },
  noThresholdTitle: { en: 'No threshold to compare against', ar: 'لا يوجد حدّ للمقارنة' },
  noThresholdBody: {
    en: 'Your net zakatable wealth is {net}. We are not showing a threshold because no gold price was entered and we hold none we can vouch for — we will not invent one. The nisab is {gold} of gold, or {silver} of silver, at the market price on the day you work it out.',
    ar: 'صافي مالك الزكوي {net}. لا نعرض حدًّا للنصاب لأنك لم تُدخل سعرًا للذهب، ولا نملك سعرًا موثوقًا، ولن نختلق سعرًا. والنصاب {gold}، أو {silver}، بسعر السوق في اليوم الذي تحسب فيه زكاتك.',
  },
  belowTitle: { en: 'Below Nisab — no Zakat is due', ar: 'دون النصاب: لا زكاة عليك' },
  belowBody: {
    en: 'Your net zakatable wealth ({net}) is below the current Nisab threshold of {nisab}.',
    ar: 'صافي مالك الزكوي ({net}) دون حدّ النصاب الحالي البالغ {nisab}.',
  },
  aboveTitle: { en: 'Above Nisab — Zakat is due', ar: 'بلغ النصاب: الزكاة واجبة' },
  aboveBody: { en: 'Net zakatable: {net} • Nisab: {nisab}', ar: 'صافي المال الزكوي: {net} • النصاب: {nisab}' },
  wealthZakat: { en: 'Wealth Zakat', ar: 'زكاة المال' },
  goldZakat: { en: 'Gold Zakat', ar: 'زكاة الذهب' },
  silverZakat: { en: 'Silver Zakat', ar: 'زكاة الفضة' },
  businessZakat: { en: 'Business Zakat', ar: 'زكاة عروض التجارة' },
  agricultureZakat: { en: 'Agriculture Zakat', ar: 'زكاة الزروع' },
  withColon: { en: '{label}:', ar: '{label}:' },
  totalDue: { en: 'Total Zakat Due:', ar: 'إجمالي الزكاة الواجبة:' },
  payZakatNow: { en: 'Pay Zakat Now', ar: 'أخرج زكاتك الآن' },

  // Content
  howItWorks: { en: 'How it works', ar: 'كيف تعمل الحاسبة' },
  coversTitle: { en: 'What this calculator covers — and what it does not', ar: 'ما تشمله هذه الحاسبة وما لا تشمله' },
  coversSummary: {
    en: 'Zakat on wealth only, not zakat al-Fitr or livestock tables',
    ar: 'زكاة المال فقط، دون زكاة الفطر أو جداول زكاة الأنعام',
  },
  coversP1: {
    en: 'This works out zakat al-mal: the annual charge on wealth you have held for a full lunar year. It takes cash, money owed to you, shares and funds, retirement savings, gold and silver by weight, business stock, property bought to resell, agricultural produce and livestock value, subtracts your liabilities, and applies the rate to what is left.',
    ar: 'تحسب هذه الحاسبة زكاة المال: الزكاة السنوية في المال الذي حال عليه في ملكك حول قمري كامل. فهي تجمع النقد، والديون المستحقة لك، والأسهم والصناديق، ومدخرات التقاعد، والذهب والفضة بالوزن، وعروض التجارة، والعقارات المشتراة لإعادة بيعها، والمحاصيل الزراعية، وقيمة الماشية، ثم تطرح ما عليك من التزامات، وتطبّق النسبة على الباقي.',
  },
  coversP2: {
    en: 'It does not cover zakat al-fitr, the per-person amount due before the Eid prayer at the end of Ramadan, and it does not apply the detailed livestock tables, which count animals by head and species rather than by value. It also cannot know which school you follow, so treat the number it gives as a starting point rather than a verdict.',
    ar: 'ولا تشمل زكاة الفطر، وهي المقدار الواجب عن كل فرد قبل صلاة العيد في ختام رمضان، ولا تطبّق جداول زكاة الأنعام التفصيلية التي تُحسب بعدد الرؤوس ونوع الحيوان لا بالقيمة. كما أنها لا تعرف المذهب الذي تتبعه، فاعتبر الرقم الذي تعطيك إياه نقطة بداية لا حكمًا نهائيًا.',
  },
  ruleTitle: { en: 'The rule in plain language', ar: 'القاعدة بعبارة واضحة' },
  ruleSummary: { en: '2.5%, after a lunar year above the nisab', ar: '2.5% بعد حول قمري والمال بالغ النصاب' },
  ruleP1: {
    en: 'Zakat is due at 2.5% of qualifying wealth once two conditions are met. The first is time: the wealth must have been yours for a full lunar year — a hawl, about 354 days, not 365. The second is amount: it must sit at or above the nisab, the threshold defined by the value of a set weight of gold or of silver.',
    ar: 'تجب الزكاة بنسبة 2.5% من المال الزكوي متى تحقق شرطان. الأول الزمن: أن يمضي على المال في ملكك حول قمري كامل، أي نحو 354 يومًا لا 365. والثاني المقدار: أن يبلغ المال النصاب أو يزيد عليه، وهو الحدّ المقدَّر بقيمة وزن محدد من الذهب أو من الفضة.',
  },
  ruleP2: {
    en: 'At or above the threshold, the 2.5% applies to the whole of that wealth, not only to the part above the line. Below it, no zakat is due this year.',
    ar: 'فإذا بلغ المال النصاب أو تجاوزه وجبت نسبة 2.5% في المال كله، لا في القدر الزائد على النصاب وحده. وإن كان دونه فلا زكاة عليك هذا العام.',
  },
  countsTitle: { en: 'What counts, and what does not', ar: 'ما يدخل في الحساب وما لا يدخل' },
  countsSummary: {
    en: 'Cash, gold, shares, business stock; not your home or car',
    ar: 'النقد والذهب والأسهم وعروض التجارة؛ لا بيتك ولا سيارتك',
  },
  countsP1: {
    en: 'Zakatable wealth is broadly wealth that grows or is held as a store of value: cash, savings, receivables, gold and silver in any form, shares, accessible retirement balances, goods held for sale, and property bought to resell. What you hold for your own use is not counted — your home, your car, your furniture, your clothes and the tools of your trade.',
    ar: 'المال الزكوي في الجملة هو المال النامي أو المدّخر: النقد، والمدخرات، والديون المستحقة لك، والذهب والفضة بأي شكل كانا، والأسهم، وأرصدة التقاعد التي يمكنك التصرف فيها، والبضائع المعدّة للبيع، والعقارات المشتراة لإعادة بيعها. أما ما تقتنيه لاستعمالك الشخصي فلا يُحتسب: بيتك، وسيارتك، وأثاثك، وثيابك، وأدوات حرفتك.',
  },
  countsStrong: { en: 'Debts are the point on which scholars differ.', ar: 'والديون هي موضع الخلاف بين العلماء.' },
  countsP2: {
    en: ' Many hold that debts immediately due — this month\'s rent, an overdue bill — come off your zakatable wealth before the rate is applied. Others hold that a long-term debt such as a mortgage is not deducted in full, since setting a twenty-year liability against a single year\'s wealth would remove almost everyone from zakat, and deduct only the instalments falling due within the year. Both positions are held by serious scholars. This page does not choose between them: the calculator subtracts whatever you enter in the liabilities field, so that entry is yours to make.',
    ar: ' فكثير منهم يرون أن الديون الحالّة — كإيجار هذا الشهر أو فاتورة متأخرة — تُطرح من المال الزكوي قبل تطبيق النسبة. ويرى آخرون أن الدين طويل الأجل كالرهن العقاري لا يُطرح كاملًا، لأن مقابلة التزام يمتد عشرين عامًا بمال عام واحد تُخرج أكثر الناس من الزكاة، وإنما يُطرح منه ما يحلّ من أقساط خلال العام. وكلا القولين قال به علماء معتبرون. ولا تختار هذه الصفحة بينهما: فالحاسبة تطرح ما تُدخله في خانة الالتزامات، والقرار في ذلك لك.',
  },
  nisabUsesTitle: { en: 'The nisab this calculator uses', ar: 'النصاب الذي تعتمده هذه الحاسبة' },
  nisabUsesSummary: { en: 'The gold threshold; the silver one is lower', ar: 'نصاب الذهب؛ ونصاب الفضة أدنى منه' },
  nisabUsesP1: {
    en: 'The threshold your total is measured against is shown beside the result above, with the date the price behind it was taken. We print a dollar figure only while that price is recent enough for us to stand behind; when it is not, the price fields stay empty and the method is shown instead.',
    ar: 'يظهر النصاب الذي يُقاس عليه مجموع مالك بجانب النتيجة أعلاه، مع تاريخ السعر الذي بُني عليه. ولا نعرض مبلغًا بالدولار إلا ما دام ذلك السعر حديثًا بما يكفي لنطمئن إليه؛ فإن لم يكن كذلك بقيت خانات الأسعار فارغة وعُرضت طريقة الحساب بدلًا منه.',
  },
  nisabUsesBefore: {
    en: 'This calculator uses the gold threshold, at {gold}. The silver threshold, {silver}, works out much lower, so it brings more people into zakat, and many scholars prefer it for that reason. The ',
    ar: 'تعتمد هذه الحاسبة نصاب الذهب، وهو {gold}. أما نصاب الفضة، وهو {silver}، فأدنى منه بكثير، فيُدخل في الزكاة عددًا أكبر من الناس، ولذلك يرجّحه كثير من العلماء. وتعرض ',
  },
  nisabPage: { en: 'nisab page', ar: 'صفحة النصاب' },
  nisabUsesAfter: {
    en: ' sets out both, along with the competing weight conventions, and carries the current figures.',
    ar: ' القولين كليهما، مع تقديرات الأوزان المختلفة، والأرقام الحالية.',
  },
  exampleTitle: { en: 'A worked example', ar: 'مثال تطبيقي' },
  exampleSummary: { en: '$10,000 in savings, with $2,000 owed', ar: 'مدخرات قدرها {savings}، وعليك دين قدره {debt}' },
  exampleNote: {
    en: 'Illustrative only. The round numbers below are invented to show the arithmetic, not market data. Use the dated threshold beside the result above.',
    ar: 'للتوضيح فقط. الأرقام أدناه مفترضة لبيان طريقة الحساب، وليست أسعارًا من السوق. اعتمد النصاب المؤرّخ الظاهر بجانب النتيجة أعلاه.',
  },
  exampleP1: {
    en: 'Suppose you hold $10,000 in savings that has been with you for a full lunar year and owe $2,000 due immediately. On the view that immediately due debts are deducted, your net zakatable wealth is $8,000. If that is above the nisab that day, zakat is due: 2.5% of $8,000 is $200.',
    ar: 'لنفترض أن لديك مدخرات قدرها {savings} مضى عليها في ملكك حول قمري كامل، وعليك دين حالّ قدره {debt}. فعلى القول بطرح الديون الحالّة، يكون صافي مالك الزكوي {net}. فإن كان ذلك فوق النصاب في ذلك اليوم وجبت الزكاة: وربع العشر (2.5%) من {net} يساوي {due}.',
  },
  exampleP2: {
    en: 'On the other view of that $2,000 — that a long-term liability is not set against a single year\'s wealth — the base would be $10,000 and the amount due $250. That $50 gap is why it is worth asking someone qualified which treatment applies to you.',
    ar: 'أما على القول الآخر في هذا الدين البالغ {debt} — وهو أن الالتزام طويل الأجل لا يُقابَل بمال عام واحد — فيكون وعاء الزكاة {savings} والمقدار الواجب {due2}. وهذا الفرق البالغ {gap} هو ما يجعل سؤال أهل العلم عن الحكم الذي ينطبق عليك جديرًا بالعناية.',
  },
  zakatExplained: { en: 'Zakat explained, from the beginning', ar: 'شرح الزكاة من البداية' },
  faqTitle: { en: 'Common questions', ar: 'أسئلة شائعة' },
  disclaimer: {
    en: 'This page is general guidance, not a religious ruling. Zakat depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.',
    ar: 'هذه الصفحة إرشاد عام، وليست فتوى شرعية. فالزكاة تختلف باختلاف الأحوال، وفي كل ما يخصّ حالتك تحديدًا يُرجى سؤال عالم مؤهَّل.',
  },

  // Modal
  cannotTellTitle: { en: 'We cannot tell you yet', ar: 'لا يمكننا إخبارك بعد' },
  cannotTellSub: {
    en: 'There is no threshold to measure your total against.',
    ar: 'لا يوجد حدّ نقيس عليه مجموع مالك.',
  },
  yourNet: { en: 'Your net zakatable:', ar: 'صافي مالك الزكوي:' },
  modalNoPrice: {
    en: 'No gold price was entered, and we hold none recent enough to vouch for. Rather than substitute a price of our own and hand you a confident figure built on it, we are showing you none. Enter today’s gold price per gram above and the threshold will appear with your result.',
    ar: 'لم يُدخَل سعر للذهب، ولا نملك سعرًا حديثًا بما يكفي لنطمئن إليه. وبدلًا من أن نضع سعرًا من عندنا ونقدّم لك رقمًا يبدو موثوقًا وهو مبنيّ عليه، فإننا لا نعرض عليك أي رقم. أدخل سعر غرام الذهب اليوم في الأعلى، وسيظهر النصاب مع نتيجتك.',
  },
  modalNisabIs: {
    en: 'The nisab is {gold} of gold, or {silver} of silver, at the market price on the day you work it out.',
    ar: 'النصاب {gold}، أو {silver}، بسعر السوق في اليوم الذي تحسب فيه زكاتك.',
  },
  addPrice: { en: 'Add a price and recalculate', ar: 'أدخل سعرًا وأعد الحساب' },
  readyTitle: { en: 'Your Zakat Calculation is Ready', ar: 'نتيجة حساب زكاتك جاهزة' },
  readySub: { en: 'Here is the Zakat amount you owe', ar: 'هذا مقدار الزكاة الواجبة عليك' },
  zakatDue: { en: 'Zakat due', ar: 'الزكاة الواجبة' },
  basedOnNet: { en: 'Based on net zakatable wealth of {net}', ar: 'على أساس صافي مال زكوي قدره {net}' },
  recalculate: { en: 'Recalculate', ar: 'أعد الحساب' },
  formPrefilled: {
    en: 'The donation form opens with this amount filled in.',
    ar: 'سيُفتح نموذج التبرع وفيه هذا المبلغ.',
  },
  noZakatDue: { en: 'No Zakat Due', ar: 'لا زكاة عليك' },
  belowSub: {
    en: 'Your net zakatable wealth is below the Nisab threshold.',
    ar: 'صافي مالك الزكوي دون حدّ النصاب.',
  },
  nisabThreshold: { en: 'Nisab threshold:', ar: 'حدّ النصاب:' },
  belowP: {
    en: 'Since your wealth is below the Nisab, Zakat is not obligatory this year. You can still make a voluntary Sadaqa donation if you wish.',
    ar: 'لأن مالك دون النصاب، فلا تجب عليك الزكاة هذا العام. ويمكنك مع ذلك أن تتبرع بصدقة تطوعية إن شئت.',
  },
  sadaqaDonation: { en: 'Make a Sadaqa Donation', ar: 'تبرّع بصدقة' },

  // FAQ
  faq1Q: { en: 'How much zakat do I pay?', ar: 'كم أدفع من الزكاة؟' },
  faq1A: {
    en: 'The rate for zakat al-mal is 2.5% of the qualifying wealth you have held for a full lunar year, and it applies to the whole of that wealth rather than only to the part above the threshold. The arithmetic is simply your net qualifying total multiplied by 0.025. Produce from the land is treated differently, at 5% or 10% depending on how the crop was irrigated, and livestock is counted by head against its own tables rather than by value.',
    ar: 'مقدار زكاة المال ربع العشر (2.5%) من المال الزكوي الذي حال عليه في ملكك حول قمري كامل، ويجب في المال كله لا في القدر الزائد على النصاب وحده. والحساب بسيط: صافي مالك الزكوي مضروبًا في 0.025. أما ما تخرجه الأرض من زروع فله حكم مختلف، فزكاته 5% أو 10% بحسب طريقة سقيه، وأما الأنعام فتُحسب بعدد الرؤوس وفق جداولها الخاصة لا بقيمتها.',
  },
  faq2Q: { en: 'What counts as zakatable wealth?', ar: 'ما المال الذي تجب فيه الزكاة؟' },
  faq2A: {
    en: 'Broadly, wealth that grows or is held as a store of value: cash, money you have lent out and expect back, gold and silver in any form, shares and funds, accessible retirement balances, stock held for sale, and property bought to resell. Personal belongings are not counted, and neither is the home you live in, the car you drive or the tools you work with.',
    ar: 'هو في الجملة المال النامي أو المدّخر: النقد، والمال الذي أقرضته وتنتظر استرداده، والذهب والفضة بأي شكل كانا، والأسهم والصناديق، وأرصدة التقاعد التي يمكنك التصرف فيها، والبضائع المعدّة للبيع، والعقارات المشتراة لإعادة بيعها. أما المقتنيات الشخصية فلا تُحتسب، ولا البيت الذي تسكنه، ولا السيارة التي تركبها، ولا الأدوات التي تعمل بها.',
  },
  faq3Q: { en: 'Do I subtract my debts before calculating zakat?', ar: 'هل أطرح ديوني قبل حساب الزكاة؟' },
  faq3A: {
    en: 'Scholars differ on this, and the difference is real. Many hold that debts immediately due — this month’s rent, an overdue bill — come off your zakatable wealth before the 2.5% is applied. Others hold that a long-term debt such as a mortgage is not deducted in full, since setting a twenty-year liability against a single year’s wealth would remove almost everyone from zakat, and deduct only the instalments due within the year. We do not adjudicate between them; ask a scholar you trust.',
    ar: 'اختلف العلماء في ذلك، والخلاف حقيقي. فكثير منهم يرون أن الديون الحالّة — كإيجار هذا الشهر أو فاتورة متأخرة — تُطرح من المال الزكوي قبل تطبيق نسبة 2.5%. ويرى آخرون أن الدين طويل الأجل كالرهن العقاري لا يُطرح كاملًا، لأن مقابلة التزام يمتد عشرين عامًا بمال عام واحد تُخرج أكثر الناس من الزكاة، وإنما تُطرح الأقساط المستحقة خلال العام. ونحن لا نرجّح بين القولين، فاسأل عالمًا تثق به.',
  },
  faq4Q: { en: 'Does zakat apply to my house or my car?', ar: 'هل تجب الزكاة في بيتي أو سيارتي؟' },
  faq4A: {
    en: 'Not where they are for your own use. The home you live in, the car you drive, your furniture and your clothes are personal necessities, and the common position is that no zakat is due on them however much they are worth. The picture changes when the same asset is held for gain: a second property bought to resell is trading stock and is zakatable at its value, and scholars differ over how a building held to rent out should be treated.',
    ar: 'لا، ما دامت لاستعمالك الشخصي. فالبيت الذي تسكنه، والسيارة التي تركبها، وأثاثك، وثيابك من الحاجات الأصلية، والقول المشهور أنه لا زكاة فيها مهما بلغت قيمتها. ويختلف الأمر إذا اقتُني المال نفسه بقصد الربح: فالعقار الثاني المشترى لإعادة بيعه من عروض التجارة وتجب الزكاة في قيمته، واختلف العلماء في حكم المبنى المعدّ للإيجار.',
  },
  faq5Q: { en: 'When is zakat due?', ar: 'متى تجب الزكاة؟' },
  faq5A: {
    en: 'Zakat falls due once a full lunar year — a hawl, roughly 354 days — has passed over wealth that has stayed at or above the nisab. The date is personal to you: the anniversary of the day your wealth first reached the threshold, not a fixed date in the calendar. Many people set that anniversary in Ramadan so it is easy to remember, and paying early is widely accepted.',
    ar: 'تجب الزكاة متى مضى حول قمري كامل — أي نحو 354 يومًا — على مال بقي بالغًا النصاب أو زائدًا عليه. وموعدها خاص بك: فهو اليوم الذي يوافق، في كل عام قمري، يومَ بلوغ مالك النصاب أول مرة، لا تاريخ ثابت في التقويم. ويجعل كثير من الناس هذا الموعد في رمضان ليسهل تذكّره، وتعجيل الزكاة مقبول على نطاق واسع.',
  },
  faq6Q: { en: 'What if my wealth went up and down during the year?', ar: 'ماذا لو ارتفع مالي وانخفض خلال العام؟' },
  faq6A: {
    en: 'Fluctuation during the year does not break the hawl, so long as your wealth did not fall below the nisab. The commonly taught approach is to compare against the threshold at the start and the end of the year, ignore the peaks and troughs between, and pay 2.5% of what you actually hold on your anniversary. If your wealth did drop below the nisab and later rose above it, many scholars hold that a new lunar year begins from the day it crossed back.',
    ar: 'تقلّب المال خلال العام لا يقطع الحول ما دام لم ينزل عن النصاب. والطريقة التي تُدرَّس عادةً أن يُقارَن المال بالنصاب في أول الحول وآخره، دون التفات إلى ما بينهما من ارتفاع وانخفاض، ثم تُخرج 2.5% مما تملكه فعلًا في يوم وجوب زكاتك. أما إن نزل مالك عن النصاب ثم عاد فارتفع فوقه، فكثير من العلماء يرون أن حولًا جديدًا يبدأ من يوم عودته إلى النصاب.',
  },

  // Structured data
  webAppDescription: {
    en: 'A free zakat calculator that totals your cash, gold, silver, investments and business assets, compares them against the current nisab, and works out the 2.5% due.',
    ar: 'حاسبة زكاة مجانية تجمع نقدك وذهبك وفضتك واستثماراتك وأصول تجارتك، وتقارنها بالنصاب الحالي، وتحسب الـ2.5% الواجبة.',
  },
  howToName: { en: 'How to calculate your zakat', ar: 'كيف تحسب زكاتك' },
  howToDescription: {
    en: 'Four steps from your assets to the amount of zakat due, using the current nisab threshold.',
    ar: 'أربع خطوات من أصولك إلى مقدار الزكاة الواجبة، باستخدام حدّ النصاب الحالي.',
  },
  step1Name: { en: 'Add up your zakatable assets', ar: 'اجمع أصولك الزكوية' },
  step1Text: {
    en: 'Cash, savings, gold, silver, investments held for resale, and business stock.',
    ar: 'النقد، والمدخرات، والذهب، والفضة، والاستثمارات المقتناة لإعادة البيع، وعروض التجارة.',
  },
  step2Name: { en: 'Subtract what you owe', ar: 'اطرح ما عليك' },
  step2Text: { en: 'Immediate debts that are due.', ar: 'الديون الحالّة المستحقة.' },
  step3Name: { en: 'Compare the total against the nisab', ar: 'قارن المجموع بالنصاب' },
  step4Name: { en: 'Pay 2.5% if you are at or above it', ar: 'أخرج 2.5% إن بلغت النصاب أو تجاوزته' },
  step4Text: { en: 'And if you are below, no zakat is due this year.', ar: 'وإن كنت دونه فلا زكاة عليك هذا العام.' },
})

/**
 * The price fields are `<input type="number" step="0.01">`, and the snapshot
 * carries four decimals. A value like 95.1234 is a stepMismatch, so the browser
 * refuses to submit the form and the handler never runs — on the one path that
 * only exists when we *do* hold a live price. Rounding to cents rather than
 * loosening the step keeps the field validating what it is there to validate;
 * a hundredth of a cent per gram is far below the precision anyone reads off
 * this form, and the user can still type a finer figure if they want one.
 */
const toCents = (price: number) => Math.round(price * 100) / 100

const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const ZakatCalculator = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [result, setResult] = useState<ZakatResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [nisabLoaded, setNisabLoaded] = useState(false)
  const navigate = useNavigate()

  // English keeps its original formatters byte for byte; Arabic goes through
  // the shared Intl helpers (Arabic text, Western digits).
  const usd = (n: number) => (locale === 'en' ? formatUSD(n) : fmt.money(Math.round(n * 100), { decimals: true }))
  const usdWhole = (n: number) => (locale === 'en' ? formatUsd(n) : fmt.money(Math.round(n) * 100))
  const num = (n: number | null) => (n === null ? null : locale === 'en' ? String(n) : fmt.number(n))
  const asOfDate = (iso: string | null) => (locale === 'en' ? formatNisabDate(iso) : fmt.date(iso, 'long'))

  // No price defaults. A field we cannot fill honestly starts empty.
  const { register, handleSubmit, watch, reset, setValue } = useForm<ZakatCalculation>({
    defaultValues: {
      liabilities: 0,
      cash: 0,
      receivables: 0,
      stocks: 0,
      retirement: 0,
      gold_weight: 0,
      silver_weight: 0,
      business_goods: 0,
      agriculture_value: 0,
      investment_property: 0,
      other_valuables: 0,
      livestock: 0,
      other_assets: 0,
    },
  })

  useEffect(() => {
    let cancelled = false
    void fetchNisab().then((snapshot) => {
      if (cancelled) return
      setNisab(snapshot)
      setNisabLoaded(true)
      // Seed the price inputs only from a figure we can vouch for. Falling
      // back to a hardcoded price is how this page used to produce confident
      // numbers from a guess.
      if (hasUsableFigure(snapshot) && snapshot) {
        setValue('gold_price_per_gram', toCents(snapshot.gold_price_per_gram_usd as number))
        setValue('silver_price_per_gram', toCents(snapshot.silver_price_per_gram_usd as number))
      }
    })
    return () => {
      cancelled = true
    }
  }, [setValue])

  // The result dialog closes on Escape, like every other dialog on the site.
  useEffect(() => {
    if (!showResultModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResultModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showResultModal])

  // The single gate on printing money anywhere on this page.
  const showFigure = nisabLoaded && hasUsableFigure(nisab)

  const goldPrice = watch('gold_price_per_gram')
  const hasGoldPrice = typeof goldPrice === 'number' && Number.isFinite(goldPrice) && goldPrice > 0

  // The weights come from the /api/nisab snapshot, which is the one definition
  // of them; they survive staleness, because the method never expires. Only an
  // unreachable endpoint leaves us without them, and then the page says the
  // method in words rather than falling back on a constant of its own.
  const goldGrams = nisab?.gold_grams ?? null
  const silverGrams = nisab?.silver_grams ?? null
  const currentNisab = hasGoldPrice && goldGrams !== null ? goldGrams * goldPrice : null
  const usingLivePrice =
    showFigure && Boolean(nisab) && goldPrice === nisab?.gold_price_per_gram_usd

  const year = currentYear()

  // The masses are stated as ours, so they are read from the snapshot rather
  // than written into the prose: nisab.gold_grams is a setting precisely so the
  // foundation can follow the other convention without a code change, and a
  // hardcoded "87.48" here would contradict the figure the moment it did. They
  // survive staleness — the method never expires — so nothing gates them.
  const goldGramsText = goldGrams !== null ? t(M.goldGramsText, { grams: num(goldGrams) }) : t(M.goldGramsWords)
  const silverGramsText = silverGrams !== null ? t(M.silverGramsText, { grams: num(silverGrams) }) : t(M.silverGramsWords)
  const massSentence =
    goldGrams !== null && silverGrams !== null
      ? t(M.massSentence, { gold: num(goldGrams), silver: num(silverGrams) })
      : t(M.massSentenceWords)

  const reseedPrices = () => {
    if (hasUsableFigure(nisab) && nisab) {
      setValue('gold_price_per_gram', toCents(nisab.gold_price_per_gram_usd as number))
      setValue('silver_price_per_gram', toCents(nisab.silver_price_per_gram_usd as number))
    }
  }

  const onSubmit = async (data: ZakatCalculation) => {
    setSubmitError(null)

    // An empty price field is not a price of zero. Holding metal but sending a
    // blank price would silently drop it out of the total.
    const missingGoldPrice = data.gold_weight > 0 && !(data.gold_price_per_gram > 0)
    const missingSilverPrice = data.silver_weight > 0 && !(data.silver_price_per_gram > 0)
    if (missingGoldPrice || missingSilverPrice) {
      setSubmitError(t(M.missingPrice))
      return
    }

    // Blank number inputs read back as NaN; send zero rather than null.
    const payload: ZakatCalculation = { ...data }
    ;(Object.keys(payload) as (keyof ZakatCalculation)[]).forEach((key) => {
      if (!Number.isFinite(payload[key])) payload[key] = 0
    })

    setIsCalculating(true)
    try {
      const calculationResult = await donationsAPI.calculateZakat(payload)
      setResult(calculationResult)
      setShowResultModal(true)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (Array.isArray(detail)) {
        setSubmitError(t(M.nonNegative))
      } else {
        setSubmitError(detail || t(M.calcFailed))
      }
    } finally {
      setIsCalculating(false)
    }
  }

  // Field definition: `unit` distinguishes USD ($) from grams (g)
  type FieldDef = { name: keyof ZakatCalculation; label: Message; placeholder: string; unit: 'usd' | 'grams' }

  const priceHint = t(M.priceHint)

  // Assets first, then what you owe: the order people think in. (Liabilities
  // used to come first.) Field names are unchanged.
  const formSections: { title: Message; icon: typeof TrendingUp; note?: Message | null; fields: FieldDef[] }[] = [
    {
      title: M.secCash,
      icon: DollarSign,
      fields: [
        { name: 'cash', label: M.fCash, placeholder: '0.00', unit: 'usd' },
        { name: 'receivables', label: M.fReceivables, placeholder: '0.00', unit: 'usd' },
        { name: 'stocks', label: M.fStocks, placeholder: '0.00', unit: 'usd' },
        { name: 'retirement', label: M.fRetirement, placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: M.secMetals,
      icon: Calculator,
      note: showFigure ? null : M.metalsNote,
      fields: [
        { name: 'gold_weight', label: M.fGoldWeight, placeholder: '0', unit: 'grams' },
        { name: 'gold_price_per_gram', label: M.fGoldPrice, placeholder: showFigure ? '0.00' : priceHint, unit: 'usd' },
        { name: 'silver_weight', label: M.fSilverWeight, placeholder: '0', unit: 'grams' },
        { name: 'silver_price_per_gram', label: M.fSilverPrice, placeholder: showFigure ? '0.00' : priceHint, unit: 'usd' },
      ],
    },
    {
      title: M.secBusiness,
      icon: TrendingUp,
      fields: [
        { name: 'business_goods', label: M.fBusinessGoods, placeholder: '0.00', unit: 'usd' },
        { name: 'agriculture_value', label: M.fAgriculture, placeholder: '0.00', unit: 'usd' },
        { name: 'investment_property', label: M.fInvestmentProperty, placeholder: '0.00', unit: 'usd' },
        { name: 'livestock', label: M.fLivestock, placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: M.secOther,
      icon: DollarSign,
      fields: [
        { name: 'other_valuables', label: M.fOtherValuables, placeholder: '0.00', unit: 'usd' },
        { name: 'other_assets', label: M.fOtherAssets, placeholder: '0.00', unit: 'usd' },
      ],
    },
    {
      title: M.secLiabilities,
      icon: TrendingUp,
      fields: [
        { name: 'liabilities', label: M.fLiabilities, placeholder: '0.00', unit: 'usd' },
      ],
    },
  ]

  const showDonateButton = result && result.meets_nisab === true && result.total >= 1

  /**
   * The gate on printing a threshold beside a result.
   *
   * `showFigure` governs the figures this page sources itself; a result is
   * gated on the result's own field instead, because the threshold there may
   * rest on a price the user typed — a price we can attribute, even though it
   * is not ours. What it can never rest on is a price nobody supplied: the
   * backend returns a null threshold and a null verdict for that, and the two
   * branches below become three so the page states the method rather than an
   * invented number.
   */
  const resultThreshold = result != null && result.nisab_threshold != null ? result.nisab_threshold : null

  const faqs = [
    { question: t(M.faq1Q), answer: t(M.faq1A) },
    { question: t(M.faq2Q), answer: t(M.faq2A) },
    { question: t(M.faq3Q), answer: t(M.faq3A) },
    { question: t(M.faq4Q), answer: t(M.faq4A) },
    { question: t(M.faq5Q), answer: t(M.faq5A) },
    { question: t(M.faq6Q), answer: t(M.faq6A) },
  ]

  const prefix = LOCALES[locale].prefix
  const jsonLd = [
    getBreadcrumbJsonLd([
      { name: t(C.home), path: prefix || '/' },
      { name: t(C.zakatCalculator), path: `${prefix}/zakat-calculator` },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: t(C.zakatCalculator),
      description: t(M.webAppDescription),
      path: `${prefix}/zakat-calculator`,
    }),
    getHowToJsonLd({
      name: t(M.howToName),
      description: t(M.howToDescription),
      steps: [
        { name: t(M.step1Name), text: t(M.step1Text) },
        { name: t(M.step2Name), text: t(M.step2Text) },
        { name: t(M.step3Name), text: massSentence },
        { name: t(M.step4Name), text: t(M.step4Text) },
      ],
    }),
  ]

  const title = t(M.title, { year })

  // The invented round numbers of the worked example. English prints them as
  // written in its message; Arabic formats the same figures.
  const exampleVars = {
    savings: fmt.money(1000000),
    debt: fmt.money(200000),
    net: fmt.money(800000),
    due: fmt.money(20000),
    due2: fmt.money(25000),
    gap: fmt.money(5000),
  }

  const breakdown: { label: Message; value: number }[] = result
    ? [
        { label: M.wealthZakat, value: result.wealth },
        { label: M.goldZakat, value: result.gold },
        { label: M.silverZakat, value: result.silver },
        { label: M.businessZakat, value: result.business_goods },
        { label: M.agricultureZakat, value: result.agriculture },
      ]
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={title}
        description={t(M.seoDescription)}
        canonicalPath="/zakat-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={title}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calculator Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {formSections.map((section) => (
                  <div key={section.title.en} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="flex items-center mb-6">
                      <section.icon className="w-5 h-5 text-primary-600 me-3" aria-hidden="true" />
                      <h2 className="text-lg font-semibold text-gray-900">{t(section.title)}</h2>
                    </div>

                    {section.note && (
                      <div className="alert-warning mb-6">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <p>{t(section.note)}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.fields.map((field) => (
                        <div key={field.name}>
                          <label htmlFor={`zakat-${field.name}`} className="label">
                            {t(field.label)}
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 text-sm">
                                {field.unit === 'usd' ? '$' : t(M.unitGrams)}
                              </span>
                            </div>
                            <input
                              id={`zakat-${field.name}`}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={field.placeholder}
                              {...register(field.name, { valueAsNumber: true, min: 0 })}
                              className="input-field ps-7"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {submitError && (
                  <div className="alert-error" role="alert">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="submit"
                    disabled={isCalculating}
                    className="btn-primary flex-1 gap-2"
                  >
                    {isCalculating ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        {t(M.calculating)}
                      </>
                    ) : (
                      <>
                        <Calculator className="w-5 h-5" aria-hidden="true" />
                        {t(M.calculateZakat)}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      reset()
                      reseedPrices()
                      setResult(null)
                      setSubmitError(null)
                      setShowResultModal(false)
                    }}
                    className="btn-secondary flex-1"
                  >
                    {t(M.resetCalculator)}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* What the total is being measured against — shown above the
                result, so the threshold is never implicit. */}
            <div className="card">
              <div className="flex items-center mb-4">
                <Scale className="w-5 h-5 text-primary-600 me-3" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-gray-900">{t(M.comparedTitle)}</h2>
              </div>

              {!nisabLoaded && (
                <p className="text-sm text-gray-700">{t(M.checking)}</p>
              )}

              {nisabLoaded && (
                <div className="space-y-3 text-sm text-gray-700">
                  {currentNisab !== null ? (
                    <p>
                      {t(M.comparedGold, { nisab: usd(currentNisab), grams: num(goldGrams), price: usd(goldPrice) })}
                    </p>
                  ) : goldGrams !== null ? (
                    <p>
                      {t(M.noGoldPrice, { gold: num(goldGrams), silver: num(silverGrams) })}
                    </p>
                  ) : (
                    <p>
                      {t(M.noFigures)}
                    </p>
                  )}

                  {usingLivePrice && (
                    <p>{t(M.livePrices, { date: asOfDate(nisab?.as_of ?? null) })}</p>
                  )}

                  {nisabLoaded && !usingLivePrice && hasGoldPrice && (
                    <p>{t(M.yourPrice)}</p>
                  )}

                  {showFigure && nisab && (
                    <p>
                      {t(M.silverAlt, { amount: usdWhole(nisab.nisab_silver_usd as number), grams: num(nisab.silver_grams) })}
                    </p>
                  )}

                  <Link to="/nisab" className="link inline-flex items-center">
                    {t(M.howWorkedOut)}
                    <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>

            {/* Results */}
            {result && (
              <div className="card-tinted" aria-live="polite">
                <div className="mb-6">
                  <h2 className="text-xl font-heading font-bold text-gray-900 mb-1">{t(M.resultTitle)}</h2>
                  <p className="text-gray-600 text-sm">{t(M.resultSub)}</p>
                </div>

                {/* Nisab status banner */}
                {resultThreshold === null ? (
                  <div className="alert-warning mb-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">{t(M.noThresholdTitle)}</p>
                      <p>
                        {t(M.noThresholdBody, { net: usd(result.net_zakatable), gold: goldGramsText, silver: silverGramsText })}
                      </p>
                    </div>
                  </div>
                ) : !result.meets_nisab ? (
                  <div className="alert-warning mb-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">{t(M.belowTitle)}</p>
                      <p>
                        {t(M.belowBody, { net: usd(result.net_zakatable), nisab: usd(resultThreshold) })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="alert-success mb-4">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold mb-1">{t(M.aboveTitle)}</p>
                      <p>
                        {t(M.aboveBody, { net: usd(result.net_zakatable), nisab: usd(resultThreshold) })}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  {/* No rate in the agriculture label: the rate on produce is
                      5% or 10% depending on irrigation (see the FAQ). */}
                  {breakdown.map((row) => (
                    <div key={row.label.en} className="flex justify-between items-center py-2 border-b border-primary-100">
                      <span className="text-gray-700">{t(M.withColon, { label: t(row.label) })}</span>
                      <span className="font-semibold text-gray-900">{usd(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-4 bg-white rounded-lg px-4 mt-4">
                    <span className="text-base font-bold text-gray-900">{t(M.totalDue)}</span>
                    <span className="text-2xl font-bold text-primary-700">{usd(result.total)}</span>
                  </div>
                </div>

                {/* While the result dialog is open it carries the same link;
                    one at a time, so there is never a hidden duplicate. */}
                {showDonateButton && !showResultModal && (
                  <div className="mt-6">
                    <Link
                      to={`/donate?zakat_amount=${result.total.toFixed(2)}`}
                      className="btn-primary w-full gap-2"
                    >
                      {t(M.payZakatNow)}
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------
            The content. Written to the editorial rules: it states what is
            agreed, names what is not, and rules on nothing. Folded under the
            tool; the text stays in the DOM (and in the FAQ schema).
           ------------------------------------------------------------------ */}
        <div className="max-w-4xl mt-12 sm:mt-16 space-y-8">
          <section aria-labelledby="zakat-how-it-works" className="space-y-3">
            <h2 id="zakat-how-it-works" className={HEADING}>{t(M.howItWorks)}</h2>

            <Disclosure
              title={t(M.coversTitle)}
              summary={t(M.coversSummary)}
            >
              <p className={PROSE}>
                {t(M.coversP1)}
              </p>
              <p className={PROSE}>
                {t(M.coversP2)}
              </p>
            </Disclosure>

            <Disclosure title={t(M.ruleTitle)} summary={t(M.ruleSummary)}>
              <p className={PROSE}>
                {t(M.ruleP1)}
              </p>
              <p className={PROSE}>
                {t(M.ruleP2)}
              </p>
            </Disclosure>

            <Disclosure
              title={t(M.countsTitle)}
              summary={t(M.countsSummary)}
            >
              <p className={PROSE}>
                {t(M.countsP1)}
              </p>
              <p className={PROSE}>
                <strong>{t(M.countsStrong)}</strong>{t(M.countsP2)}
              </p>
            </Disclosure>

            <Disclosure title={t(M.nisabUsesTitle)} summary={t(M.nisabUsesSummary)}>
              <p className={PROSE}>
                {t(M.nisabUsesP1)}
              </p>
              <p className={PROSE}>
                {t(M.nisabUsesBefore, { gold: goldGramsText, silver: silverGramsText })}
                <Link to="/nisab" className="text-primary-700 underline hover:text-primary-800">
                  {t(M.nisabPage)}
                </Link>
                {t(M.nisabUsesAfter)}
              </p>
            </Disclosure>

            {/* A worked example, withheld whenever the page is withholding real
                money. We do not show invented arithmetic on the same screen where
                we have just declined to show a figure we could not vouch for. It
                is measured against the gold nisab, like the calculator. */}
            {showFigure && (
              <Disclosure title={t(M.exampleTitle)} summary={t(M.exampleSummary, exampleVars)}>
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <Info className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    {t(M.exampleNote)}
                  </p>
                </div>
                <p className={PROSE}>
                  {t(M.exampleP1, exampleVars)}
                </p>
                <p className={PROSE}>
                  {t(M.exampleP2, exampleVars)}
                </p>
              </Disclosure>
            )}

            <Link to="/zakat-education" className="link inline-flex items-center pt-1">
              {t(M.zakatExplained)}
              <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
            </Link>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema, one closed
              item per question. */}
          <section aria-labelledby="zakat-faq">
            <h2 id="zakat-faq" className={HEADING}>{t(M.faqTitle)}</h2>
            <div className="card py-1 sm:py-1 divide-y divide-gray-200">
              {faqs.map((faq) => (
                <Disclosure key={faq.question} variant="plain" title={faq.question}>
                  <p className={PROSE}>{faq.answer}</p>
                </Disclosure>
              ))}
            </div>
          </section>

          {/* The disclaimer — stays open */}
          <section className="alert-warning block p-6 sm:p-8 text-base">
            <p className="text-amber-900 leading-relaxed">
              {t(M.disclaimer)}
            </p>
          </section>
        </div>
      </div>

      {/* Zakat Result Modal */}
      {showResultModal && result && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowResultModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zakat-result-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end p-4 pb-0">
              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="p-1 -m-1 rounded text-gray-500 hover:text-gray-700"
                aria-label={t(C.close)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6 -mt-4">
              {/* Three states, not two. Without a price there is no threshold,
                  and "No Zakat Due" would be a verdict we have not reached. */}
              {resultThreshold === null ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
                      <Scale className="w-6 h-6 text-amber-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      {t(M.cannotTellTitle)}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {t(M.cannotTellSub)}
                    </p>
                  </div>

                  <div className="alert-warning block mb-6">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{t(M.yourNet)}</span>
                      <span className="font-semibold">{usd(result.net_zakatable)}</span>
                    </div>
                    <p className="mt-3">
                      {t(M.modalNoPrice)}
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    {t(M.modalNisabIs, { gold: goldGramsText, silver: silverGramsText })}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-primary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      {t(M.addPrice)}
                    </button>
                    <Link
                      to="/nisab"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      {t(M.howWorkedOut)}
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                  </div>
                </>
              ) : result.meets_nisab && result.total >= 1 ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-50 rounded-full mb-4">
                      <CheckCircle className="w-6 h-6 text-primary-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      {t(M.readyTitle)}
                    </h2>
                    <p className="text-sm text-gray-600">{t(M.readySub)}</p>
                  </div>

                  {/* Big amount. The label is deliberately not "Total Zakat
                      Due": that phrase belongs to the result card behind the
                      dialog, and the two must not both match one query. */}
                  <div className="card-tinted mb-6 text-center">
                    <p className="text-sm font-medium text-primary-700 mb-1 uppercase tracking-wide">
                      {t(M.zakatDue)}
                    </p>
                    <p className="text-5xl font-bold text-primary-700 mb-1">
                      {usd(result.total)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {t(M.basedOnNet, { net: usd(result.net_zakatable) })}
                    </p>
                  </div>

                  {/* Compact breakdown */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-gray-700">
                      {breakdown.map((row) =>
                        row.value > 0 ? (
                          <Fragment key={row.label.en}>
                            <span>{t(row.label)}</span>
                            <span className="text-end font-medium">{usd(row.value)}</span>
                          </Fragment>
                        ) : null,
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      to={`/donate?zakat_amount=${result.total.toFixed(2)}`}
                      onClick={() => setShowResultModal(false)}
                      className="btn-primary flex-1 gap-2"
                    >
                      {t(M.payZakatNow)}
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      {t(M.recalculate)}
                    </button>
                  </div>

                  <p className="text-center text-xs text-gray-500 mt-4">
                    {t(M.formPrefilled)}
                  </p>
                </>
              ) : (
                <>
                  {/* Below-Nisab state */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
                      <AlertCircle className="w-6 h-6 text-amber-700" aria-hidden="true" />
                    </div>
                    <h2 id="zakat-result-title" className="text-2xl font-heading font-bold text-gray-900 mb-2">
                      {t(M.noZakatDue)}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {t(M.belowSub)}
                    </p>
                  </div>

                  <div className="alert-warning block mb-6">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{t(M.yourNet)}</span>
                      <span className="font-semibold">{usd(result.net_zakatable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">{t(M.nisabThreshold)}</span>
                      <span className="font-semibold">{usd(resultThreshold)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    {t(M.belowP)}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResultModal(false)
                        navigate('/donate')
                      }}
                      className="btn-primary flex-1 gap-2"
                    >
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                      {t(M.sadaqaDonation)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResultModal(false)}
                      className="btn-secondary flex-1 gap-2"
                    >
                      <RotateCcw className="w-5 h-5" aria-hidden="true" />
                      {t(M.recalculate)}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ZakatCalculator
