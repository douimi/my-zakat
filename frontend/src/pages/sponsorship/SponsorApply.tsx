/**
 * /sponsor/apply           — choose: a family, or an orphan.
 * /sponsor/apply/:kind     — the guided request, five steps.
 *
 * Written for people who may be filling in a form like this for the first
 * time, often on a phone with a poor connection:
 *   - one topic per step, short labels, help under the field rather than in a manual;
 *   - answers are kept on the device until sent, so a dropped connection or a
 *     closed tab costs nothing;
 *   - documents are asked for, not demanded: a family without a scanner today
 *     is told exactly what is missing and can send it later from its space;
 *   - the server re-validates everything; its field errors are mapped back to
 *     the step and the field they belong to.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText, Home, Plus, Trash2, Upload, User, Users,
} from 'lucide-react'
import { clsx } from 'clsx'
import SEOHead from '../../components/SEOHead'
import { DOC_LABELS, NEED_CATEGORIES, NEED_LABELS, SUGGESTED_DOCS } from '../../components/sponsorship/labels'
import { defineMessages, useFormat, useLocale, useT, type Message } from '../../i18n'
import { C } from '../../i18n/common'
import { submitApplication, type ApplicantCase, type DocType, type Kind, type NeedCategory } from '../../utils/sponsorshipApi'

// ─────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────

const M = defineMessages({
  chooseTitle: { en: 'Request sponsorship', ar: 'طلب كفالة' },
  chooseLead: {
    en: 'For a family in need or for an orphan. You can file it yourself, as a guardian, or as an association that accompanies them. Every request is reviewed in confidence.',
    ar: 'لأسرة محتاجة أو ليتيم. يمكنك تقديم الطلب بنفسك، أو بصفتك وصيًّا، أو باسم جمعية ترافقهم. ندرس كل طلب بسرية تامة.',
  },
  familyDoor: { en: 'A family in need', ar: 'أسرة محتاجة' },
  familyDoorBody: { en: 'A household struggling to cover rent, food or essentials.', ar: 'أسرة تعجز عن تغطية الإيجار أو الغذاء أو الضروريات.' },
  orphanDoor: { en: 'An orphan', ar: 'يتيم' },
  orphanDoorBody: { en: 'A child under 18 who has lost their father, their mother, or both.', ar: 'طفل دون 18 عامًا فقد أباه أو أمه أو كليهما.' },
  youWillNeed: { en: 'Have these ready if you can', ar: 'جهّز هذه الوثائق إن أمكن' },
  requiredMark: { en: 'needed for approval', ar: 'مطلوبة للموافقة' },
  sendLater: { en: 'Missing something? You can still file the request and send documents later.', ar: 'ينقصك شيء؟ يمكنك تقديم الطلب الآن وإرسال الوثائق لاحقًا.' },
  start: { en: 'Start', ar: 'ابدأ' },
  alreadyFiled: { en: 'Already filed a request? Follow it here.', ar: 'قدّمت طلبًا من قبل؟ تابعه من هنا.' },
  privacyNote: {
    en: 'What you tell us stays with our team. If the request is published, donors only see a first name or pseudonym, an age and a region.',
    ar: 'تبقى المعلومات التي تقدّمها لدى فريقنا. وإذا نُشر الطلب، فلن يرى المتبرعون إلا اسمًا أول أو اسمًا مستعارًا والعمر والمنطقة.',
  },

  familyTitle: { en: 'Request sponsorship for a family', ar: 'طلب كفالة أسرة' },
  orphanTitle: { en: 'Request sponsorship for an orphan', ar: 'طلب كفالة يتيم' },
  stepOf: { en: 'Step {n} of {total}', ar: 'الخطوة {n} من {total}' },
  savedOnDevice: { en: 'Your answers are kept on this device until you send them.', ar: 'تُحفظ إجاباتك على هذا الجهاز إلى أن ترسلها.' },
  back: { en: 'Back', ar: 'السابق' },
  next: { en: 'Next', ar: 'التالي' },
  send: { en: 'Send the request', ar: 'إرسال الطلب' },
  sending: { en: 'Sending… {percent}%', ar: 'جارٍ الإرسال… {percent}%' },
  fixErrors: { en: 'Please check the highlighted fields.', ar: 'يُرجى مراجعة الحقول المظللة.' },
  requiredField: { en: 'This is required.', ar: 'هذا الحقل مطلوب.' },
  invalidEmail: { en: 'Enter a valid email address.', ar: 'أدخل بريدًا إلكترونيًا صحيحًا.' },
  tooShort: { en: 'Please say a little more (at least 20 characters).', ar: 'يُرجى التوضيح أكثر (20 حرفًا على الأقل).' },
  tooOld: { en: 'Orphan sponsorship is for children under 18. An older young person can be included in a family request.', ar: 'كفالة اليتيم للأطفال دون 18 عامًا. ويمكن إدراج الشاب الأكبر سنًا ضمن طلب كفالة أسرة.' },
  serverError: { en: 'The request could not be sent. Your answers are still here; please try again.', ar: 'تعذّر إرسال الطلب. ما زالت إجاباتك محفوظة؛ يُرجى المحاولة مرة أخرى.' },
  tooMany: { en: 'Too many requests were sent from this connection. Please try again in an hour.', ar: 'أُرسل عدد كبير من الطلبات من هذا الاتصال. يُرجى المحاولة بعد ساعة.' },

  // Step names
  sApplicant: { en: 'Who is applying', ar: 'مقدّم الطلب' },
  sHousehold: { en: 'The household', ar: 'الأسرة' },
  sSituation: { en: 'The situation', ar: 'الوضع' },
  sNeeds: { en: 'Monthly needs', ar: 'الاحتياجات الشهرية' },
  sDocuments: { en: 'Documents and consent', ar: 'الوثائق والموافقة' },
  sChild: { en: 'The child', ar: 'الطفل' },
  sParents: { en: 'Parents and guardian', ar: 'الوالدان والوصي' },
  sSituationNeeds: { en: 'Situation and needs', ar: 'الوضع والاحتياجات' },

  // Applicant
  appliesAs: { en: 'I am filing this request', ar: 'أقدّم هذا الطلب' },
  asSelfFamily: { en: 'for my own family', ar: 'لأسرتي' },
  asSelfOrphan: { en: 'as the child’s parent or guardian', ar: 'بصفتي والد الطفل أو وصيه' },
  asOrganization: { en: 'on behalf of an association', ar: 'باسم جمعية' },
  yourName: { en: 'Your full name', ar: 'اسمك الكامل' },
  contactAddress: { en: 'Your email address', ar: 'بريدك الإلكتروني' },
  contactAddressHelp: { en: 'We write to you here, and you use it to follow the request. An association can use one address for all its requests.', ar: 'نراسلك عليه، وتستخدمه لمتابعة الطلب. ويمكن للجمعية استخدام بريد واحد لكل طلباتها.' },
  phone: { en: 'Phone (with country code)', ar: 'رقم الهاتف (مع رمز الدولة)' },
  orgName: { en: 'Name of the association', ar: 'اسم الجمعية' },
  orgRegistration: { en: 'Registration number', ar: 'رقم التسجيل' },
  orgRole: { en: 'Your role in the association', ar: 'صفتك في الجمعية' },

  // Household
  headName: { en: 'Full name of the head of household', ar: 'الاسم الكامل لربّ/ربّة الأسرة' },
  headId: { en: 'Their national ID number', ar: 'رقم بطاقة الهوية' },
  headBirthYear: { en: 'Their year of birth', ar: 'سنة الميلاد' },
  headGender: { en: 'The head of household is', ar: 'ربّ الأسرة' },
  man: { en: 'A man', ar: 'رجل' },
  woman: { en: 'A woman', ar: 'امرأة' },
  marital: { en: 'Marital status', ar: 'الحالة الاجتماعية' },
  married: { en: 'Married', ar: 'متزوج/ة' },
  widowed: { en: 'Widowed', ar: 'أرمل/ة' },
  divorced: { en: 'Divorced', ar: 'مطلّق/ة' },
  separated: { en: 'Separated or abandoned', ar: 'منفصل/ة أو مهجور/ة' },
  single: { en: 'Single', ar: 'أعزب/عزباء' },
  occupation: { en: 'Their work, if any', ar: 'العمل إن وُجد' },
  householdSize: { en: 'How many people live in the household?', ar: 'كم عدد أفراد الأسرة الذين يعيشون معًا؟' },
  housing: { en: 'Housing', ar: 'السكن' },
  owned: { en: 'Owned', ar: 'ملك' },
  rented: { en: 'Rented', ar: 'إيجار' },
  hosted: { en: 'Hosted by relatives or others', ar: 'لدى الأقارب أو غيرهم' },
  shelter: { en: 'Shelter or camp', ar: 'مأوى أو مخيم' },
  otherOption: { en: 'Other', ar: 'أخرى' },
  rent: { en: 'Monthly rent (USD)', ar: 'الإيجار الشهري (بالدولار)' },
  members: { en: 'The other members of the household', ar: 'باقي أفراد الأسرة' },
  membersHelp: { en: 'First names only. Tick the children who have lost a parent.', ar: 'الاسم الأول فقط. ضع علامة أمام الأطفال الذين فقدوا أحد الوالدين.' },
  memberFirstName: { en: 'First name', ar: 'الاسم الأول' },
  relationship: { en: 'Relationship', ar: 'صلة القرابة' },
  rel_spouse: { en: 'Spouse', ar: 'زوج/زوجة' },
  rel_child: { en: 'Child', ar: 'ابن/ابنة' },
  rel_parent: { en: 'Parent', ar: 'أب/أم' },
  rel_sibling: { en: 'Brother or sister', ar: 'أخ/أخت' },
  rel_grandchild: { en: 'Grandchild', ar: 'حفيد/حفيدة' },
  rel_grandparent: { en: 'Grandparent', ar: 'جد/جدة' },
  rel_other: { en: 'Other', ar: 'أخرى' },
  birthYear: { en: 'Year of birth', ar: 'سنة الميلاد' },
  schoolOrWork: { en: 'School or work', ar: 'الدراسة أو العمل' },
  isOrphan: { en: 'Has lost a parent', ar: 'فقد أحد الوالدين' },
  addMember: { en: 'Add a person', ar: 'إضافة فرد' },
  removeMember: { en: 'Remove', ar: 'حذف' },
  orphanHint: {
    en: 'A child who has lost a parent can also be sponsored individually: file an orphan request for them after this one, from “Follow my request”.',
    ar: 'يمكن أيضًا كفالة الطفل الذي فقد أحد والديه بشكل مستقل: قدّم له طلب كفالة يتيم بعد هذا الطلب، من صفحة «متابعة طلبي».',
  },
  healthNotes: { en: 'Illness or disability in the household', ar: 'أمراض أو إعاقات في الأسرة' },

  // Situation
  country: { en: 'Country', ar: 'البلد' },
  region: { en: 'Region or province', ar: 'المنطقة أو المحافظة' },
  city: { en: 'City, town or village', ar: 'المدينة أو البلدة أو القرية' },
  address: { en: 'Address (never published)', ar: 'العنوان (لا يُنشر أبدًا)' },
  situationCategory: { en: 'The main reason for the hardship', ar: 'السبب الرئيسي للحاجة' },
  sc_loss_of_breadwinner: { en: 'Loss of the breadwinner', ar: 'فقدان المعيل' },
  sc_illness_disability: { en: 'Illness or disability', ar: 'مرض أو إعاقة' },
  sc_unemployment: { en: 'Unemployment', ar: 'بطالة' },
  sc_displacement: { en: 'Displacement or war', ar: 'نزوح أو حرب' },
  sc_divorce_abandonment: { en: 'Divorce or abandonment', ar: 'طلاق أو هجر' },
  sc_low_income: { en: 'Income too low to live on', ar: 'دخل لا يكفي للعيش' },
  sc_other: { en: 'Other', ar: 'أخرى' },
  situation: { en: 'Describe the situation in your own words', ar: 'صف الوضع بكلماتك' },
  situationHelp: { en: 'What happened, how the household lives today, what is most difficult.', ar: 'ماذا حدث، وكيف تعيش الأسرة اليوم، وما أصعب ما تواجهه.' },
  income: { en: 'Total monthly income of the household (USD)', ar: 'مجموع الدخل الشهري للأسرة (بالدولار)' },
  incomeHelp: { en: 'Enter 0 if there is none.', ar: 'أدخل 0 إن لم يوجد دخل.' },
  incomeSources: { en: 'Where does that income come from?', ar: 'ما مصدر هذا الدخل؟' },
  otherAid: { en: 'Help already received from other organisations', ar: 'المساعدات المتلقاة من جهات أخرى' },

  // Needs
  needsLead: {
    en: 'List what the household needs each month, in US dollars. Our team may adjust the amount after review.',
    ar: 'اذكر ما تحتاجه الأسرة كل شهر بالدولار الأمريكي. قد يعدّل فريقنا المبلغ بعد الدراسة.',
  },
  needsLeadOrphan: {
    en: 'List what the child needs each month, in US dollars: what is the child’s own (school, clothing, care, their share of food).',
    ar: 'اذكر ما يحتاجه الطفل كل شهر بالدولار الأمريكي: ما يخصه هو (الدراسة، الملابس، الرعاية، نصيبه من الغذاء).',
  },
  category: { en: 'Need', ar: 'الاحتياج' },
  monthlyAmount: { en: 'Per month (USD)', ar: 'شهريًا (بالدولار)' },
  needNote: { en: 'Details (optional)', ar: 'تفاصيل (اختياري)' },
  addNeed: { en: 'Add a need', ar: 'إضافة احتياج' },
  removeNeed: { en: 'Remove this need', ar: 'حذف هذا الاحتياج' },
  total: { en: 'Total per month', ar: 'المجموع الشهري' },
  needsRequired: { en: 'Add at least one need with an amount.', ar: 'أضف احتياجًا واحدًا على الأقل مع مبلغه.' },
  urgent: { en: 'Anything urgent right now?', ar: 'هل هناك أمر عاجل الآن؟' },

  // Child
  childName: { en: 'The child’s full name', ar: 'الاسم الكامل للطفل' },
  childNameHelp: { en: 'Never published. Donors only see a first name or a pseudonym.', ar: 'لا يُنشر أبدًا. لا يرى المتبرعون إلا اسمًا أول أو اسمًا مستعارًا.' },
  childGender: { en: 'The child is', ar: 'الطفل' },
  boy: { en: 'A boy', ar: 'ولد' },
  girl: { en: 'A girl', ar: 'بنت' },
  birthDate: { en: 'Date of birth', ar: 'تاريخ الميلاد' },
  schoolLevel: { en: 'School year or level', ar: 'السنة أو المستوى الدراسي' },
  schoolName: { en: 'School name', ar: 'اسم المدرسة' },
  healthStatus: { en: 'Health (illness, disability, treatment)', ar: 'الحالة الصحية (مرض، إعاقة، علاج)' },
  interests: { en: 'What the child enjoys or dreams of (optional)', ar: 'ما يحبه الطفل أو يحلم به (اختياري)' },
  livesWith: { en: 'The child lives with', ar: 'يعيش الطفل مع' },
  lw_mother: { en: 'Their mother', ar: 'أمه' },
  lw_relatives: { en: 'Relatives', ar: 'أقاربه' },
  lw_guardian: { en: 'A guardian', ar: 'وصيّ' },
  lw_orphanage: { en: 'An orphanage', ar: 'دار أيتام' },
  lw_other: { en: 'Other', ar: 'أخرى' },
  siblings: { en: 'Brothers and sisters who are also orphans', ar: 'عدد الإخوة والأخوات الأيتام أيضًا' },
  familyRef: { en: 'Reference of the child’s family, if it is already registered with us', ar: 'الرقم المرجعي لأسرة الطفل إن كانت مسجّلة لدينا' },
  familyRefHelp: { en: 'For example F-7K3Q9P. Only a family filed from the same email address is linked.', ar: 'مثل F-7K3Q9P. لا يُربط إلا بأسرة مسجّلة من البريد الإلكتروني نفسه.' },

  // Parents
  orphanType: { en: 'The child has lost', ar: 'فقد الطفل' },
  lostFather: { en: 'Their father', ar: 'أباه' },
  lostMother: { en: 'Their mother', ar: 'أمه' },
  lostBoth: { en: 'Both parents', ar: 'والديه كليهما' },
  fatherName: { en: 'Father’s full name', ar: 'الاسم الكامل للأب' },
  fatherDeath: { en: 'Date of the father’s death', ar: 'تاريخ وفاة الأب' },
  fatherCause: { en: 'Cause of death (optional)', ar: 'سبب الوفاة (اختياري)' },
  motherName: { en: 'Mother’s full name', ar: 'الاسم الكامل للأم' },
  motherDeath: { en: 'Date of the mother’s death', ar: 'تاريخ وفاة الأم' },
  guardianName: { en: 'Full name of the person who looks after the child', ar: 'الاسم الكامل للشخص الذي يرعى الطفل' },
  guardianRel: { en: 'Their relationship to the child', ar: 'صلته بالطفل' },
  guardianId: { en: 'Their national ID number', ar: 'رقم بطاقة هويته' },
  guardianPhone: { en: 'Their phone number', ar: 'رقم هاتفه' },

  // Documents & consent
  docsLead: {
    en: 'Attach clear photos or scans (PDF, JPG or PNG, up to 15 MB each). Documents are only seen by our team.',
    ar: 'أرفق صورًا أو نسخًا ممسوحة واضحة (PDF أو JPG أو PNG، حتى 15 ميغابايت لكل ملف). لا يطّلع على الوثائق إلا فريقنا.',
  },
  chooseFile: { en: 'Choose a file', ar: 'اختر ملفًا' },
  replaceFile: { en: 'Replace', ar: 'استبدال' },
  removeFile: { en: 'Remove', ar: 'إزالة' },
  fileTooBig: { en: 'This file is larger than 15 MB.', ar: 'حجم هذا الملف أكبر من 15 ميغابايت.' },
  missingWarning: {
    en: 'Some documents needed for approval are missing. You can send the request now and add them later from “Follow my request”.',
    ar: 'تنقص بعض الوثائق المطلوبة للموافقة. يمكنك إرسال الطلب الآن وإضافتها لاحقًا من صفحة «متابعة طلبي».',
  },
  consentVerify: {
    en: 'I confirm the information is true, and I allow MyZakat to verify it and the documents, including by contacting the people named.',
    ar: 'أؤكد صحة المعلومات، وأسمح لماي زكاة بالتحقق منها ومن الوثائق، بما في ذلك التواصل مع الأشخاص المذكورين.',
  },
  consentPublish: {
    en: 'If the request is approved, I agree that an anonymous profile (first name or pseudonym, age, region, needs, a story written by MyZakat) is shown to donors. No full name, address or document is ever published.',
    ar: 'في حال الموافقة على الطلب، أوافق على عرض صفحة تعريف مجهولة الهوية (اسم أول أو اسم مستعار، العمر، المنطقة، الاحتياجات، قصة تكتبها ماي زكاة) على المتبرعين. لا يُنشر أبدًا أي اسم كامل أو عنوان أو وثيقة.',
  },
  consentPublishHelp: {
    en: 'Without this consent we can still review the request, but we cannot look for a sponsor.',
    ar: 'دون هذه الموافقة يمكننا دراسة الطلب، لكن لا يمكننا البحث عن كفيل.',
  },
  consentRequired: { en: 'We can only review a request we are allowed to verify.', ar: 'لا يمكننا دراسة طلب لا يُسمح لنا بالتحقق منه.' },

  // Success
  doneTitle: { en: 'Your request has been received', ar: 'تم استلام طلبك' },
  doneBody: {
    en: 'Thank you. Our team will review it in confidence and write to you at {email}.',
    ar: 'شكرًا لك. سيدرس فريقنا الطلب بسرية تامة ويراسلك على {email}.',
  },
  reference: { en: 'Your reference', ar: 'الرقم المرجعي' },
  stillMissing: { en: 'Still needed before we can approve it:', ar: 'مطلوب قبل أن نتمكن من الموافقة عليه:' },
  docsStored: { en: '{stored} of {offered} documents were received.', ar: 'تم استلام {stored} من أصل {offered} وثيقة.' },
  follow: { en: 'Follow my request', ar: 'متابعة طلبي' },
  fileOrphan: { en: 'File an orphan request for a child of this family', ar: 'قدّم طلب كفالة يتيم لطفل من هذه الأسرة' },
  editTitle: { en: 'Update request {reference}', ar: 'تحديث الطلب {reference}' },
  messageToTeam: { en: 'A note for our team (optional)', ar: 'ملاحظة لفريقنا (اختياري)' },
  messageHelp: { en: 'Explain what you changed or answer our question.', ar: 'وضّح ما عدّلته أو أجب عن سؤالنا.' },
  sendUpdate: { en: 'Send the updated request', ar: 'إرسال الطلب المحدّث' },
  identityFixed: { en: 'The address a request was filed under cannot be changed.', ar: 'لا يمكن تغيير البريد الإلكتروني الذي قُدّم به الطلب.' },
})

// ─────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────

interface NeedRow { category: NeedCategory | ''; amount: string; note: string }
interface MemberRow { first_name: string; relationship: string; gender: string; birth_year: string; occupation_or_school: string; is_orphan: boolean }

export type Form = Record<string, string | boolean | NeedRow[] | MemberRow[]>

const EMPTY_NEED: NeedRow = { category: '', amount: '', note: '' }
const EMPTY_MEMBER: MemberRow = { first_name: '', relationship: 'child', gender: '', birth_year: '', occupation_or_school: '', is_orphan: false }

const initialForm = (kind: Kind): Form => ({
  submitter_type: 'self', submitter_name: '', email: '', submitter_phone: '',
  organization_name: '', organization_registration: '', organization_contact_role: '',
  country: '', region: '', city: '', address: '',
  situation_category: '', situation_description: '', monthly_income: '', income_sources: '', other_aid: '', urgent_needs: '',
  needs: kind === 'family'
    ? [{ ...EMPTY_NEED, category: 'food' }, { ...EMPTY_NEED, category: 'rent' }]
    : [{ ...EMPTY_NEED, category: 'education' }, { ...EMPTY_NEED, category: 'clothing' }],
  consent_verification: false, consent_publication: false,
  // family
  head_full_name: '', head_national_id: '', head_birth_year: '', head_gender: '', head_marital_status: '',
  head_occupation: '', household_size: '', housing_status: '', monthly_rent: '', health_notes: '', members: [],
  // orphan
  full_name: '', gender: '', birth_date: '', school_level: '', school_name: '', health_status: '', interests: '',
  lives_with: '', siblings_count: '0', family_reference: '',
  orphan_type: '', father_name: '', father_death_date: '', father_death_cause: '',
  mother_name: '', mother_death_date: '', guardian_name: '', guardian_relationship: '', guardian_national_id: '', guardian_phone: '',
})

const draftKey = (kind: Kind) => `myzakat_sponsorship_draft_${kind}`

const dollars = (cents: unknown) => (typeof cents === 'number' && cents > 0 ? String(cents / 100) : '')
const text = (value: unknown) => (value == null ? '' : String(value))

/** The wizard's state from a request as the applicant's space returns it. */
export const formFromCase = (c: ApplicantCase): Form => {
  const d = c.dossier || {}
  const x = c.details || {}
  const form: Form = {
    ...initialForm(c.kind),
    submitter_type: d.organization_name ? 'organization' : 'self',
    submitter_name: text(d.submitter_name), submitter_phone: text(d.submitter_phone),
    organization_name: text(d.organization_name), organization_registration: text(d.organization_registration),
    organization_contact_role: text(d.organization_contact_role),
    country: text(d.country), region: text(d.region), city: text(d.city), address: text(d.address),
    situation_category: text(d.situation_category), situation_description: text(d.situation_description),
    monthly_income: dollars(d.monthly_income_cents), income_sources: text(d.income_sources),
    other_aid: text(d.other_aid), urgent_needs: text(d.urgent_needs),
    needs: (d.needs || []).map((n: { category: NeedCategory; monthly_cents: number; note?: string }) =>
      ({ category: n.category, amount: dollars(n.monthly_cents), note: text(n.note) })),
    consent_verification: true,
    consent_publication: Boolean(d.consent_publication),
  }
  for (const [key, value] of Object.entries(x)) {
    if (key === 'monthly_rent_cents') form.monthly_rent = dollars(value)
    else if (key in form && typeof form[key] === 'string') form[key] = text(value)
  }
  if (c.kind === 'family') {
    form.members = (c.members || []).map((m) => ({
      first_name: text(m.first_name), relationship: text(m.relationship) || 'other', gender: text(m.gender),
      birth_year: text(m.birth_year), occupation_or_school: text(m.occupation_or_school), is_orphan: Boolean(m.is_orphan),
    }))
  } else if (c.family_reference) {
    form.family_reference = c.family_reference
  }
  return form
}

