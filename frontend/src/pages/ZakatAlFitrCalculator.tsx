/**
 * /zakat-al-fitr-calculator — the per-person charity due before the Eid prayer,
 * plus the content that makes the page findable.
 *
 * The calculator itself is unchanged: household size, a staple food price you
 * supply, and one sa' per head. What is new around it is the content, written
 * to the same editorial rules as /nisab and /zakat-calculator — it states what
 * is agreed, names what is not, and rules on nothing.
 *
 * The worked example is gated on `hasUsableFigure` like every other worked
 * example on this site. The figures the calculator produces are not gated,
 * because they are arithmetic on a price the visitor typed in, not a figure
 * this site is vouching for.
 */
import { useEffect, useState } from 'react'
import { Info, AlertCircle, DollarSign, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import PageHeader from '../components/ui/PageHeader'
import Disclosure from '../components/ui/Disclosure'
import { fetchNisab, hasUsableFigure, type Nisab as NisabData } from '../utils/nisabApi'
import {
  currentYear,
  getBreadcrumbJsonLd,
  getFaqJsonLd,
  getWebApplicationJsonLd,
  getHowToJsonLd,
} from '../utils/seo'
import { defineMessages, useFormat, useLocale, useT, LOCALES } from '../i18n'
import { C } from '../i18n/common'

const HEADING = 'text-2xl font-heading font-bold text-gray-900 mb-4'
const PROSE = 'text-gray-700 leading-relaxed'

const M = defineMessages({
  title: { en: 'Zakat al-Fitr {year} — How Much to Pay and When', ar: 'زكاة الفطر {year}: مقدارها ووقت إخراجها' },
  seoDescription: {
    en: 'Zakat al-Fitr is one sa’ of staple food per person, due before the Eid prayer. Work out what your household owes, and see where scholars differ on paying its value in cash.',
    ar: 'زكاة الفطر صاع من القوت الغالب عن كل فرد، تُخرج قبل صلاة العيد. احسب ما يجب على أسرتك، وتعرّف على اختلاف العلماء في إخراج قيمتها نقدًا.',
  },
  lead: {
    en: 'A measure of staple food for every person in the household, given before the Eid prayer at the end of Ramadan.',
    ar: 'مقدار من القوت الغالب عن كل فرد من أفراد الأسرة، يُخرج قبل صلاة العيد في ختام رمضان.',
  },
  invalidHousehold: { en: 'Please enter a valid household size', ar: 'يُرجى إدخال عدد صحيح لأفراد الأسرة' },

  // Form
  formTitle: { en: 'Calculate your Zakat al-Fitr', ar: 'احسب زكاة فطرك' },
  householdLabel: { en: 'Household Size (Number of People)', ar: 'عدد أفراد الأسرة' },
  householdHelp: {
    en: 'Include yourself and all dependants (spouse, children, elderly parents, etc.)',
    ar: 'احسب نفسك وجميع من تعولهم (الزوج أو الزوجة، والأولاد، والوالدان المسنّان، وغيرهم)',
  },
  methodLegend: { en: 'Payment Method', ar: 'طريقة الإخراج' },
  methodMoney: { en: 'Monetary Payment (the value of the food, in cash)', ar: 'نقدًا (قيمة الطعام بالمال)' },
  methodFood: { en: 'Food (staple food such as wheat, rice or dates)', ar: 'طعامًا (من القوت الغالب كالقمح أو الأرز أو التمر)' },
  methodHelp: {
    en: 'Scholars differ on whether the value may be paid in place of the food. This choice is yours to make; the calculator shows both the measure and the value either way.',
    ar: 'اختلف العلماء في جواز إخراج القيمة بدلًا من الطعام. والاختيار لك، وتعرض الحاسبة المقدار والقيمة معًا في الحالتين.',
  },
  priceLabel: { en: 'Price of Staple Food per Kilogram (in USD)', ar: 'سعر الكيلوغرام من القوت الغالب (بالدولار الأمريكي)' },
  priceHelp: {
    en: 'The price you pay locally for a staple food — wheat, rice, dates. We do not supply one, because it is a local figure and only you know it.',
    ar: 'السعر الذي تدفعه محليًا للقوت الغالب، كالقمح أو الأرز أو التمر. ولا نقترح سعرًا، لأنه رقم محلي لا يعرفه غيرك.',
  },
  calculate: { en: 'Calculate Zakat al-Fitr', ar: 'احسب زكاة الفطر' },

  // Result
  resultTitle: { en: 'Your Zakat al-Fitr Calculation', ar: 'نتيجة حساب زكاة الفطر' },
  householdSize: { en: 'Household Size', ar: 'عدد أفراد الأسرة' },
  perPerson: { en: 'Per Person', ar: 'عن كل فرد' },
  totalAmount: { en: 'Total Amount', ar: 'المبلغ الإجمالي' },
  kg: { en: '{kg} kg', ar: '{kg} كغ' },
  orAmount: { en: 'or {amount}', ar: 'أو {amount}' },
  kgTotal: { en: '({kg} kg total)', ar: '(الإجمالي {kg} كغ)' },
  summary: { en: 'Summary', ar: 'الخلاصة' },
  summaryIntro: { en: 'For a household of {household}, your Zakat al-Fitr is:', ar: 'لأسرة من {household}، تبلغ زكاة الفطر:' },
  ofStaple: { en: ' of staple food ({perPerson} kg × {household})', ar: ' من القوت الغالب ({perPerson} كغ × {household})' },
  atYourPrice: { en: ' at the food price you entered', ar: ' بحسب سعر القوت الذي أدخلته' },
  saNote: {
    en: 'This works from a sa’ of 2.75 kg — the middle of the 2.5–3 kg range — and from the food price you supplied, not a price of ours.',
    ar: 'يعتمد هذا الحساب على صاع مقداره 2.75 كغ، وهو وسط المدى بين 2.5 و3 كغ، وعلى سعر القوت الذي أدخلته أنت، لا على سعر من عندنا.',
  },
  calculateAgain: { en: 'Calculate Again', ar: 'احسب من جديد' },

  // Timing
  deadlineTitle: { en: 'When it has to be paid', ar: 'متى يجب إخراجها' },
  deadlineBefore: { en: 'It must reach recipients ', ar: 'يجب أن تصل إلى مستحقيها ' },
  deadlineStrong: { en: 'before the Eid prayer', ar: 'قبل صلاة العيد' },
  deadlineAfter: {
    en: '; after the prayer it counts as ordinary charity. Give two or three days before Eid: most charities close collection a day or so early.',
    ar: '، فإن أُخرجت بعد الصلاة عُدّت صدقة عادية. أخرجها قبل العيد بيومين أو ثلاثة، فأكثر الجمعيات الخيرية تُغلق باب الاستلام قبل العيد بيوم أو نحوه.',
  },

  // Explanations
  learnTitle: { en: 'How Zakat al-Fitr works', ar: 'زكاة الفطر: ما ينبغي أن تعرفه' },
  whatTitle: { en: 'What Zakat al-Fitr is', ar: 'ما زكاة الفطر' },
  whatSummary: { en: 'A food measure per person, due before Eid', ar: 'مقدار من الطعام عن كل فرد، يُخرج قبل العيد' },
  whatP1: {
    en: 'Zakat al-Fitr — often called fitrana or sadaqat al-fitr — is a small charge that falls due at the end of Ramadan, and it works quite differently from the annual zakat on wealth. It is not a percentage of what you own, it is not tied to a lunar year of ownership, and it is not measured against the nisab. It is a fixed measure of staple food, owed once, for every person in the household.',
    ar: 'زكاة الفطر — وتُسمّى أيضًا صدقة الفطر أو «الفطرة» — صدقة يسيرة تجب في ختام رمضان، وتختلف كثيرًا عن زكاة المال السنوية. فهي ليست نسبة مما تملك، ولا يُشترط لها حولان الحول، ولا تُقاس على النصاب. بل هي مقدار ثابت من القوت الغالب، يُخرج مرة واحدة عن كل فرد من أفراد الأسرة.',
  },
  whatP2: {
    en: 'Because it is a per-person obligation, the size of your family determines the amount far more than the size of your savings does. It is due from anyone who has food beyond what their household needs for the day of Eid and the night before it, which brings in a great many people who owe no zakat on wealth at all. Its purpose is plain enough: it is meant to reach a poor family in time for them to eat well on the morning of Eid rather than at some point afterwards.',
    ar: 'ولأنها واجبة عن كل فرد، فإن عدد أفراد أسرتك هو الذي يحدد مقدارها أكثر بكثير مما تحدده مدخراتك. وتجب على كل من كان عنده طعام زائد عن حاجة أهل بيته يوم العيد وليلته، وبذلك تشمل كثيرًا من الناس الذين لا تجب عليهم زكاة المال أصلًا. والغاية منها واضحة: أن تصل إلى الأسرة الفقيرة في الوقت المناسب لتطعم طعامًا طيبًا صباح العيد، لا في وقت لاحق.',
  },
  howMuchTitle: { en: 'How much is due', ar: 'مقدارها' },
  howMuchSummary: { en: 'One sa’, about 2.5–3 kg of staple food', ar: 'صاع واحد، أي نحو 2.5 إلى 3 كغ من القوت الغالب' },
  howMuchP1: {
    en: 'The measure is one sa’ per person. A sa’ is a volume measure from the prophetic period — four times a mudd, which is roughly two cupped handfuls — and converting it into modern weight depends on what you are measuring, since a sa’ of dates and a sa’ of wheat do not weigh the same. That is why you will see it given as a range rather than a single number: between about 2.5 and 3 kilograms of staple food is the usual conversion, and the calculator above works from the middle of that range.',
    ar: 'المقدار صاع واحد عن كل فرد. والصاع مكيال من عهد النبي ﷺ، يساوي أربعة أمداد، والمُدّ ملء الكفّين المجموعتين تقريبًا. وتحويله إلى وزن حديث يختلف باختلاف ما يُكال، إذ لا يتساوى وزن صاع من التمر وصاع من القمح. ولهذا تجده مذكورًا بمدى لا برقم واحد: فالتحويل المعتاد ما بين 2.5 و3 كيلوغرامات تقريبًا من القوت الغالب، والحاسبة أعلاه تعتمد وسط هذا المدى.',
  },
  howMuchP2: {
    en: 'The staple is whatever people actually eat where you live: wheat, rice, barley, dates, raisins, maize. There is no requirement to send a particular grain across the world, and nothing is gained by giving a food nobody in the area cooks with.',
    ar: 'والقوت الغالب هو ما يأكله الناس فعلًا في بلدك: القمح، أو الأرز، أو الشعير، أو التمر، أو الزبيب، أو الذرة. ولا يُشترط إرسال حبوب بعينها إلى الطرف الآخر من العالم، ولا فائدة في إعطاء طعام لا يطبخه أحد في تلك المنطقة.',
  },
  foodOrMoneyTitle: { en: 'Food, or the money instead?', ar: 'طعامًا أم نقدًا؟' },
  foodOrMoneySummary: { en: 'Scholars differ; we collect cash', ar: 'اختلف العلماء؛ ونحن نجمعها نقدًا' },
  foodOrMoneyStrong: {
    en: 'This is the point on which scholars genuinely differ.',
    ar: 'هذه هي المسألة التي اختلف فيها العلماء اختلافًا حقيقيًا.',
  },
  foodOrMoneyP1: {
    en: ' Many hold that the value may be paid in cash rather than in grain: the obligation exists to meet a need on the day of Eid, money meets that need more flexibly than a sack of rice, and a family that already has rice may need something else entirely. This is the position most commonly associated with the Hanafi school, and it is how most charities, including this one, are set up to collect.',
    ar: ' فكثير منهم يرون جواز إخراج القيمة نقدًا بدلًا من الحبوب: لأن المقصود سدّ الحاجة يوم العيد، والمال يسدّها بمرونة أكبر من كيس أرز، وقد تحتاج أسرة عندها أرز إلى شيء آخر تمامًا. وهذا القول هو الأشهر نسبةً إلى المذهب الحنفي، وعليه تقوم أكثر الجمعيات الخيرية، ومنها جمعيتنا، في جمع زكاة الفطر.',
  },
  foodOrMoneyP2: {
    en: 'Other scholars hold that the obligation was specified as food and should be discharged as food. On this view the measure is not incidental to the ruling but part of it, and paying the value substitutes something for what was actually prescribed. Both positions have substantial support behind them, and this page does not choose between them. The calculator above shows you the measure in kilograms and the value in dollars side by side, so you can act on whichever position you follow.',
    ar: 'ويرى علماء آخرون أن الواجب نُصّ عليه طعامًا فيُخرج طعامًا. فالمقدار على هذا القول ليس أمرًا عارضًا في الحكم بل جزء منه، وإخراج القيمة استبدال لشيء بغير ما شُرع. ولكلا القولين أدلة وقائلون معتبرون، ولا تختار هذه الصفحة بينهما. وتعرض الحاسبة أعلاه المقدار بالكيلوغرام والقيمة بالدولار جنبًا إلى جنب، لتعمل بالقول الذي تتبعه.',
  },
  exampleTitle: { en: 'A worked example', ar: 'مثال تطبيقي' },
  exampleSummary: { en: 'A family of five', ar: 'أسرة من خمسة أفراد' },
  exampleNote: {
    en: 'Illustrative only. The food price below is a round invented number chosen to show the arithmetic — it is not a price we are quoting. Use your own local price in the calculator above.',
    ar: 'للتوضيح فقط. سعر الطعام أدناه رقم مفترض اختير لبيان طريقة الحساب، وليس سعرًا نقترحه. استخدم سعرك المحلي في الحاسبة أعلاه.',
  },
  exampleIntro: {
    en: 'Two parents and three children make five people, so five shares are due. Suppose the staple where you live is rice, and suppose it costs an illustrative $4 a kilogram.',
    ar: 'الوالدان والأولاد الثلاثة خمسة أفراد، فيجب عنهم خمسة آصع. لنفترض أن القوت الغالب في بلدك الأرز، وأن سعره {price} للكيلوغرام على سبيل المثال.',
  },
  examplePerPersonLabel: { en: 'Per person:', ar: 'عن كل فرد:' },
  examplePerPerson: {
    en: 'one sa’, taken at 2.75 kg — so 2.75 kg × $4 = $11.',
    ar: 'صاع واحد، مقدَّر بـ2.75 كغ، أي 2.75 كغ × {price} = {perPerson}.',
  },
  exampleHouseholdLabel: { en: 'For the household:', ar: 'عن الأسرة:' },
  exampleHousehold: {
    en: '5 × 2.75 kg = 13.75 kg of rice, or 5 × $11 = $55 if you are paying the value.',
    ar: '5 × 2.75 كغ = 13.75 كغ من الأرز، أو 5 × {perPerson} = {total} إن كنت تُخرج القيمة.',
  },
  exampleOutro: {
    en: 'Both figures describe the same obligation: 13.75 kg of rice delivered, or $55 given so that someone can buy it. Which of the two discharges it is the question scholars differ on, set out above. Either way it needs to be in the recipients’ hands before the Eid prayer.',
    ar: 'كلا الرقمين يعبّر عن الواجب نفسه: 13.75 كغ من الأرز تُسلَّم، أو {total} تُعطى ليُشترى بها. وأيّهما تبرأ به الذمة هي المسألة التي اختلف فيها العلماء كما سبق. وفي الحالتين يجب أن تصل إلى أيدي المستحقين قبل صلاة العيد.',
  },
  whoTitle: { en: 'Who receives it', ar: 'مستحقوها' },
  whoSummary: { en: 'The poor and needy, not your own dependants', ar: 'الفقراء والمساكين، لا من تعولهم' },
  whoBody: {
    en: 'Zakat al-Fitr goes to the poor and needy — the same categories entitled to zakat, and in practice the first two of them. It is not given to your own parents, children or spouse, since supporting them is already your responsibility, and it is not used to pay for mosque running costs or general good causes. Giving it locally, so that it reaches a family who will eat on Eid morning in the community you are part of, is the commonly encouraged practice, though sending it where the need is greater is widely accepted too.',
    ar: 'تُدفع زكاة الفطر إلى الفقراء والمساكين، وهما من الأصناف المستحقة للزكاة، بل أول صنفين منها في الواقع. ولا تُعطى لوالديك ولا لأولادك ولا لزوجك، لأن نفقتهم واجبة عليك أصلًا، ولا تُصرف في نفقات تشغيل المساجد أو أعمال الخير العامة. والمستحب عادةً إخراجها محليًا لتصل إلى أسرة في مجتمعك تطعم منها صباح العيد، وإن كان إرسالها إلى حيث الحاجة أشدّ مقبولًا أيضًا على نطاق واسع.',
  },
  nisabLink: {
    en: 'How the nisab works for zakat on wealth — a different obligation',
    ar: 'كيف يُحسب النصاب في زكاة المال، وهي فريضة مختلفة',
  },
  faqTitle: { en: 'Common questions', ar: 'أسئلة شائعة' },
  disclaimer: {
    en: 'This page is general guidance, not a religious ruling. Zakat al-Fitr depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.',
    ar: 'هذه الصفحة إرشاد عام، وليست فتوى شرعية. وأحكام زكاة الفطر تختلف باختلاف الأحوال، وفي كل ما يخصّ حالتك تحديدًا يُرجى سؤال عالم مؤهَّل.',
  },

  // FAQ
  faq1Q: { en: 'How much is Zakat al-Fitr this year?', ar: 'كم تبلغ زكاة الفطر هذا العام؟' },
  faq1A: {
    en: 'The obligation is defined as a measure of staple food rather than as a sum of money: one sa’ per person, which is usually put at somewhere between 2.5 and 3 kilograms of wheat, rice, barley, dates or whatever the staple is where you live. There is therefore no single dollar figure for the year, and any site that quotes one is quoting a local food price rather than the rule itself. Work out what one sa’ of your local staple costs, or ask your mosque, which will usually publish a figure for the area shortly before Eid.',
    ar: 'الواجب مقدَّر بكيل من القوت الغالب لا بمبلغ من المال: صاع واحد عن كل فرد، ويُقدَّر عادةً بما بين 2.5 و3 كيلوغرامات من القمح أو الأرز أو الشعير أو التمر أو أيّ قوت غالب في بلدك. فليس للعام رقم واحد بالدولار، وأي موقع يذكر رقمًا فإنما يذكر سعرًا محليًا للطعام لا الحكم نفسه. احسب ثمن صاع من القوت الغالب في بلدك، أو اسأل مسجدك، فعادةً ما يعلن رقمًا للمنطقة قُبيل العيد.',
  },
  faq2Q: { en: 'Who has to pay Zakat al-Fitr?', ar: 'على من تجب زكاة الفطر؟' },
  faq2A: {
    en: 'It is due from every Muslim who has food beyond what they and their dependants need for the day of Eid and the night before it, which is a much lower bar than the nisab that governs zakat on wealth. It is a per-person obligation rather than a per-household one, so the amount owed scales with the number of people, not with how much anyone owns. In practice the head of the household usually pays the whole family’s share in one go.',
    ar: 'تجب على كل مسلم عنده طعام زائد عن حاجته وحاجة من يعول يوم العيد وليلته، وهو حدّ أدنى بكثير من النصاب الذي تُناط به زكاة المال. وهي واجبة عن كل فرد لا عن كل أسرة، فيزيد مقدارها بزيادة عدد الأفراد لا بمقدار ما يملكون. وفي الواقع يُخرج ربّ الأسرة عادةً نصيب الأسرة كلها دفعة واحدة.',
  },
  faq3Q: { en: 'Do I pay it for my children?', ar: 'هل أُخرجها عن أولادي؟' },
  faq3A: {
    en: 'Yes — the obligation covers every member of the household, children included, and it is normally discharged on their behalf by whoever supports them. A newborn who arrives before the end of Ramadan is generally included; scholars differ over a child born during the night before Eid, and over whether it is owed for an unborn child, with most holding that it is not. Adult dependants you support, such as an elderly parent living with you, are usually counted in the same way.',
    ar: 'نعم، فالوجوب يشمل كل فرد من أفراد الأسرة، ومنهم الأولاد، ويُخرجها عنهم في العادة من يعولهم. والمولود قبل نهاية رمضان يدخل فيها عمومًا؛ واختلف العلماء في المولود ليلة العيد، وفي وجوبها عن الجنين، وأكثرهم على أنها لا تجب عنه. ومن تعولهم من البالغين، كوالد مسنّ يسكن معك، يُحسبون عادةً بالطريقة نفسها.',
  },
  faq4Q: { en: 'When is the deadline?', ar: 'ما آخر موعد لإخراجها؟' },
  faq4A: {
    en: 'It must reach those entitled to it before the Eid prayer — that is the part people most often get wrong, because charity given later in the day feels like it should still count. Scholars differ on how early it may be paid, with some permitting it during the last days of Ramadan and others from the beginning of the month, but nobody disputes the far end of the window. Paying two or three days ahead is the safe course, and it is what makes it possible for the money to turn into food in time.',
    ar: 'يجب أن تصل إلى مستحقيها قبل صلاة العيد، وهذا أكثر ما يخطئ فيه الناس، إذ يُظنّ أن الصدقة المعطاة في وقت لاحق من يوم العيد تُجزئ أيضًا. واختلف العلماء في أول وقت يجوز فيه إخراجها، فبعضهم يجيزه في الأيام الأخيرة من رمضان، وبعضهم من أول الشهر، لكن لا خلاف في نهاية الوقت. وإخراجها قبل العيد بيومين أو ثلاثة هو الأحوط، وبه يتسنّى تحويل المال إلى طعام في الوقت المناسب.',
  },
  faq5Q: { en: 'Can I pay money instead of food?', ar: 'هل يجوز إخراج المال بدلًا من الطعام؟' },
  faq5A: {
    en: 'Scholars differ on this, and the difference is a real one rather than a technicality. Many hold that the value may be paid in cash, on the grounds that the aim is to meet a need on the day of Eid and money meets it more flexibly than a sack of grain; this is the position most commonly associated with the Hanafi school and the one most charities work to. Others hold that the obligation was specified as food and should be discharged as food, and that substituting the value changes what was prescribed. We do not adjudicate between them; ask a scholar you trust, or follow the practice of your school.',
    ar: 'اختلف العلماء في ذلك، وهو خلاف حقيقي لا مسألة شكلية. فكثير منهم يرون جواز دفع القيمة نقدًا، لأن المقصود سدّ الحاجة يوم العيد، والمال يسدّها بمرونة أكبر من كيس حبوب؛ وهذا القول هو الأشهر نسبةً إلى المذهب الحنفي، وعليه تعمل أكثر الجمعيات الخيرية. ويرى آخرون أن الواجب نُصّ عليه طعامًا فيُخرج طعامًا، وأن استبدال القيمة به تغيير لما شُرع. ونحن لا نرجّح بين القولين؛ فاسأل عالمًا تثق به، أو اتبع ما عليه مذهبك.',
  },
  faq6Q: { en: 'What happens if I miss it?', ar: 'ماذا لو فاتني إخراجها؟' },
  faq6A: {
    en: 'The widely taught position is that paying after the Eid prayer no longer counts as Zakat al-Fitr and is recorded as ordinary charity instead, so the obligation remains outstanding. Most scholars hold that you should still pay it as soon as you realise, since a debt owed is not cancelled by being late, and many add that some repentance is appropriate where the delay was avoidable. If you have missed it for several years, the amount owed is worked out per person per year, and it is worth asking someone qualified how to settle it.',
    ar: 'القول الذي يُدرَّس على نطاق واسع أن إخراجها بعد صلاة العيد لا يُعدّ زكاة فطر، بل يُحسب صدقة عادية، فيبقى الواجب في الذمة. ويرى أكثر العلماء أن عليك إخراجها متى تنبّهت، لأن الدين لا يسقط بالتأخير، ويضيف كثير منهم أن التوبة مطلوبة إن كان التأخير بغير عذر. وإن فاتتك سنوات عدة، فالواجب يُحسب عن كل فرد عن كل سنة، ويحسن أن تسأل أهل العلم عن كيفية قضائها.',
  },

  // Structured data
  webAppDescription: {
    en: 'A free calculator for Zakat al-Fitr: enter your household size and the price of a staple food, and see the measure and the value due before the Eid prayer.',
    ar: 'حاسبة مجانية لزكاة الفطر: أدخل عدد أفراد أسرتك وسعر القوت الغالب، لتعرف المقدار والقيمة الواجبين قبل صلاة العيد.',
  },
  howToName: { en: 'How to work out your Zakat al-Fitr', ar: 'كيف تحسب زكاة الفطر' },
  howToDescription: {
    en: 'Four steps from the size of your household to the amount due before the Eid prayer.',
    ar: 'أربع خطوات من عدد أفراد أسرتك إلى المقدار الواجب قبل صلاة العيد.',
  },
  step1Name: { en: 'Count everyone in the household', ar: 'عُدّ أفراد الأسرة جميعًا' },
  step1Text: {
    en: 'Yourself, your spouse, your children and any dependants you support — it is a per-person obligation.',
    ar: 'نفسك، وزوجك، وأولادك، ومن تعولهم، فهي واجبة عن كل فرد.',
  },
  step2Name: { en: 'Take one sa’ per person', ar: 'صاع واحد عن كل فرد' },
  step2Text: {
    en: 'One sa’ is a volume measure of staple food, usually put at between 2.5 and 3 kilograms of wheat, rice, barley or dates.',
    ar: 'الصاع مكيال للقوت الغالب، يُقدَّر عادةً بما بين 2.5 و3 كيلوغرامات من القمح أو الأرز أو الشعير أو التمر.',
  },
  step3Name: { en: 'Give it as food, or as its value', ar: 'أخرجها طعامًا أو قيمته' },
  step3Text: {
    en: 'Whether the monetary equivalent may be given in place of the food is a point on which scholars differ; follow the position of your school or teacher.',
    ar: 'جواز إخراج القيمة النقدية بدلًا من الطعام مسألة اختلف فيها العلماء؛ فاتبع قول مذهبك أو شيخك.',
  },
  step4Name: { en: 'Pay it before the Eid prayer', ar: 'أخرجها قبل صلاة العيد' },
  step4Text: {
    en: 'It must reach those entitled to it before the prayer. Paid afterwards, it is widely held to count as ordinary charity rather than Zakat al-Fitr.',
    ar: 'يجب أن تصل إلى مستحقيها قبل الصلاة. فإن أُخرجت بعدها، فالقول المشهور أنها تُعدّ صدقة عادية لا زكاة فطر.',
  },
})

const ZakatAlFitrCalculator = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [householdSize, setHouseholdSize] = useState<number>(1)
  const [foodPricePerKg, setFoodPricePerKg] = useState<number>(3)
  const [calculationMethod, setCalculationMethod] = useState<'food' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    totalKg: number
    perPerson: number
  } | null>(null)

  const [nisab, setNisab] = useState<NisabData | null>(null)
  const [nisabLoaded, setNisabLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchNisab().then((data) => {
      if (!active) return
      setNisab(data)
      setNisabLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The single gate on printing invented money anywhere on this page.
  const showFigure = nisabLoaded && hasUsableFigure(nisab)

  const year = currentYear()

  const calculateZakatAlFitr = () => {
    if (householdSize <= 0) {
      alert(t(M.invalidHousehold))
      return
    }

    // Zakat al-Fitr is approximately 2.5-3 kg of staple food per person
    const kgPerPerson = 2.75 // Average of 2.5-3 kg
    const totalKg = householdSize * kgPerPerson

    if (calculationMethod === 'food') {
      setResult({
        totalAmount: totalKg * foodPricePerKg,
        totalKg,
        perPerson: kgPerPerson
      })
    } else {
      // Monetary equivalent
      const totalAmount = totalKg * foodPricePerKg
      setResult({
        totalAmount,
        totalKg,
        perPerson: kgPerPerson
      })
    }
  }

  // English keeps its original "$12.34" and "person(s)"; Arabic formats the
  // amount through Intl and picks the CLDR plural form for the head count.
  const dollars = (n: number) => (locale === 'en' ? `$${n.toFixed(2)}` : fmt.money(Math.round(n * 100), { decimals: true }))
  const personWord = (n: number) =>
    locale === 'en'
      ? `person${n > 1 ? 's' : ''}`
      : fmt.plural(n, { one: 'فرد', two: 'فردان', few: 'أفراد', many: 'فردًا', other: 'فرد' })
  const household = (n: number) =>
    locale === 'en'
      ? `${n} person${n > 1 ? 's' : ''}`
      : fmt.plural(n, { one: 'فرد واحد', two: 'فردين', few: '{count} أفراد', many: '{count} فردًا', other: '{count} فرد' })

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
      { name: t(C.zakatAlFitrCalculator), path: `${prefix}/zakat-al-fitr-calculator` },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: t(C.zakatAlFitrCalculator),
      description: t(M.webAppDescription),
      path: `${prefix}/zakat-al-fitr-calculator`,
    }),
    getHowToJsonLd({
      name: t(M.howToName),
      description: t(M.howToDescription),
      steps: [
        { name: t(M.step1Name), text: t(M.step1Text) },
        { name: t(M.step2Name), text: t(M.step2Text) },
        { name: t(M.step3Name), text: t(M.step3Text) },
        { name: t(M.step4Name), text: t(M.step4Text) },
      ],
    }),
  ]

  const title = t(M.title, { year })

  // The invented round numbers of the worked example (used by the Arabic text;
  // the English text carries them as written).
  const exampleVars = {
    price: fmt.money(400),
    perPerson: fmt.money(1100),
    total: fmt.money(5500),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={title}
        description={t(M.seoDescription)}
        canonicalPath="/zakat-al-fitr-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={title}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* Calculator Form — unchanged behaviour */}
          <section className="card sm:p-8" aria-labelledby="fitr-form">
            <h2 id="fitr-form" className="text-xl font-heading font-bold text-gray-900 mb-6">
              {t(M.formTitle)}
            </h2>

            <div className="space-y-6">
              {/* Household Size */}
              <div>
                <label htmlFor="fitr-household" className="label">
                  {t(M.householdLabel)}
                </label>
                <input
                  id="fitr-household"
                  type="number"
                  min="1"
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="help-text">
                  {t(M.householdHelp)}
                </p>
              </div>

              {/* Calculation Method */}
              <fieldset>
                <legend className="label">{t(M.methodLegend)}</legend>
                <div className="space-y-3 mt-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="monetary"
                      checked={calculationMethod === 'monetary'}
                      onChange={() => setCalculationMethod('monetary')}
                      className="me-3"
                    />
                    <span className="text-gray-700">{t(M.methodMoney)}</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="food"
                      checked={calculationMethod === 'food'}
                      onChange={() => setCalculationMethod('food')}
                      className="me-3"
                    />
                    <span className="text-gray-700">{t(M.methodFood)}</span>
                  </label>
                </div>
                <p className="help-text">
                  {t(M.methodHelp)}
                </p>
              </fieldset>

              {/* Food Price Per Kg */}
              <div>
                <label htmlFor="fitr-price" className="label">
                  {t(M.priceLabel)}
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="fitr-price"
                    type="number"
                    min="0.5"
                    step="0.01"
                    value={foodPricePerKg}
                    onChange={(e) => setFoodPricePerKg(parseFloat(e.target.value) || 3)}
                    className="input-field ps-10 w-full"
                    placeholder="3.00"
                  />
                </div>
                <p className="help-text">
                  {t(M.priceHelp)}
                </p>
              </div>

              {/* Calculate Button */}
              <button
                type="button"
                onClick={calculateZakatAlFitr}
                className="btn-primary btn-lg w-full sm:w-auto"
              >
                {t(M.calculate)}
              </button>
            </div>
          </section>

          {/* Results — unchanged figures */}
          {result && (
            <section className="card-tinted sm:p-8" aria-live="polite" aria-labelledby="fitr-result">
              <h2 id="fitr-result" className="text-xl font-heading font-bold text-gray-900 mb-6">
                {t(M.resultTitle)}
              </h2>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">{t(M.householdSize)}</dt>
                  <dd className="text-2xl font-bold text-gray-900">{locale === 'en' ? householdSize : fmt.number(householdSize)}</dd>
                  <dd className="text-xs text-gray-500 mt-1">{personWord(householdSize)}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">{t(M.perPerson)}</dt>
                  <dd className="text-2xl font-bold text-gray-900">{t(M.kg, { kg: result.perPerson.toFixed(2) })}</dd>
                  <dd className="text-xs text-gray-500 mt-1">{t(M.orAmount, { amount: dollars(result.totalAmount / householdSize) })}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">{t(M.totalAmount)}</dt>
                  <dd className="text-2xl font-bold text-gray-900">{dollars(result.totalAmount)}</dd>
                  <dd className="text-xs text-gray-500 mt-1">{t(M.kgTotal, { kg: result.totalKg.toFixed(2) })}</dd>
                </div>
              </dl>

              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">{t(M.summary)}</h3>
                <p className="text-gray-700 mb-2">
                  {t(M.summaryIntro, { household: household(householdSize) })}
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li><strong>{t(M.kg, { kg: result.totalKg.toFixed(2) })}</strong>{t(M.ofStaple, { perPerson: result.perPerson.toFixed(2), household: household(householdSize) })}</li>
                  <li><strong>{dollars(result.totalAmount)}</strong>{t(M.atYourPrice)}</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  {t(M.saNote)}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={`/donate?purpose=${encodeURIComponent('Zakat al-Fitr')}&amount=${result.totalAmount.toFixed(2)}`}
                  className="btn-primary"
                >
                  {t(C.donateNow)}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setHouseholdSize(1)
                    setFoodPricePerKg(3)
                  }}
                  className="btn-secondary"
                >
                  {t(M.calculateAgain)}
                </button>
              </div>
            </section>
          )}

          {/* Timing — the part people most often get wrong, so it stays open. */}
          <section className="alert-warning block p-6 text-base" aria-labelledby="fitr-deadline">
            <h2 id="fitr-deadline" className="flex items-center text-lg font-heading font-bold text-amber-900 mb-2">
              <AlertCircle className="w-5 h-5 text-amber-700 me-2 shrink-0" aria-hidden="true" />
              {t(M.deadlineTitle)}
            </h2>
            <p className="text-amber-900 leading-relaxed">
              {t(M.deadlineBefore)}<strong>{t(M.deadlineStrong)}</strong>{t(M.deadlineAfter)}
            </p>
          </section>

          {/* The explanations, folded under the tool. The text stays in the
              DOM (and the FAQ in the schema). */}
          <section aria-labelledby="fitr-learn" className="space-y-3">
            <h2 id="fitr-learn" className={HEADING}>{t(M.learnTitle)}</h2>

            <Disclosure title={t(M.whatTitle)} summary={t(M.whatSummary)}>
              <p className={PROSE}>
                {t(M.whatP1)}
              </p>
              <p className={PROSE}>
                {t(M.whatP2)}
              </p>
            </Disclosure>

            <Disclosure title={t(M.howMuchTitle)} summary={t(M.howMuchSummary)}>
              <p className={PROSE}>
                {t(M.howMuchP1)}
              </p>
              <p className={PROSE}>
                {t(M.howMuchP2)}
              </p>
            </Disclosure>

            <Disclosure title={t(M.foodOrMoneyTitle)} summary={t(M.foodOrMoneySummary)}>
              <p className={PROSE}>
                <strong>{t(M.foodOrMoneyStrong)}</strong>{t(M.foodOrMoneyP1)}
              </p>
              <p className={PROSE}>
                {t(M.foodOrMoneyP2)}
              </p>
            </Disclosure>

            {/* A worked example — withheld whenever the page is withholding
                dollar figures, on the same rule as /nisab and /zakat-calculator. */}
            {showFigure && (
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
                    <strong>{t(M.examplePerPersonLabel)}</strong> {t(M.examplePerPerson, exampleVars)}
                  </li>
                  <li>
                    <strong>{t(M.exampleHouseholdLabel)}</strong> {t(M.exampleHousehold, exampleVars)}
                  </li>
                </ul>
                <p className={PROSE}>
                  {t(M.exampleOutro, exampleVars)}
                </p>
              </Disclosure>
            )}

            <Disclosure title={t(M.whoTitle)} summary={t(M.whoSummary)}>
              <p className={PROSE}>
                {t(M.whoBody)}
              </p>
              <Link to="/nisab" className="link inline-flex items-center">
                {t(M.nisabLink)}
                <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
              </Link>
            </Disclosure>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema */}
          <section aria-labelledby="fitr-faq">
            <h2 id="fitr-faq" className={HEADING}>{t(M.faqTitle)}</h2>
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
    </div>
  )
}

export default ZakatAlFitrCalculator
