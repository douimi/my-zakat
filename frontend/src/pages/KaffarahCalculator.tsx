/**
 * /kaffarah-calculator — expiation for a deliberately broken fast or oath,
 * plus the content that makes the page findable.
 *
 * The calculator's arithmetic is unchanged. What is new is the content around
 * it, written to the same editorial rules as /nisab and /zakat-calculator: it
 * states what is agreed, names what is not, and rules on nothing. The single
 * most important thing this page has to do is tell people who do NOT owe
 * kaffarah that they do not owe it — a fast missed through illness or travel is
 * made up, not expiated, and a page that lets someone talk themselves into
 * sixty days of fasting over a bout of flu has done harm.
 *
 * The worked example is gated on `hasUsableFigure`, like every worked example
 * on this site.
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
  title: {
    en: 'Kaffarah Calculator {year} — Expiation for Missed Fasts and Oaths',
    ar: 'حاسبة الكفارة {year}: كفارة الصيام واليمين',
  },
  seoDescription: {
    en: 'Kaffarah is the expiation for a deliberately broken fast or oath. See the graded options, how the schools differ, and when a missed fast is simply made up instead.',
    ar: 'الكفارة هي ما يجب على من أفطر في رمضان عمدًا أو حنث في يمينه. تعرّف على خياراتها المرتّبة، واختلاف المذاهب فيها، ومتى يكفي قضاء الصوم الفائت دون كفارة.',
  },
  lead: {
    en: 'Kaffarah is owed when an obligation is broken deliberately. A fast missed through illness or travel is made up, not expiated.',
    ar: 'تجب الكفارة عند الإخلال بالواجب عمدًا. أما الصوم الذي فات بسبب المرض أو السفر فيُقضى، ولا كفارة فيه.',
  },
  invalidDays: { en: 'Please enter a valid number of days missed', ar: 'يُرجى إدخال عدد صحيح للأيام التي أُفطرت' },

  // What it is not
  notTitle: { en: 'What kaffarah is not', ar: 'ما ليس من الكفارة' },
  notBefore: {
    en: 'A fast missed through illness, travel, pregnancy, nursing, menstruation or genuine forgetfulness is ',
    ar: 'الصوم الذي فات بسبب المرض أو السفر أو الحمل أو الرضاع أو الحيض أو النسيان الحقيقي ',
  },
  notStrong: { en: 'made up day for day', ar: 'يُقضى يومًا بيوم' },
  notAfter: {
    en: '. No kaffarah is owed. If you cannot fast at all because of a chronic illness, fidya applies instead: one person fed per day missed.',
    ar: '، ولا كفارة فيه. وإن كنت لا تستطيع الصيام أصلًا بسبب مرض مزمن، فالواجب الفدية بدلًا منه: إطعام مسكين واحد عن كل يوم فات.',
  },

  // Form
  formTitle: { en: 'Cost the feeding option', ar: 'احسب تكلفة خيار الإطعام' },
  formIntro: {
    en: 'This costs the feeding option only, at sixty people for each day deliberately broken. Whether feeding is the option that applies to you depends on the ordering of the options, which is a question for a scholar and not for a calculator.',
    ar: 'تحسب هذه الأداة تكلفة خيار الإطعام وحده، بواقع ستين شخصًا عن كل يوم أُفطر عمدًا. أما هل الإطعام هو الخيار الذي ينطبق عليك، فيتوقف على ترتيب الخيارات، وهي مسألة يُسأل عنها أهل العلم لا الحاسبة.',
  },
  daysLabel: { en: 'Number of Days Broken (Deliberately)', ar: 'عدد الأيام التي أُفطرت عمدًا' },
  daysHelp: {
    en: 'Only days you broke deliberately, without a valid excuse. Days missed through illness or travel are made up and do not belong here.',
    ar: 'الأيام التي أفطرتها عمدًا دون عذر شرعي فقط. أما الأيام التي فاتت بسبب المرض أو السفر فتُقضى، ولا مكان لها هنا.',
  },
  methodLegend: { en: 'Atonement Method', ar: 'طريقة التكفير' },
  methodMoney: { en: 'Monetary Payment (the value of the food, in cash)', ar: 'نقدًا (قيمة الطعام بالمال)' },
  methodFeeding: { en: 'Feeding Poor People', ar: 'إطعام المساكين' },
  methodHelp: {
    en: 'Scholars differ on whether the value may be given in cash in place of the food. This choice is yours to make.',
    ar: 'اختلف العلماء في جواز دفع القيمة نقدًا بدلًا من الطعام. والاختيار لك.',
  },
  costLabel: { en: 'Cost to Feed One Person (in USD)', ar: 'تكلفة إطعام شخص واحد (بالدولار الأمريكي)' },
  costHelp: {
    en: 'What a day’s food costs where you live. We do not supply a figure, because it is a local one and only you know it.',
    ar: 'تكلفة طعام يوم واحد في بلدك. ولا نقترح رقمًا، لأنه رقم محلي لا يعرفه غيرك.',
  },
  calculate: { en: 'Calculate Kaffarah', ar: 'احسب الكفارة' },

  // Result
  resultTitle: { en: 'Your Kaffarah Calculation', ar: 'نتيجة حساب الكفارة' },
  peopleToFeed: { en: 'People to Feed', ar: 'عدد من يُطعَمون' },
  totalAmount: { en: 'Total Amount', ar: 'المبلغ الإجمالي' },
  daysToFast: { en: 'Days to Fast', ar: 'أيام الصيام' },
  alternative: { en: '(Alternative option)', ar: '(خيار بديل)' },
  summary: { en: 'Summary', ar: 'الخلاصة' },
  summaryIntro: { en: 'For {days} broken, the feeding option comes to:', ar: 'عن الإفطار عمدًا في {days}، يبلغ خيار الإطعام:' },
  feedStrong: { en: 'Feed {people} poor people', ar: 'إطعام {people}' },
  feedFormula: { en: ' (60 people × {days})', ar: ' (60 شخصًا × {days})' },
  payStrong: { en: 'Pay {amount}', ar: 'دفع {amount}' },
  payRest: { en: ' at the cost per person you entered', ar: ' بحسب تكلفة إطعام الشخص الواحد التي أدخلتها' },
  resultNote: {
    en: 'This uses the cost you supplied, not a figure of ours. The missed day itself is still made up, in addition to the expiation.',
    ar: 'يعتمد هذا على التكلفة التي أدخلتها أنت، لا على رقم من عندنا. ويبقى قضاء اليوم الفائت واجبًا، إضافةً إلى الكفارة.',
  },
  calculateAgain: { en: 'Calculate Again', ar: 'احسب من جديد' },

  // Explanations
  learnTitle: { en: 'How kaffarah works', ar: 'الكفارة: ما ينبغي أن تعرفه' },
  whatTitle: { en: 'What kaffarah is', ar: 'ما الكفارة' },
  whatSummary: { en: 'An expiation for a deliberate breach, not a fee', ar: 'تكفير عن إخلال متعمَّد، لا رسم يُدفع' },
  whatP1: {
    en: 'Kaffarah is an expiation — something owed after an obligation has been broken on purpose. It is not a fee, it is not paid to any authority, and it cannot be paid in advance to licence breaking something later. It applies in two cases: a Ramadan fast broken deliberately without a valid excuse, and an oath that was sworn and then not kept.',
    ar: 'الكفارة تكفير عن ذنب: ما يجب على من أخلّ بواجب عمدًا. فهي ليست رسمًا، ولا تُدفع لأي جهة رسمية، ولا يجوز دفعها مقدمًا ليُستباح بها الإخلال بالواجب لاحقًا. وتجب في حالتين: صوم يوم من رمضان أُفطر عمدًا بغير عذر شرعي، ويمين حلفها صاحبها ثم لم يبرّ بها.',
  },
  whatP2: {
    en: 'The two carry very different weights. The expiation for a broken oath is modest. The expiation for a deliberately broken fast is heavy, and it is meant to be — it is the measure of how serious the breach is held to be, not a tariff. In the case of the fast, the expiation does not take the place of the missed day: the day itself is still made up.',
    ar: 'والحالتان متفاوتتان في الثقل تفاوتًا كبيرًا. فكفارة اليمين يسيرة، أما كفارة الإفطار المتعمَّد فثقيلة، وهي مقصودة أن تكون كذلك، فهي تعبير عن خطورة هذا الإخلال لا تسعيرة له. وفي حالة الصوم لا تقوم الكفارة مقام اليوم الفائت، بل يبقى قضاؤه واجبًا.',
  },
  optionsTitle: { en: 'The options for a deliberately broken fast', ar: 'خيارات كفارة الإفطار المتعمَّد' },
  optionsSummary: {
    en: 'Three options in a fixed order; the schools differ on how binding it is',
    ar: 'ثلاثة خيارات بترتيب محدد؛ واختلفت المذاهب في لزوم هذا الترتيب',
  },
  optionsIntro: {
    en: 'The sources set out three options in a fixed sequence, and the order matters to how most scholars read them:',
    ar: 'ذكرت النصوص ثلاثة خيارات بترتيب محدد، ولهذا الترتيب أثر في فهم أكثر العلماء لها:',
  },
  opt1Strong: { en: 'Freeing a slave.', ar: 'عتق رقبة.' },
  opt1: {
    en: 'Listed first in the texts, and without application today, which is why the discussion in practice starts at the second option.',
    ar: 'وهو المذكور أولًا في النصوص، ولا مجال لتطبيقه اليوم، ولذلك يبدأ النقاش عمليًا من الخيار الثاني.',
  },
  opt2Strong: { en: 'Fasting two consecutive months', ar: 'صيام شهرين متتابعين' },
  opt2: {
    en: '— around sixty days, unbroken. If the sequence is interrupted without an excuse, the common position is that it starts again from the beginning.',
    ar: '— نحو ستين يومًا دون انقطاع. فإن انقطع التتابع بغير عذر، فالقول الشائع أنه يستأنف الصيام من أوله.',
  },
  opt3Strong: { en: 'Feeding sixty poor people', ar: 'إطعام ستين مسكينًا' },
  opt3: { en: 'for each day that was deliberately broken.', ar: 'عن كل يوم أُفطر عمدًا.' },
  orderStrong: { en: 'The schools differ on how binding that order is.', ar: 'واختلفت المذاهب في مدى لزوم هذا الترتيب.' },
  orderRest: {
    en: ' Most hold the options are strictly graded, so that you move to feeding only if you genuinely cannot fast two consecutive months; on that reading, someone able to fast may not simply choose to pay. Others treat the three as a choice open to the person expiating. The schools also differ on what triggers the expiation in the first place — some confine it to intercourse during a fasting day, others extend it to deliberately eating or drinking — and on the measure of food owed per person, usually given as a mudd or half a sa’ of the local staple. This page does not adjudicate any of that.',
    ar: ' فأكثرهم يرون أن الخيارات مرتّبة ترتيبًا لازمًا، فلا يُنتقل إلى الإطعام إلا لمن عجز حقًا عن صيام شهرين متتابعين؛ وعلى هذا القول لا يجوز للقادر على الصيام أن يختار الدفع. ويرى آخرون أن المكفِّر مخيَّر بين الثلاثة. واختلفت المذاهب كذلك في موجب الكفارة أصلًا — فبعضهم يقصرها على الجماع في نهار الصوم، وبعضهم يمدّها إلى الأكل أو الشرب عمدًا — وفي مقدار الطعام الواجب لكل مسكين، ويُذكر عادةً بأنه مُدّ أو نصف صاع من القوت الغالب. ولا ترجّح هذه الصفحة في شيء من ذلك.',
  },
  oathP: {
    en: 'A broken oath is a separate and much lighter matter: feeding ten poor people, or clothing them, or freeing a slave, and only where none of those is possible, fasting three days.',
    ar: 'أما الحنث في اليمين فأمر مستقل وأخفّ بكثير: إطعام عشرة مساكين، أو كسوتهم، أو عتق رقبة، فإن تعذّر ذلك كله فصيام ثلاثة أيام.',
  },
  exampleTitle: { en: 'A worked example', ar: 'مثال تطبيقي' },
  exampleSummary: {
    en: 'Feeding sixty people, at an invented $5 each',
    ar: 'إطعام ستين شخصًا، بتكلفة مفترضة قدرها {price} للشخص',
  },
  exampleNote: {
    en: 'Illustrative only. The cost below is a round invented number chosen to show the arithmetic — it is not a price we are quoting. Use your own local cost in the calculator above.',
    ar: 'للتوضيح فقط. التكلفة أدناه رقم مفترض اختير لبيان طريقة الحساب، وليست سعرًا نقترحه. استخدم تكلفتك المحلية في الحاسبة أعلاه.',
  },
  exampleIntro: {
    en: 'Suppose one day of Ramadan was broken deliberately, the feeding option is the one that applies to you, and a day’s food for one person costs an illustrative $5 where you live.',
    ar: 'لنفترض أن يومًا من رمضان أُفطر عمدًا، وأن الإطعام هو الخيار الذي ينطبق عليك، وأن طعام يوم لشخص واحد يكلف {price} في بلدك على سبيل المثال.',
  },
  exampleOneLabel: { en: 'For one day broken:', ar: 'عن يوم واحد:' },
  exampleOne: { en: '60 people × $5 = $300.', ar: '60 شخصًا × {price} = {one}.' },
  exampleTwoLabel: { en: 'For two days broken:', ar: 'عن يومين:' },
  exampleTwo: {
    en: '120 people × $5 = $600 — the expiation is reckoned per day, not once for the month.',
    ar: '120 شخصًا × {price} = {two}، فالكفارة تُحسب عن كل يوم، لا مرة واحدة عن الشهر.',
  },
  exampleAlsoLabel: { en: 'And in addition:', ar: 'وفوق ذلك:' },
  exampleAlso: {
    en: 'the missed day or days are made up by fasting them later. The expiation does not replace them.',
    ar: 'يُقضى اليوم أو الأيام الفائتة بصيامها لاحقًا، ولا تقوم الكفارة مقامها.',
  },
  exampleOutro: {
    en: 'How much food counts as feeding one person is itself given differently by different schools — a mudd, or half a sa’, of the local staple are the measures usually quoted — so the honest version of this sum is always local and always approximate.',
    ar: 'ومقدار الطعام الذي يُعدّ إطعامًا لشخص واحد تختلف فيه المذاهب أيضًا — والمقداران المذكوران عادةً مُدّ أو نصف صاع من القوت الغالب — لذا فالحساب الصادق هنا محلي دائمًا وتقريبي دائمًا.',
  },
  giveTitle: { en: 'How it is given', ar: 'كيف تُخرج' },
  giveSummary: { en: 'To the poor and needy, recorded apart from zakat', ar: 'للفقراء والمساكين، وتُسجَّل منفصلة عن الزكاة' },
  giveP1: {
    en: 'Where the feeding option applies, the food goes to the poor and needy — the same people entitled to receive zakat — and not to your own dependants, whose support is already your responsibility. Sixty separate people is the number given in the sources; scholars differ on whether the same person may be fed sixty times instead, with many holding that they may not, because the breadth of the benefit is part of the point.',
    ar: 'إذا كان الإطعام هو الخيار الواجب، فالطعام للفقراء والمساكين — وهم أنفسهم من مستحقي الزكاة — لا لمن تعولهم، فنفقتهم واجبة عليك أصلًا. والعدد المذكور في النصوص ستون شخصًا مختلفون؛ واختلف العلماء في جواز إطعام شخص واحد ستين مرة بدلًا من ذلك، وكثير منهم على المنع، لأن تعميم النفع جزء من المقصود.',
  },
  giveP2: {
    en: 'Kaffarah money is kept distinct from zakat in a charity’s accounting, even though the categories of recipient overlap, because they discharge different obligations. If you are giving through us, say which one it is so it is recorded correctly.',
    ar: 'وتُفصل أموال الكفارة عن أموال الزكاة في حسابات الجمعية الخيرية، وإن تداخلت أصناف المستحقين، لأن كلًّا منهما تبرأ به الذمة من واجب مختلف. فإن كنت تُخرجها عن طريقنا، فاذكر نوعها لتُسجَّل تسجيلًا صحيحًا.',
  },
  zakatLink: {
    en: 'Zakat on wealth is a separate obligation — work that out here',
    ar: 'زكاة المال فريضة مستقلة، احسبها هنا',
  },
  faqTitle: { en: 'Common questions', ar: 'أسئلة شائعة' },
  disclaimer: {
    en: 'This page is general guidance, not a religious ruling. Kaffarah depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.',
    ar: 'هذه الصفحة إرشاد عام، وليست فتوى شرعية. وأحكام الكفارة تختلف باختلاف الأحوال، وفي كل ما يخصّ حالتك تحديدًا يُرجى سؤال عالم مؤهَّل.',
  },

  // FAQ
  faq1Q: { en: 'What is kaffarah?', ar: 'ما الكفارة؟' },
  faq1A: {
    en: 'Kaffarah is an expiation: something owed when a religious obligation has been broken deliberately, rather than simply missed. The two cases people meet most often are a fast in Ramadan broken on purpose without a valid excuse, and an oath sworn and then not kept. It is not a fine paid to anyone in authority, and it is not a way of buying an exemption in advance — it is owed after the fact, and in the case of the fast it sits alongside making the day up rather than replacing it.',
    ar: 'الكفارة تكفير عن ذنب: ما يجب على من أخلّ بواجب ديني عمدًا، لا مجرد أنه فاته. وأكثر الحالتين وقوعًا: صوم يوم من رمضان أُفطر عمدًا بغير عذر شرعي، ويمين حُلفت ثم لم يُبرّ بها. وهي ليست غرامة تُدفع لأي جهة، ولا وسيلة لشراء رخصة مسبقة، بل تجب بعد وقوع الإخلال، وفي حالة الصوم تُضاف إلى قضاء اليوم ولا تحل محله.',
  },
  faq2Q: { en: 'When do I owe kaffarah rather than just making up a fast?', ar: 'متى تجب عليّ الكفارة لا مجرد القضاء؟' },
  faq2A: {
    en: 'The dividing line is deliberateness. A fast broken on purpose, without a valid excuse, while you were obliged to be keeping it, is the case the expiation was prescribed for; a fast missed or broken for a reason the law recognises — illness, travel, pregnancy, menstruation, genuine forgetfulness — is made up later and nothing further is owed. The schools differ on exactly which deliberate acts trigger it: some confine the expiation to intercourse during a fasting day, while others extend it to deliberately eating or drinking as well. Where your own case falls is worth putting to a scholar rather than deciding from a web page.',
    ar: 'الفيصل هو العمد. فالصوم الذي يُفطر فيه المرء عمدًا بغير عذر شرعي، وهو مطالب بصيامه، هو الحالة التي شُرعت لها الكفارة؛ أما الصوم الذي يفوت أو يُفطر فيه لعذر يعتبره الشرع — كالمرض، أو السفر، أو الحمل، أو الحيض، أو النسيان الحقيقي — فيُقضى لاحقًا ولا شيء غير ذلك. واختلفت المذاهب في الأفعال المتعمَّدة الموجبة للكفارة: فبعضهم يقصرها على الجماع في نهار الصوم، وبعضهم يمدّها إلى الأكل أو الشرب عمدًا. والأولى أن تعرض حالتك على عالم بدل أن تحكم فيها من صفحة على الإنترنت.',
  },
  faq3Q: { en: 'How much is the kaffarah for a broken fast?', ar: 'كم تبلغ كفارة الإفطار المتعمَّد؟' },
  faq3A: {
    en: 'The sources set out graded options rather than a single amount: freeing a slave, then fasting two consecutive months, then feeding sixty poor people — and the thresholds and the order are not read identically by every school. Most hold the options are strictly ordered, so that you move to feeding only if you genuinely cannot fast two months without interruption; others treat them as a choice. The measure of food per person also differs by school, and it is usually described as a mudd or half a sa’ of the local staple, so the dollar amount depends entirely on local food prices.',
    ar: 'ذكرت النصوص خيارات مرتّبة لا مبلغًا واحدًا: عتق رقبة، ثم صيام شهرين متتابعين، ثم إطعام ستين مسكينًا — ولا تقرأ المذاهب كلها شروطها وترتيبها قراءة واحدة. فأكثرهم يرون أن الخيارات مرتّبة ترتيبًا لازمًا، فلا يُنتقل إلى الإطعام إلا لمن عجز حقًا عن صيام شهرين متتابعين دون انقطاع؛ ويرى آخرون أنها على التخيير. ويختلف مقدار الطعام لكل مسكين باختلاف المذهب أيضًا، ويُذكر عادةً بأنه مُدّ أو نصف صاع من القوت الغالب، فالمبلغ بالدولار يتوقف كليًا على أسعار الطعام المحلية.',
  },
  faq4Q: { en: 'What is the kaffarah for a broken oath?', ar: 'ما كفارة الحنث في اليمين؟' },
  faq4A: {
    en: 'A broken oath carries a different and much lighter expiation than a broken fast: feeding ten poor people, or clothing them, or freeing a slave, and only if none of those is possible, fasting three days. The ten are fed with what is average for the food you give your own family, so again the cash amount tracks local prices. Not every statement counts as an oath for this purpose — scholars distinguish a deliberate, binding oath from a casual turn of phrase, and they differ over where exactly that line falls.',
    ar: 'للحنث في اليمين كفارة مختلفة وأخفّ بكثير من كفارة الإفطار: إطعام عشرة مساكين، أو كسوتهم، أو عتق رقبة، فإن تعذّر ذلك كله فصيام ثلاثة أيام. ويكون إطعام العشرة من الطعام المتوسط الذي تُطعمه أهلك عادةً، فالمبلغ النقدي هنا أيضًا يتبع الأسعار المحلية. وليس كل كلام يُعدّ يمينًا في هذا الباب، فالعلماء يفرّقون بين اليمين المقصودة المنعقدة وبين ما يجري على اللسان عادةً، ويختلفون في موضع الحدّ بينهما بالتحديد.',
  },
  faq5Q: { en: 'Can I pay the money instead of feeding people?', ar: 'هل يجوز دفع المال بدلًا من إطعام الناس؟' },
  faq5A: {
    en: 'Scholars differ. Many hold that the value may be given in cash and used to buy and distribute the food, on the grounds that the obligation is to feed people and money is simply the means; this is how most charities, including this one, are organised to handle it. Others hold that the expiation was specified as feeding and should be discharged as feeding, so that what reaches the recipient is a meal and not a transfer. We do not adjudicate between them. Note that this question only arises once feeding is the option that applies to you, which under the ordered reading is not the first option for a broken fast.',
    ar: 'اختلف العلماء. فكثير منهم يرون جواز دفع القيمة نقدًا لتُشترى بها الأطعمة وتُوزَّع، لأن الواجب إطعام الناس، والمال وسيلة إليه؛ وعلى هذا تعمل أكثر الجمعيات الخيرية، ومنها جمعيتنا. ويرى آخرون أن الكفارة نُصّ عليها إطعامًا فتُؤدّى إطعامًا، بحيث يصل إلى المستحق طعام لا تحويل مالي. ونحن لا نرجّح بين القولين. ولاحظ أن هذه المسألة لا تُطرح إلا إذا كان الإطعام هو الخيار الذي ينطبق عليك، وهو على القول بالترتيب ليس الخيار الأول في كفارة الإفطار.',
  },
  faq6Q: { en: 'Do I owe kaffarah if I missed a fast because I was ill?', ar: 'هل تجب عليّ الكفارة إن أفطرت بسبب المرض؟' },
  faq6A: {
    en: 'No — and this is the most important thing on the page. A fast missed or broken because of illness, or because you were travelling, is made up day for day once you are able, and no expiation is owed on top of it. If an illness is chronic and you are not expected to become able to fast at all, the commonly taught position is that fidya is given instead, which is feeding one poor person for each missed day and is a far smaller obligation than kaffarah. People sometimes arrive at this calculator convinced they owe sixty days of fasting for a week of flu; they do not.',
    ar: 'لا، وهذا أهم ما في هذه الصفحة. فالصوم الذي يفوت أو يُفطر فيه بسبب المرض، أو بسبب السفر، يُقضى يومًا بيوم عند الاستطاعة، ولا كفارة فوق ذلك. وإن كان المرض مزمنًا لا يُرجى معه القدرة على الصيام أصلًا، فالقول الذي يُدرَّس عادةً أن الواجب الفدية بدلًا منه، وهي إطعام مسكين واحد عن كل يوم فات، وهي أخفّ بكثير من الكفارة. وقد يصل بعض الناس إلى هذه الحاسبة وهم مقتنعون أن عليهم صيام ستين يومًا بسبب أسبوع من الإنفلونزا؛ وليس عليهم ذلك.',
  },

  // Structured data
  webAppDescription: {
    en: 'A free calculator for kaffarah, the expiation owed for a deliberately broken fast: enter the days and a local cost of feeding one person, and see the amount.',
    ar: 'حاسبة مجانية للكفارة الواجبة على من أفطر في رمضان عمدًا: أدخل عدد الأيام وتكلفة إطعام شخص واحد في بلدك، لتعرف المبلغ.',
  },
  howToName: { en: 'How to work out your kaffarah', ar: 'كيف تحسب الكفارة' },
  howToDescription: {
    en: 'Four steps from a deliberately broken fast to the expiation owed for it, and how to tell when none is owed at all.',
    ar: 'أربع خطوات من الإفطار المتعمَّد إلى الكفارة الواجبة فيه، ومعرفة متى لا تجب كفارة أصلًا.',
  },
  step1Name: { en: 'Check that kaffarah is what you owe', ar: 'تحقّق من أن الواجب عليك هو الكفارة' },
  step1Text: {
    en: 'A fast missed through illness or travel is made up, not expiated. Kaffarah is for a fast broken deliberately, without a valid excuse.',
    ar: 'الصوم الذي فات بسبب المرض أو السفر يُقضى ولا كفارة فيه. والكفارة لمن أفطر عمدًا بغير عذر شرعي.',
  },
  step2Name: { en: 'Count the days', ar: 'عُدّ الأيام' },
  step2Text: {
    en: 'The expiation is reckoned per day deliberately broken, not once for the whole of Ramadan.',
    ar: 'تُحسب الكفارة عن كل يوم أُفطر عمدًا، لا مرة واحدة عن رمضان كله.',
  },
  step3Name: { en: 'Take the options in order', ar: 'التزم بترتيب الخيارات' },
  step3Text: {
    en: 'The sources give freeing a slave, then fasting two consecutive months, then feeding sixty poor people. Most schools read them as strictly ordered; some treat them as a choice.',
    ar: 'ذكرت النصوص عتق رقبة، ثم صيام شهرين متتابعين، ثم إطعام ستين مسكينًا. وأكثر المذاهب على أنها مرتّبة ترتيبًا لازمًا، وبعضها على التخيير.',
  },
  step4Name: { en: 'Cost the feeding option locally', ar: 'احسب تكلفة الإطعام محليًا' },
  step4Text: {
    en: 'Sixty people fed per day broken, at the cost of a day’s food where you live. Make up the missed day itself as well.',
    ar: 'إطعام ستين شخصًا عن كل يوم أُفطر، بتكلفة طعام يوم في بلدك. واقضِ اليوم الفائت نفسه كذلك.',
  },
})

const KaffarahCalculator = () => {
  const t = useT()
  const locale = useLocale()
  const fmt = useFormat()
  const [daysMissed, setDaysMissed] = useState<number>(1)
  const [foodCostPerPerson, setFoodCostPerPerson] = useState<number>(10)
  const [calculationMethod, setCalculationMethod] = useState<'feeding' | 'monetary'>('monetary')
  const [result, setResult] = useState<{
    totalAmount: number
    peopleToFeed: number
    daysToFast: number
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

  const calculateKaffarah = () => {
    if (daysMissed <= 0) {
      alert(t(M.invalidDays))
      return
    }

    if (calculationMethod === 'feeding') {
      // For feeding: 60 poor people per day missed
      const peopleToFeed = daysMissed * 60
      const totalAmount = peopleToFeed * foodCostPerPerson
      setResult({
        totalAmount,
        peopleToFeed,
        daysToFast: 0
      })
    } else {
      // Monetary equivalent: cost of feeding 60 people per day missed
      const peopleToFeed = daysMissed * 60
      const totalAmount = peopleToFeed * foodCostPerPerson
      setResult({
        totalAmount,
        peopleToFeed,
        daysToFast: daysMissed * 60 // Two consecutive months = approximately 60 days
      })
    }
  }

  // English keeps its original "$12.34" and "day(s)"; Arabic formats the
  // amount through Intl and picks the CLDR plural form for each count.
  const dollars = (n: number) => (locale === 'en' ? `$${n.toFixed(2)}` : fmt.money(Math.round(n * 100), { decimals: true }))
  const count = (n: number) => (locale === 'en' ? n : fmt.number(n))
  const daysPhrase = (n: number) =>
    locale === 'en'
      ? `${n} day${n > 1 ? 's' : ''}`
      : fmt.plural(n, { one: 'يوم واحد', two: 'يومين', few: '{count} أيام', many: '{count} يومًا', other: '{count} يوم' })
  const daysInFormula = (n: number) =>
    locale === 'en'
      ? `${n} day${n > 1 ? 's' : ''}`
      : fmt.plural(n, { one: '{count} يوم', two: '{count} يوم', few: '{count} أيام', many: '{count} يومًا', other: '{count} يوم' })
  const poorPeople = (n: number) =>
    locale === 'en'
      ? String(n)
      : fmt.plural(n, { one: 'مسكين واحد', two: 'مسكينين', few: '{count} مساكين', many: '{count} مسكينًا', other: '{count} مسكين' })

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
      { name: t(C.kaffarahCalculator), path: `${prefix}/kaffarah-calculator` },
    ]),
    getFaqJsonLd(faqs),
    getWebApplicationJsonLd({
      name: t(C.kaffarahCalculator),
      description: t(M.webAppDescription),
      path: `${prefix}/kaffarah-calculator`,
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
    price: fmt.money(500),
    one: fmt.money(30000),
    two: fmt.money(60000),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title={title}
        description={t(M.seoDescription)}
        canonicalPath="/kaffarah-calculator"
        jsonLd={jsonLd}
      />

      <PageHeader
        title={title}
        description={t(M.lead)}
      />

      <div className="section-container py-8 sm:py-10">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          {/* What it is NOT — the most important thing on the page, so it
              stays open, directly above the tool. */}
          <section className="alert-warning block p-6 text-base" aria-labelledby="kaffarah-not">
            <h2 id="kaffarah-not" className="flex items-center text-lg font-heading font-bold text-amber-900 mb-2">
              <AlertCircle className="w-5 h-5 text-amber-700 me-2 shrink-0" aria-hidden="true" />
              {t(M.notTitle)}
            </h2>
            <p className="text-amber-900 leading-relaxed">
              {t(M.notBefore)}<strong>{t(M.notStrong)}</strong>{t(M.notAfter)}
            </p>
          </section>

          {/* Calculator Form — unchanged behaviour */}
          <section className="card sm:p-8" aria-labelledby="kaffarah-form">
            <h2 id="kaffarah-form" className="text-xl font-heading font-bold text-gray-900 mb-2">
              {t(M.formTitle)}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {t(M.formIntro)}
            </p>

            <div className="space-y-6">
              {/* Days Missed */}
              <div>
                <label htmlFor="kaffarah-days" className="label">
                  {t(M.daysLabel)}
                </label>
                <input
                  id="kaffarah-days"
                  type="number"
                  min="1"
                  value={daysMissed}
                  onChange={(e) => setDaysMissed(parseInt(e.target.value) || 1)}
                  className="input-field w-full max-w-xs"
                  placeholder="1"
                />
                <p className="help-text">
                  {t(M.daysHelp)}
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
                      value="feeding"
                      checked={calculationMethod === 'feeding'}
                      onChange={() => setCalculationMethod('feeding')}
                      className="me-3"
                    />
                    <span className="text-gray-700">{t(M.methodFeeding)}</span>
                  </label>
                </div>
                <p className="help-text">
                  {t(M.methodHelp)}
                </p>
              </fieldset>

              {/* Food Cost Per Person */}
              <div>
                <label htmlFor="kaffarah-cost" className="label">
                  {t(M.costLabel)}
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-500" aria-hidden="true" />
                  </div>
                  <input
                    id="kaffarah-cost"
                    type="number"
                    min="1"
                    step="0.01"
                    value={foodCostPerPerson}
                    onChange={(e) => setFoodCostPerPerson(parseFloat(e.target.value) || 10)}
                    className="input-field ps-10 w-full"
                    placeholder="10.00"
                  />
                </div>
                <p className="help-text">
                  {t(M.costHelp)}
                </p>
              </div>

              {/* Calculate Button */}
              <button
                type="button"
                onClick={calculateKaffarah}
                className="btn-primary btn-lg w-full sm:w-auto"
              >
                {t(M.calculate)}
              </button>
            </div>
          </section>

          {/* Results — unchanged figures */}
          {result && (
            <section className="card-tinted sm:p-8" aria-live="polite" aria-labelledby="kaffarah-result">
              <h2 id="kaffarah-result" className="text-xl font-heading font-bold text-gray-900 mb-6">
                {t(M.resultTitle)}
              </h2>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">{t(M.peopleToFeed)}</dt>
                  <dd className="text-2xl font-bold text-gray-900">{count(result.peopleToFeed)}</dd>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                  <dt className="text-sm text-gray-600 mb-1">{t(M.totalAmount)}</dt>
                  <dd className="text-2xl font-bold text-gray-900">{dollars(result.totalAmount)}</dd>
                </div>
                {calculationMethod === 'monetary' && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                    <dt className="text-sm text-gray-600 mb-1">{t(M.daysToFast)}</dt>
                    <dd className="text-2xl font-bold text-gray-900">{count(result.daysToFast)}</dd>
                    <dd className="text-xs text-gray-500 mt-1">{t(M.alternative)}</dd>
                  </div>
                )}
              </dl>

              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">{t(M.summary)}</h3>
                <p className="text-gray-700 mb-2">
                  {t(M.summaryIntro, { days: daysPhrase(daysMissed) })}
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li><strong>{t(M.feedStrong, { people: poorPeople(result.peopleToFeed) })}</strong>{t(M.feedFormula, { days: daysInFormula(daysMissed) })}</li>
                  <li><strong>{t(M.payStrong, { amount: dollars(result.totalAmount) })}</strong>{t(M.payRest)}</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  {t(M.resultNote)}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* The purpose keeps kaffarah money recorded apart from zakat
                    (see "How it is given"). */}
                <Link
                  to={`/donate?purpose=Kaffarah&amount=${result.totalAmount.toFixed(2)}`}
                  className="btn-primary"
                >
                  {t(C.donateNow)}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setDaysMissed(1)
                    setFoodCostPerPerson(10)
                  }}
                  className="btn-secondary"
                >
                  {t(M.calculateAgain)}
                </button>
              </div>
            </section>
          )}

          {/* The explanations, folded under the tool. The text stays in the
              DOM (and the FAQ in the schema). */}
          <section aria-labelledby="kaffarah-learn" className="space-y-3">
            <h2 id="kaffarah-learn" className={HEADING}>{t(M.learnTitle)}</h2>

            <Disclosure title={t(M.whatTitle)} summary={t(M.whatSummary)}>
              <p className={PROSE}>
                {t(M.whatP1)}
              </p>
              <p className={PROSE}>
                {t(M.whatP2)}
              </p>
            </Disclosure>

            <Disclosure
              title={t(M.optionsTitle)}
              summary={t(M.optionsSummary)}
            >
              <p className={PROSE}>
                {t(M.optionsIntro)}
              </p>
              <ol className="space-y-3 text-gray-700 list-decimal list-inside">
                <li>
                  <strong>{t(M.opt1Strong)}</strong> {t(M.opt1)}
                </li>
                <li>
                  <strong>{t(M.opt2Strong)}</strong> {t(M.opt2)}
                </li>
                <li>
                  <strong>{t(M.opt3Strong)}</strong> {t(M.opt3)}
                </li>
              </ol>
              <p className={PROSE}>
                <strong>{t(M.orderStrong)}</strong>{t(M.orderRest)}
              </p>
              <p className={PROSE}>
                {t(M.oathP)}
              </p>
            </Disclosure>

            {/* A worked example — withheld whenever the page is withholding
                dollar figures, on the same rule as /nisab and /zakat-calculator. */}
            {showFigure && (
              <Disclosure title={t(M.exampleTitle)} summary={t(M.exampleSummary, exampleVars)}>
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
                    <strong>{t(M.exampleOneLabel)}</strong> {t(M.exampleOne, exampleVars)}
                  </li>
                  <li>
                    <strong>{t(M.exampleTwoLabel)}</strong> {t(M.exampleTwo, exampleVars)}
                  </li>
                  <li>
                    <strong>{t(M.exampleAlsoLabel)}</strong> {t(M.exampleAlso)}
                  </li>
                </ul>
                <p className={PROSE}>
                  {t(M.exampleOutro)}
                </p>
              </Disclosure>
            )}

            <Disclosure title={t(M.giveTitle)} summary={t(M.giveSummary)}>
              <p className={PROSE}>
                {t(M.giveP1)}
              </p>
              <p className={PROSE}>
                {t(M.giveP2)}
              </p>
              <Link to="/zakat-calculator" className="link inline-flex items-center">
                {t(M.zakatLink)}
                <ArrowRight className="ms-2 w-4 h-4" aria-hidden="true" />
              </Link>
            </Disclosure>
          </section>

          {/* FAQ — the same text that goes into the FAQPage schema */}
          <section aria-labelledby="kaffarah-faq">
            <h2 id="kaffarah-faq" className={HEADING}>{t(M.faqTitle)}</h2>
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

export default KaffarahCalculator