export interface EditMode {
  reference: string
  email: string
  initial: Form
  /** Sends the corrected request; files go up afterwards. Rejects with the API error. */
  onSubmit: (payload: Record<string, unknown>, files: { file: File; docType: DocType }[],
    onProgress: (percent: number) => void) => Promise<void>
  onCancel: () => void
}

const toCents = (v: string) => Math.round((parseFloat(v || '0') || 0) * 100)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const optional = (v: unknown) => str(v) || null
const optInt = (v: unknown) => (str(v) ? parseInt(str(v), 10) : null)

/** The request body the backend schema expects (sponsorship_schemas.py). */
const buildPayload = (kind: Kind, f: Form, lang: 'en' | 'ar', consentText: string) => {
  const needs = (f.needs as NeedRow[])
    .filter((n) => n.category && toCents(n.amount) > 0)
    .map((n) => ({ category: n.category, monthly_cents: toCents(n.amount), note: optional(n.note) }))
  const base = {
    lang,
    submitter_type: f.submitter_type,
    submitter_name: str(f.submitter_name),
    email: str(f.email),
    submitter_phone: optional(f.submitter_phone),
    organization_name: f.submitter_type === 'organization' ? optional(f.organization_name) : null,
    organization_registration: f.submitter_type === 'organization' ? optional(f.organization_registration) : null,
    organization_contact_role: f.submitter_type === 'organization' ? optional(f.organization_contact_role) : null,
    country: str(f.country), region: optional(f.region), city: str(f.city), address: optional(f.address),
    situation_category: optional(f.situation_category),
    situation_description: str(f.situation_description),
    monthly_income_cents: toCents(f.monthly_income as string),
    income_sources: optional(f.income_sources), other_aid: optional(f.other_aid), urgent_needs: optional(f.urgent_needs),
    needs,
    consent_verification: Boolean(f.consent_verification),
    consent_publication: Boolean(f.consent_publication),
    consent_text: consentText,
  }
  if (kind === 'family') {
    return {
      ...base,
      head_full_name: str(f.head_full_name), head_national_id: optional(f.head_national_id),
      head_birth_year: optInt(f.head_birth_year), head_gender: optional(f.head_gender),
      head_marital_status: optional(f.head_marital_status), head_occupation: optional(f.head_occupation),
      household_size: optInt(f.household_size), housing_status: optional(f.housing_status),
      monthly_rent_cents: toCents(f.monthly_rent as string), health_notes: optional(f.health_notes),
      members: (f.members as MemberRow[]).filter((m) => m.first_name.trim()).map((m) => ({
        first_name: m.first_name.trim(), relationship: m.relationship, gender: m.gender || null,
        birth_year: optInt(m.birth_year), occupation_or_school: optional(m.occupation_or_school), is_orphan: m.is_orphan,
      })),
    }
  }
  return {
    ...base,
    full_name: str(f.full_name), gender: optional(f.gender), birth_date: optional(f.birth_date),
    orphan_type: optional(f.orphan_type),
    father_name: optional(f.father_name), father_death_date: optional(f.father_death_date),
    father_death_cause: optional(f.father_death_cause),
    mother_name: optional(f.mother_name),
    mother_alive: f.orphan_type === 'father' ? true : f.orphan_type ? false : null,
    mother_death_date: f.orphan_type === 'father' ? null : optional(f.mother_death_date),
    guardian_name: str(f.guardian_name), guardian_relationship: str(f.guardian_relationship),
    guardian_national_id: optional(f.guardian_national_id), guardian_phone: optional(f.guardian_phone),
    lives_with: optional(f.lives_with), school_level: optional(f.school_level), school_name: optional(f.school_name),
    health_status: optional(f.health_status), interests: optional(f.interests),
    siblings_count: optInt(f.siblings_count) ?? 0,
    family_reference: optional(f.family_reference)?.toUpperCase() ?? null,
  }
}

// Which step owns which field, for jumping to the first error.
const STEP_FIELDS: Record<Kind, string[][]> = {
  family: [
    ['submitter_type', 'submitter_name', 'email', 'submitter_phone', 'organization_name', 'organization_registration', 'organization_contact_role'],
    ['head_full_name', 'head_national_id', 'head_birth_year', 'head_gender', 'head_marital_status', 'head_occupation', 'household_size', 'housing_status', 'monthly_rent', 'monthly_rent_cents', 'members', 'health_notes'],
    ['country', 'region', 'city', 'address', 'situation_category', 'situation_description', 'monthly_income', 'monthly_income_cents', 'income_sources', 'other_aid'],
    ['needs', 'urgent_needs'],
    ['consent_verification', 'consent_publication'],
  ],
  orphan: [
    ['submitter_type', 'submitter_name', 'email', 'submitter_phone', 'organization_name', 'organization_registration', 'organization_contact_role'],
    ['full_name', 'gender', 'birth_date', 'school_level', 'school_name', 'health_status', 'interests', 'lives_with', 'siblings_count', 'family_reference'],
    ['orphan_type', 'father_name', 'father_death_date', 'father_death_cause', 'mother_name', 'mother_alive', 'mother_death_date', 'guardian_name', 'guardian_relationship', 'guardian_national_id', 'guardian_phone'],
    ['country', 'region', 'city', 'address', 'situation_category', 'situation_description', 'monthly_income', 'monthly_income_cents', 'income_sources', 'other_aid', 'needs', 'urgent_needs'],
    ['consent_verification', 'consent_publication'],
  ],
}

const stepOf = (kind: Kind, field: string) => {
  const i = STEP_FIELDS[kind].findIndex((fields) => fields.includes(field))
  return i < 0 ? 0 : i
}

// ─────────────────────────────────────────────────────────────────────
// Small form parts
// ─────────────────────────────────────────────────────────────────────

const Field = ({ id, label, help, error, optionalField, children }: {
  id: string; label: string; help?: string; error?: string; optionalField?: boolean; children: ReactNode
}) => {
  const t = useT()
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}{optionalField && <span className="font-normal text-gray-500"> ({t(C.optional)})</span>}
      </label>
      {children}
      {help && !error && <p id={`${id}-help`} className="help-text">{help}</p>}
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    </div>
  )
}

const Choice = ({ name, value, current, onChange, label, Icon }: {
  name: string; value: string; current: string; onChange: (v: string) => void; label: string; Icon?: typeof User
}) => (
  <label className={clsx('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5',
    current === value ? 'border-primary-500 bg-primary-50 font-semibold text-primary-900' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50')}>
    <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} className="sr-only" />
    {Icon && <Icon aria-hidden="true" className="h-5 w-5 flex-shrink-0" />}
    {label}
  </label>
)

// ─────────────────────────────────────────────────────────────────────
// The chooser
// ─────────────────────────────────────────────────────────────────────

const Chooser = () => {
  const t = useT()
  const doors: { kind: Kind; title: Message; body: Message; Icon: typeof User }[] = [
    { kind: 'family', title: M.familyDoor, body: M.familyDoorBody, Icon: Home },
    { kind: 'orphan', title: M.orphanDoor, body: M.orphanDoorBody, Icon: User },
  ]
  return (
    <div>
      <SEOHead title={t(M.chooseTitle)} description={t(M.chooseLead)} canonicalPath="/sponsor/apply" />
      <div className="page-header">
        <div className="section-container">
          <h1 className="page-title">{t(M.chooseTitle)}</h1>
          <p className="page-lead">{t(M.chooseLead)}</p>
        </div>
      </div>
      <div className="section-container py-10">
        <div className="grid gap-6 md:grid-cols-2">
          {doors.map(({ kind, title, body, Icon }) => (
            <div key={kind} className="card flex flex-col">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <h2 className="text-xl font-heading font-bold text-gray-900">{t(title)}</h2>
              </div>
              <p className="mt-3 text-gray-700">{t(body)}</p>
              <h3 className="mt-5 text-sm font-semibold text-gray-900">{t(M.youWillNeed)}</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                {SUGGESTED_DOCS[kind].filter((d) => d.type !== 'other' && d.type !== 'photo').map((d) => (
                  <li key={d.type} className="flex items-start gap-2">
                    <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                    <span>{t(DOC_LABELS[d.type])}{d.required && <span className="text-amber-800"> · {t(M.requiredMark)}</span>}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-600">{t(M.sendLater)}</p>
              <Link to={`/sponsor/apply/${kind}`} className="btn-primary mt-6 gap-2 self-start">
                {t(M.start)} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-600">{t(M.privacyNote)}</p>
        <Link to="/my-requests" className="link mt-3 inline-block">{t(M.alreadyFiled)}</Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// The wizard
// ─────────────────────────────────────────────────────────────────────

interface Result { reference: string; documents_stored: number; documents_offered: number; missing_documents: DocType[] }

export const Wizard = ({ kind, edit }: { kind: Kind; edit?: EditMode }) => {
  const t = useT()
  const locale = useLocale()
  const { money } = useFormat()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [form, setForm] = useState<Form>(() => {
    if (edit) return { ...edit.initial, email: edit.email, message: '' }
    try {
      const saved = localStorage.getItem(draftKey(kind))
      if (saved) return { ...initialForm(kind), ...JSON.parse(saved) }
    } catch { /* storage unavailable */ }
    return initialForm(kind)
  })
  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({})
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  // Pre-fill a family reference handed over from "Follow my request".
  useEffect(() => {
    if (edit) return
    const family = params.get('family')
    const email = params.get('email')
    if (family || email) {
      setForm((f) => ({ ...f, ...(family ? { family_reference: family } : {}), ...(email ? { email } : {}) }))
    }
  }, [params, edit])

  // Keep the answers on the device (not the files) until they are sent.
  useEffect(() => {
    if (result || edit) return
    try { localStorage.setItem(draftKey(kind), JSON.stringify(form)) } catch { /* quota or private mode */ }
  }, [form, kind, result, edit])

  const set = (key: string) => (value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const { [key]: _, ...rest } = e; return rest })
  }
  const v = (key: string) => (form[key] as string) ?? ''
  const input = (key: string, extra: Record<string, unknown> = {}) => ({
    id: `f-${key}`,
    value: v(key),
    onChange: (e: { target: { value: string } }) => set(key)(e.target.value),
    className: clsx('input', errors[key] && 'border-red-500'),
    'aria-invalid': Boolean(errors[key]) || undefined,
    'aria-describedby': errors[key] ? `f-${key}-error` : undefined,
    ...extra,
  })

  const steps = kind === 'family'
    ? [M.sApplicant, M.sHousehold, M.sSituation, M.sNeeds, M.sDocuments]
    : [M.sApplicant, M.sChild, M.sParents, M.sSituationNeeds, M.sDocuments]

  const needs = form.needs as NeedRow[]
  const members = form.members as MemberRow[]
  const needsTotal = needs.reduce((sum, n) => sum + (n.category ? toCents(n.amount) : 0), 0)

  /** Client checks for one step; the server checks everything again. */
  const validate = (i: number): Record<string, string> => {
    const e: Record<string, string> = {}
    const req = (k: string) => { if (!str(form[k])) e[k] = t(M.requiredField) }
    if (i === 0) {
      req('submitter_name')
      if (!/^\S+@\S+\.\S+$/.test(str(form.email))) e.email = t(M.invalidEmail)
      if (form.submitter_type === 'organization') req('organization_name')
    }
    if (kind === 'family' && i === 1) {
      req('head_full_name')
      const size = optInt(form.household_size)
      if (!size || size < 1) e.household_size = t(M.requiredField)
    }
    if (kind === 'orphan' && i === 1) {
      req('full_name'); req('gender'); req('birth_date')
      const birth = str(form.birth_date)
      if (birth) {
        const age = (Date.now() - new Date(birth).getTime()) / (365.25 * 86_400_000)
        if (age >= 18) e.birth_date = t(M.tooOld)
      }
    }
    if (kind === 'orphan' && i === 2) {
      req('orphan_type'); req('guardian_name'); req('guardian_relationship')
      if (form.orphan_type === 'father' || form.orphan_type === 'both') req('father_name')
    }
    const situationStep = kind === 'family' ? 2 : 3
    if (i === situationStep) {
      req('country'); req('city')
      if (str(form.situation_description).length < 20) e.situation_description = t(M.tooShort)
    }
    if (i === 3 && needsTotal <= 0) e.needs = t(M.needsRequired)
    if (i === 4 && !form.consent_verification) e.consent_verification = t(M.consentRequired)
    return e
  }

  const goNext = () => {
    const e = validate(step)
    setErrors(e)
    if (Object.keys(e).length) { setBanner(t(M.fixErrors)); return }
    setBanner(null)
    setStep((s) => Math.min(s + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const send = async () => {
    // Every step again: a draft restored from storage may never have passed one.
    for (let i = 0; i < steps.length; i++) {
      const e = validate(i)
      if (Object.keys(e).length) { setErrors(e); setStep(i); setBanner(t(M.fixErrors)); return }
    }
    const consentText = [t(M.consentVerify), form.consent_publication ? t(M.consentPublish) : ''].filter(Boolean).join('\n\n')
    const payload = buildPayload(kind, form, locale, consentText)
    const docs = (Object.entries(files) as [DocType, File][]).map(([docType, file]) => ({ docType, file }))
    setBanner(null)
    setProgress(0)
    try {
      if (edit) {
        await edit.onSubmit({ ...payload, message: optional(form.message) }, docs, setProgress)
        return
      }
      const res = await submitApplication(kind, payload, docs, (loaded, total) => setProgress(Math.round((loaded / total) * 100)))
      try { localStorage.removeItem(draftKey(kind)) } catch { /* ignore */ }
      setResult(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
      if (response?.status === 422 && Array.isArray(response.data?.detail)) {
        const e: Record<string, string> = {}
        let first = steps.length - 1
        for (const item of response.data!.detail as { loc: (string | number)[]; msg: string }[]) {
          const field = String(item.loc.find((p) => typeof p === 'string' && p !== 'body') ?? '')
          if (!field) continue
          e[field] = locale === 'ar' ? t(M.requiredField) : item.msg.replace(/^Value error, /, '')
          first = Math.min(first, stepOf(kind, field))
        }
        setErrors(e)
        setStep(first)
        setBanner(t(M.fixErrors))
      } else if (response?.status === 429) {
        setBanner(t(M.tooMany))
      } else if (response?.status === 400 && typeof response.data?.detail === 'string' && locale === 'en') {
        setBanner(response.data.detail)
      } else {
        setBanner(t(M.serverError))
      }
    } finally {
      setProgress(null)
    }
  }

  // ── Success ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="bg-gray-50 py-12 sm:py-16">
        <SEOHead title={t(M.doneTitle)} noindex />
        <div className="section-container">
          <div className="card mx-auto max-w-xl sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 aria-hidden="true" className="h-9 w-9 text-green-700" />
            </div>
            <h1 className="text-center text-2xl font-heading font-bold text-gray-900">{t(M.doneTitle)}</h1>
            <p className="mt-3 text-center text-gray-700">{t(M.doneBody, { email: str(form.email) })}</p>
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-sm text-gray-600">{t(M.reference)}</p>
              <p className="ltr-nums mt-1 font-mono text-2xl font-bold tracking-wider text-gray-900" dir="ltr">{result.reference}</p>
            </div>
            {result.documents_offered > 0 && (
              <p className="mt-4 text-sm text-gray-600">{t(M.docsStored, { stored: result.documents_stored, offered: result.documents_offered })}</p>
            )}
            {result.missing_documents.length > 0 && (
              <div className="alert-warning mt-4">
                <div>
                  <p className="font-semibold">{t(M.stillMissing)}</p>
                  <ul className="mt-1 list-disc ps-5">
                    {result.missing_documents.map((d) => <li key={d}>{t(DOC_LABELS[d])}</li>)}
                  </ul>
                </div>
              </div>
            )}
            <div className="mt-8 flex flex-col gap-3">
              <Link to="/my-requests" className="btn-primary">{t(M.follow)}</Link>
              {kind === 'family' && members.some((m) => m.is_orphan) && (
                <Link to={`/sponsor/apply/orphan?family=${result.reference}&email=${encodeURIComponent(str(form.email))}`} className="btn-secondary">
                  {t(M.fileOrphan)}
                </Link>
              )}
              <button type="button" className="btn-ghost" onClick={() => navigate('/')}>{t(C.backToHome)}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Steps ─────────────────────────────────────────────────────────
  const applicantStep = (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">{t(M.appliesAs)}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="submitter_type" value="self" current={v('submitter_type')} onChange={set('submitter_type')}
            label={t(kind === 'family' ? M.asSelfFamily : M.asSelfOrphan)} Icon={User} />
          <Choice name="submitter_type" value="organization" current={v('submitter_type')} onChange={set('submitter_type')}
            label={t(M.asOrganization)} Icon={Users} />
        </div>
      </fieldset>
      {form.submitter_type === 'organization' && (
        <div className="grid gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="f-organization_name" label={t(M.orgName)} error={errors.organization_name}><input {...input('organization_name')} /></Field>
          </div>
          <Field id="f-organization_registration" label={t(M.orgRegistration)} optionalField><input {...input('organization_registration')} /></Field>
          <Field id="f-organization_contact_role" label={t(M.orgRole)} optionalField><input {...input('organization_contact_role')} /></Field>
        </div>
      )}
      <Field id="f-submitter_name" label={t(M.yourName)} error={errors.submitter_name}><input {...input('submitter_name', { autoComplete: 'name' })} /></Field>
      <Field id="f-email" label={t(M.contactAddress)} help={t(edit ? M.identityFixed : M.contactAddressHelp)} error={errors.email}>
        <input {...input('email', { type: 'email', autoComplete: 'email', readOnly: Boolean(edit) })} />
      </Field>
      <Field id="f-submitter_phone" label={t(M.phone)} optionalField><input {...input('submitter_phone', { type: 'tel', autoComplete: 'tel' })} /></Field>
    </div>
  )

  const householdStep = (
    <div className="space-y-5">
      <Field id="f-head_full_name" label={t(M.headName)} error={errors.head_full_name}><input {...input('head_full_name')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-head_national_id" label={t(M.headId)} optionalField><input {...input('head_national_id')} /></Field>
        <Field id="f-head_birth_year" label={t(M.headBirthYear)} optionalField><input {...input('head_birth_year', { inputMode: 'numeric', maxLength: 4 })} /></Field>
      </div>
      <fieldset>
        <legend className="label">{t(M.headGender)}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice name="head_gender" value="male" current={v('head_gender')} onChange={set('head_gender')} label={t(M.man)} />
          <Choice name="head_gender" value="female" current={v('head_gender')} onChange={set('head_gender')} label={t(M.woman)} />
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-head_marital_status" label={t(M.marital)} optionalField>
          <select {...input('head_marital_status')}>
            <option value="">—</option>
            {(['married', 'widowed', 'divorced', 'separated', 'single'] as const).map((s) => <option key={s} value={s}>{t(M[s])}</option>)}
          </select>
        </Field>
        <Field id="f-head_occupation" label={t(M.occupation)} optionalField><input {...input('head_occupation')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-household_size" label={t(M.householdSize)} error={errors.household_size}>
          <input {...input('household_size', { inputMode: 'numeric', maxLength: 2 })} />
        </Field>
        <Field id="f-housing_status" label={t(M.housing)} optionalField>
          <select {...input('housing_status')}>
            <option value="">—</option>
            <option value="owned">{t(M.owned)}</option>
            <option value="rented">{t(M.rented)}</option>
            <option value="hosted">{t(M.hosted)}</option>
            <option value="shelter_camp">{t(M.shelter)}</option>
            <option value="other">{t(M.otherOption)}</option>
          </select>
        </Field>
      </div>
      {form.housing_status === 'rented' && (
        <Field id="f-monthly_rent" label={t(M.rent)}><input {...input('monthly_rent', { inputMode: 'numeric' })} /></Field>
      )}

      <fieldset className="space-y-3">
        <legend className="label">{t(M.members)}</legend>
        <p className="help-text -mt-1">{t(M.membersHelp)}</p>
        {members.map((m, i) => {
          const update = (patch: Partial<MemberRow>) =>
            setForm((f) => ({ ...f, members: (f.members as MemberRow[]).map((row, j) => (j === i ? { ...row, ...patch } : row)) }))
          return (
            <div key={i} className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-6 sm:items-end">
              <div className="sm:col-span-2">
                <label htmlFor={`m-${i}-name`} className="label">{t(M.memberFirstName)}</label>
                <input id={`m-${i}-name`} className="input" value={m.first_name} onChange={(e) => update({ first_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`m-${i}-rel`} className="label">{t(M.relationship)}</label>
                <select id={`m-${i}-rel`} className="input" value={m.relationship} onChange={(e) => update({ relationship: e.target.value })}>
                  {(['spouse', 'child', 'parent', 'sibling', 'grandchild', 'grandparent', 'other'] as const).map((r) =>
                    <option key={r} value={r}>{t(M[`rel_${r}` as keyof typeof M])}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`m-${i}-year`} className="label">{t(M.birthYear)}</label>
                <input id={`m-${i}-year`} className="input" inputMode="numeric" maxLength={4} value={m.birth_year}
                  onChange={(e) => update({ birth_year: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor={`m-${i}-occ`} className="label">{t(M.schoolOrWork)}</label>
                <input id={`m-${i}-occ`} className="input" value={m.occupation_or_school} onChange={(e) => update({ occupation_or_school: e.target.value })} />
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800 sm:col-span-2">
                <input type="checkbox" className="h-4 w-4" checked={m.is_orphan} onChange={(e) => update({ is_orphan: e.target.checked })} />
                {t(M.isOrphan)}
              </label>
              <button type="button" className="btn-ghost btn-sm gap-1 text-red-700 hover:bg-red-50"
                onClick={() => setForm((f) => ({ ...f, members: (f.members as MemberRow[]).filter((_, j) => j !== i) }))}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />{t(M.removeMember)}
              </button>
            </div>
          )
        })}
        <button type="button" className="btn-secondary btn-sm gap-1.5"
          onClick={() => setForm((f) => ({ ...f, members: [...(f.members as MemberRow[]), { ...EMPTY_MEMBER }] }))}>
          <Plus aria-hidden="true" className="h-4 w-4" />{t(M.addMember)}
        </button>
        {members.some((m) => m.is_orphan) && <p className="alert-info">{t(M.orphanHint)}</p>}
      </fieldset>
      <Field id="f-health_notes" label={t(M.healthNotes)} optionalField><textarea {...input('health_notes', { rows: 2 })} /></Field>
    </div>
  )

  const childStep = (
    <div className="space-y-5">
      <Field id="f-full_name" label={t(M.childName)} help={t(M.childNameHelp)} error={errors.full_name}><input {...input('full_name')} /></Field>
      <fieldset>
        <legend className="label">{t(M.childGender)}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice name="gender" value="male" current={v('gender')} onChange={set('gender')} label={t(M.boy)} />
          <Choice name="gender" value="female" current={v('gender')} onChange={set('gender')} label={t(M.girl)} />
        </div>
        {errors.gender && <p className="field-error" role="alert">{errors.gender}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-birth_date" label={t(M.birthDate)} error={errors.birth_date}><input {...input('birth_date', { type: 'date', max: new Date().toISOString().slice(0, 10) })} /></Field>
        <Field id="f-lives_with" label={t(M.livesWith)} optionalField>
          <select {...input('lives_with')}>
            <option value="">—</option>
            {(['mother', 'relatives', 'guardian', 'orphanage', 'other'] as const).map((l) => <option key={l} value={l}>{t(M[`lw_${l}` as keyof typeof M])}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-school_level" label={t(M.schoolLevel)} optionalField><input {...input('school_level')} /></Field>
        <Field id="f-school_name" label={t(M.schoolName)} optionalField><input {...input('school_name')} /></Field>
      </div>
      <Field id="f-health_status" label={t(M.healthStatus)} optionalField><textarea {...input('health_status', { rows: 2 })} /></Field>
      <Field id="f-interests" label={t(M.interests)}><textarea {...input('interests', { rows: 2 })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-siblings_count" label={t(M.siblings)}><input {...input('siblings_count', { inputMode: 'numeric', maxLength: 2 })} /></Field>
        <Field id="f-family_reference" label={t(M.familyRef)} help={t(M.familyRefHelp)} optionalField>
          <input {...input('family_reference', { dir: 'ltr', autoCapitalize: 'characters' })} />
        </Field>
      </div>
    </div>
  )

  const lostFather = form.orphan_type === 'father' || form.orphan_type === 'both'
  const lostMother = form.orphan_type === 'mother' || form.orphan_type === 'both'
  const parentsStep = (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">{t(M.orphanType)}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Choice name="orphan_type" value="father" current={v('orphan_type')} onChange={set('orphan_type')} label={t(M.lostFather)} />
          <Choice name="orphan_type" value="mother" current={v('orphan_type')} onChange={set('orphan_type')} label={t(M.lostMother)} />
          <Choice name="orphan_type" value="both" current={v('orphan_type')} onChange={set('orphan_type')} label={t(M.lostBoth)} />
        </div>
        {errors.orphan_type && <p className="field-error" role="alert">{errors.orphan_type}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-father_name" label={t(M.fatherName)} error={errors.father_name} optionalField={!lostFather}><input {...input('father_name')} /></Field>
        {lostFather && <Field id="f-father_death_date" label={t(M.fatherDeath)} optionalField><input {...input('father_death_date', { type: 'date' })} /></Field>}
      </div>
      {lostFather && <Field id="f-father_death_cause" label={t(M.fatherCause)}><input {...input('father_death_cause')} /></Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-mother_name" label={t(M.motherName)} optionalField><input {...input('mother_name')} /></Field>
        {lostMother && <Field id="f-mother_death_date" label={t(M.motherDeath)} optionalField><input {...input('mother_death_date', { type: 'date' })} /></Field>}
      </div>
      <div className="space-y-4 rounded-xl bg-gray-50 p-4">
        <Field id="f-guardian_name" label={t(M.guardianName)} error={errors.guardian_name}><input {...input('guardian_name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="f-guardian_relationship" label={t(M.guardianRel)} error={errors.guardian_relationship}><input {...input('guardian_relationship')} /></Field>
          <Field id="f-guardian_national_id" label={t(M.guardianId)} optionalField><input {...input('guardian_national_id')} /></Field>
          <Field id="f-guardian_phone" label={t(M.guardianPhone)} optionalField><input {...input('guardian_phone', { type: 'tel' })} /></Field>
        </div>
      </div>
    </div>
  )

  const situationFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="f-country" label={t(M.country)} error={errors.country}><input {...input('country', { autoComplete: 'country-name' })} /></Field>
        <Field id="f-region" label={t(M.region)} optionalField><input {...input('region')} /></Field>
        <Field id="f-city" label={t(M.city)} error={errors.city}><input {...input('city')} /></Field>
      </div>
      <Field id="f-address" label={t(M.address)} optionalField><input {...input('address', { autoComplete: 'street-address' })} /></Field>
      <Field id="f-situation_category" label={t(M.situationCategory)} optionalField>
        <select {...input('situation_category')}>
          <option value="">—</option>
          {(['loss_of_breadwinner', 'illness_disability', 'unemployment', 'displacement', 'divorce_abandonment', 'low_income', 'other'] as const)
            .map((c) => <option key={c} value={c}>{t(M[`sc_${c}` as keyof typeof M])}</option>)}
        </select>
      </Field>
      <Field id="f-situation_description" label={t(M.situation)} help={t(M.situationHelp)} error={errors.situation_description}>
        <textarea {...input('situation_description', { rows: 5 })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-monthly_income" label={t(M.income)} help={t(M.incomeHelp)}><input {...input('monthly_income', { inputMode: 'numeric' })} /></Field>
        <Field id="f-income_sources" label={t(M.incomeSources)} optionalField><input {...input('income_sources')} /></Field>
      </div>
      <Field id="f-other_aid" label={t(M.otherAid)} optionalField><textarea {...input('other_aid', { rows: 2 })} /></Field>
    </>
  )

  const needsFields = (
    <fieldset className="space-y-3">
      <legend className="text-base font-semibold text-gray-900">{t(M.sNeeds)}</legend>
      <p className="text-sm text-gray-600">{t(kind === 'family' ? M.needsLead : M.needsLeadOrphan)}</p>
      {needs.map((n, i) => {
        const update = (patch: Partial<NeedRow>) =>
          setForm((f) => ({ ...f, needs: (f.needs as NeedRow[]).map((row, j) => (j === i ? { ...row, ...patch } : row)) }))
        return (
          <div key={i} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <label htmlFor={`n-${i}-cat`} className="label">{t(M.category)}</label>
              <select id={`n-${i}-cat`} className="input" value={n.category} onChange={(e) => update({ category: e.target.value as NeedCategory })}>
                <option value="">—</option>
                {NEED_CATEGORIES.map((c) => <option key={c} value={c}>{t(NEED_LABELS[c])}</option>)}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label htmlFor={`n-${i}-amount`} className="label">{t(M.monthlyAmount)}</label>
              <input id={`n-${i}-amount`} className="input" inputMode="numeric" value={n.amount}
                onChange={(e) => update({ amount: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
            <div className="sm:col-span-4">
              <label htmlFor={`n-${i}-note`} className="label">{t(M.needNote)}</label>
              <input id={`n-${i}-note`} className="input" value={n.note} maxLength={300} onChange={(e) => update({ note: e.target.value })} />
            </div>
            <button type="button" aria-label={t(M.removeNeed)} className="btn-ghost btn-sm text-red-700 hover:bg-red-50 sm:col-span-1"
              onClick={() => setForm((f) => ({ ...f, needs: (f.needs as NeedRow[]).filter((_, j) => j !== i) }))}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {needs.length < 10 && (
          <button type="button" className="btn-secondary btn-sm gap-1.5" onClick={() => setForm((f) => ({ ...f, needs: [...(f.needs as NeedRow[]), { ...EMPTY_NEED }] }))}>
            <Plus aria-hidden="true" className="h-4 w-4" />{t(M.addNeed)}
          </button>
        )}
        <p className="font-semibold text-gray-900">{t(M.total)}: <span className="ltr-nums">{money(needsTotal)}</span></p>
      </div>
      {errors.needs && <p className="field-error" role="alert">{errors.needs}</p>}
      <Field id="f-urgent_needs" label={t(M.urgent)} optionalField><textarea {...input('urgent_needs', { rows: 2 })} /></Field>
    </fieldset>
  )

  const missingRequired = SUGGESTED_DOCS[kind].filter((d) => d.required && !files[d.type])
  const documentsStep = (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">{t(M.docsLead)}</p>
      <ul className="space-y-2">
        {SUGGESTED_DOCS[kind].map(({ type, required }) => {
          const file = files[type]
          const tooBig = file && file.size > 15 * 1024 * 1024
          return (
            <li key={type} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  {t(DOC_LABELS[type])}
                  {required ? <span className="ms-2 badge-warning">{t(M.requiredMark)}</span> : <span className="text-sm font-normal text-gray-500"> ({t(C.optional)})</span>}
                </p>
                {file && <p className={clsx('truncate text-sm', tooBig ? 'text-red-700' : 'text-gray-600')} dir="auto">{file.name}{tooBig && ` — ${t(M.fileTooBig)}`}</p>}
              </div>
              <div className="flex gap-2">
                <label className="btn-secondary btn-sm cursor-pointer gap-1.5">
                  <Upload aria-hidden="true" className="h-4 w-4" />
                  {file ? t(M.replaceFile) : t(M.chooseFile)}
                  <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                    aria-label={t(DOC_LABELS[type])}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((fs) => ({ ...fs, [type]: f })); e.target.value = '' }} />
                </label>
                {file && (
                  <button type="button" className="btn-ghost btn-sm text-red-700 hover:bg-red-50"
                    onClick={() => setFiles((fs) => { const { [type]: _, ...rest } = fs; return rest })}>
                    {t(M.removeFile)}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {missingRequired.length > 0 && <p className="alert-warning">{t(M.missingWarning)}</p>}

      {edit && (
        <Field id="f-message" label={t(M.messageToTeam)} help={t(M.messageHelp)}>
          <textarea {...input('message', { rows: 3, maxLength: 2000 })} />
        </Field>
      )}

      <div className="space-y-3 rounded-xl bg-gray-50 p-4">
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0" checked={Boolean(form.consent_verification)}
            onChange={(e) => set('consent_verification')(e.target.checked)} aria-invalid={Boolean(errors.consent_verification) || undefined} />
          <span>{t(M.consentVerify)}</span>
        </label>
        {errors.consent_verification && <p className="field-error" role="alert">{errors.consent_verification}</p>}
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0" checked={Boolean(form.consent_publication)}
            onChange={(e) => set('consent_publication')(e.target.checked)} />
          <span>
            {t(M.consentPublish)}
            <span className="mt-1 block text-gray-600">{t(M.consentPublishHelp)}</span>
          </span>
        </label>
      </div>
    </div>
  )

  const content = kind === 'family'
    ? [applicantStep, householdStep, <div className="space-y-5">{situationFields}</div>, needsFields, documentsStep][step]
    : [applicantStep, childStep, parentsStep, <div className="space-y-5">{situationFields}<div className="pt-2">{needsFields}</div></div>, documentsStep][step]

  const anyTooBig = Object.values(files).some((f) => f && f.size > 15 * 1024 * 1024)

  return (
    <div className="bg-gray-50 py-8 sm:py-12">
      {!edit && <SEOHead title={t(kind === 'family' ? M.familyTitle : M.orphanTitle)} canonicalPath={`/sponsor/apply/${kind}`} />}
      <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        {edit ? (
          <div>
            <button type="button" onClick={edit.onCancel} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t(C.back)}
            </button>
            <h1 className="text-2xl font-heading font-bold text-gray-900">{t(M.editTitle, { reference: edit.reference })}</h1>
          </div>
        ) : (
          <div>
            <Link to="/sponsor/apply" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t(M.chooseTitle)}
            </Link>
            <h1 className="text-3xl font-heading font-bold text-gray-900">{t(kind === 'family' ? M.familyTitle : M.orphanTitle)}</h1>
            <p className="mt-1 text-sm text-gray-600">{t(M.savedOnDevice)}</p>
          </div>
        )}

        <ol className="flex gap-1.5" aria-label={t(M.stepOf, { n: step + 1, total: steps.length })}>
          {steps.map((s, i) => (
            <li key={s.en} className="flex-1">
              <span className={clsx('block h-1.5 rounded-full', i <= step ? 'bg-primary-600' : 'bg-gray-200')} />
              <span className={clsx('mt-1.5 hidden text-xs sm:block', i === step ? 'font-semibold text-primary-700' : 'text-gray-500')}>{t(s)}</span>
            </li>
          ))}
        </ol>

        <form className="card space-y-6" onSubmit={(e) => { e.preventDefault(); step === steps.length - 1 ? send() : goNext() }} noValidate>
          <div>
            <p className="text-sm text-gray-500">{t(M.stepOf, { n: step + 1, total: steps.length })}</p>
            <h2 className="text-xl font-heading font-bold text-gray-900">{t(steps[step])}</h2>
          </div>
          {banner && <p className="alert-error" role="alert">{banner}</p>}
          {content}
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
            {step > 0 ? (
              <button type="button" className="btn-ghost gap-1.5" onClick={() => { setStep((s) => s - 1); setBanner(null) }}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />{t(M.back)}
              </button>
            ) : <span />}
            {step < steps.length - 1 ? (
              <button type="submit" className="btn-primary gap-1.5">{t(M.next)}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
            ) : (
              <button type="submit" className="btn-primary" disabled={progress !== null || anyTooBig}>
                {progress !== null ? t(M.sending, { percent: progress }) : t(edit ? M.sendUpdate : M.send)}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const SponsorApply = () => {
  const { kind } = useParams()
  const valid = useMemo(() => (kind === 'family' || kind === 'orphan' ? kind : null), [kind])
  if (!valid) return <Chooser />
  return <Wizard key={valid} kind={valid} />
}

export default SponsorApply
