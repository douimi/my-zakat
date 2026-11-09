/**
 * Strings shared by the site chrome (header, footer, menus, common buttons).
 * Page-specific strings live next to their page, in its own defineMessages().
 *
 * Arabic register: Modern Standard Arabic, warm and respectful, with Islamic
 * terms in their usual form (زكاة، صدقة، كفالة اليتيم) rather than calques of
 * the English.
 */
import { defineMessages } from '.'

export const C = defineMessages({
  // Brand
  brand: { en: 'MyZakat', ar: 'ماي زكاة' },
  homeLogoAlt: { en: 'MyZakat home', ar: 'الصفحة الرئيسية لماي زكاة' },
  tagline: { en: 'Zakat and sadaqah, delivered to families in need.', ar: 'نوصل زكاتك وصدقتك إلى الأسر المحتاجة.' },
  skipToContent: { en: 'Skip to content', ar: 'انتقل إلى المحتوى' },

  // Main navigation
  home: { en: 'Home', ar: 'الرئيسية' },
  projects: { en: 'Projects', ar: 'المشاريع' },
  allProjects: { en: 'All projects', ar: 'جميع المشاريع' },
  urgentNeeds: { en: 'Urgent needs', ar: 'احتياجات عاجلة' },
  programs: { en: 'Programs', ar: 'البرامج' },
  zakat: { en: 'Zakat', ar: 'الزكاة' },
  calculators: { en: 'Calculators', ar: 'الحاسبات' },
  guides: { en: 'Guides', ar: 'أدلة' },
  zakatCalculator: { en: 'Zakat Calculator', ar: 'حاسبة الزكاة' },
  zakatAlFitrCalculator: { en: 'Zakat al-Fitr Calculator', ar: 'حاسبة زكاة الفطر' },
  kaffarahCalculator: { en: 'Kaffarah Calculator', ar: 'حاسبة الكفارة' },
  nisab: { en: 'Nisab', ar: 'النصاب' },
  zakatOnGold: { en: 'Zakat on Gold', ar: 'زكاة الذهب' },
  zakatEducation: { en: 'Zakat Education', ar: 'تعلّم الزكاة' },
  about: { en: 'About', ar: 'من نحن' },
  aboutUs: { en: 'About us', ar: 'من نحن' },
  stories: { en: 'Stories', ar: 'قصص' },
  events: { en: 'Events', ar: 'الفعاليات' },
  volunteer: { en: 'Volunteer', ar: 'تطوّع' },
  contact: { en: 'Contact', ar: 'اتصل بنا' },
  donate: { en: 'Donate', ar: 'تبرّع' },

  // Sponsorship menu
  sponsor: { en: 'Sponsor', ar: 'الكفالة' },
  sponsorAnOrphan: { en: 'Sponsor an orphan', ar: 'اكفل يتيمًا' },
  sponsorAnOrphanSub: { en: 'Support a child’s schooling, health and daily needs', ar: 'ساهم في تعليم طفل وصحته واحتياجاته اليومية' },
  sponsorAFamily: { en: 'Sponsor a family', ar: 'اكفل أسرة' },
  sponsorAFamilySub: { en: 'Help a household cover food, rent and essentials', ar: 'ساعد أسرة على تغطية الطعام والإيجار والضروريات' },
  howSponsorshipWorks: { en: 'How sponsorship works', ar: 'كيف تعمل الكفالة' },
  howSponsorshipWorksSub: { en: 'Verified, anonymous, transparent', ar: 'موثّقة، مجهولة الهوية، شفافة' },
  mySponsorships: { en: 'My sponsorships', ar: 'كفالاتي' },
  mySponsorshipsSub: { en: 'Follow your impact and your payments', ar: 'تابع أثر عطائك ومدفوعاتك' },

  // Apply menu
  applyForSupport: { en: 'Apply for Funding', ar: 'اطلب الدعم' },
  submitProposal: { en: 'Submit a project proposal', ar: 'قدّم مقترح مشروع' },
  submitProposalSub: { en: 'Tell us about your project and request support', ar: 'عرّفنا بمشروعك واطلب الدعم' },
  checkApplication: { en: 'Check my application', ar: 'تابع طلب التمويل' },
  checkApplicationSub: { en: 'See where your request stands, or make the changes we asked for', ar: 'اطّلع على حالة طلبك أو أجرِ التعديلات المطلوبة' },
  requestSponsorship: { en: 'Request sponsorship', ar: 'اطلب كفالة' },
  requestSponsorshipSub: { en: 'For a family in need or an orphan, filed by them or an association', ar: 'لأسرة محتاجة أو ليتيم، من الأسرة نفسها أو عبر جمعية' },
  followMyRequest: { en: 'Follow my request', ar: 'متابعة طلبي' },
  followMyRequestSub: { en: 'Status, messages from our team, documents', ar: 'الحالة، رسائل فريقنا، الوثائق' },
  projectFunding: { en: 'Project funding', ar: 'تمويل المشاريع' },
  familySponsorship: { en: 'Family & orphan sponsorship', ar: 'كفالة الأسر والأيتام' },

  // Account
  profileMenu: { en: 'Profile menu', ar: 'قائمة الحساب' },
  signedInAs: { en: 'Signed in as', ar: 'مسجّل الدخول باسم' },
  myDonations: { en: 'My Donations', ar: 'تبرعاتي' },
  adminConsole: { en: 'Admin Console', ar: 'لوحة الإدارة' },
  managerConsole: { en: 'Manager Console', ar: 'لوحة المدير' },
  logIn: { en: 'Log in', ar: 'تسجيل الدخول' },
  logOut: { en: 'Log out', ar: 'تسجيل الخروج' },
  createAccount: { en: 'Create an account', ar: 'إنشاء حساب' },
  toggleMenu: { en: 'Toggle menu', ar: 'فتح القائمة' },
  mainNav: { en: 'Main', ar: 'التنقل الرئيسي' },
  mobileNav: { en: 'Mobile', ar: 'تنقل الجوال' },

  // Language
  language: { en: 'Language', ar: 'اللغة' },
  switchToArabic: { en: 'العربية', ar: 'العربية' },
  switchToEnglish: { en: 'English', ar: 'English' },
  arabicAvailable: { en: 'This site is available in Arabic.', ar: 'هذا الموقع متوفر باللغة العربية.' },
  viewInArabic: { en: 'View in Arabic', ar: 'تصفح بالعربية' },
  dismiss: { en: 'Dismiss', ar: 'إغلاق' },
  englishOnlyNotice: {
    en: 'This page is in English.',
    ar: 'هذه الصفحة متاحة حاليًا باللغة الإنجليزية فقط، ونعمل على ترجمتها.',
  },

  // Emergency banner fallbacks
  emergencyFallback: { en: 'Emergency Relief Needed: Support families affected by the crisis.', ar: 'نداء إغاثة عاجل: ساندوا الأسر المتضررة من الأزمة.' },
  donateNow: { en: 'Donate Now', ar: 'تبرّع الآن' },

  // Footer
  quickLinks: { en: 'Quick Links', ar: 'روابط سريعة' },
  legal: { en: 'Legal', ar: 'قانوني' },
  privacyPolicy: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
  donationPolicy: { en: 'Donation Policy', ar: 'سياسة التبرعات' },
  termsOfService: { en: 'Terms of Service', ar: 'شروط الاستخدام' },
  smsSubscription: { en: 'SMS Subscription', ar: 'الاشتراك في الرسائل النصية' },
  address: { en: 'P.O. BOX 2250, Winchester, VA 22604', ar: 'صندوق بريد 2250، وينشستر، فيرجينيا 22604، الولايات المتحدة' },
  copyright: { en: '© {year} MyZakat Distribution Foundation. All rights reserved.', ar: '© {year} مؤسسة ماي زكاة للتوزيع. جميع الحقوق محفوظة.' },

  // Sticky donation bar
  quickDonation: { en: 'Quick donation', ar: 'تبرع سريع' },
  giveNow: { en: 'Give now', ar: 'تبرّع الآن' },
  amount: { en: 'Amount', ar: 'المبلغ' },
  donationAmount: { en: 'Donation amount', ar: 'مبلغ التبرع' },
  frequency: { en: 'Frequency', ar: 'التكرار' },
  oneTime: { en: 'One-Time', ar: 'مرة واحدة' },
  monthly: { en: 'Monthly', ar: 'شهريًا' },
  annually: { en: 'Annually', ar: 'سنويًا' },

  // Generic
  back: { en: 'Back', ar: 'رجوع' },
  next: { en: 'Next', ar: 'التالي' },
  continue: { en: 'Continue', ar: 'متابعة' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  save: { en: 'Save', ar: 'حفظ' },
  submit: { en: 'Submit', ar: 'إرسال' },
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
  tryAgain: { en: 'Try again', ar: 'حاول مرة أخرى' },
  somethingWentWrong: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.' },
  networkError: { en: 'Network error. Please check your connection and try again.', ar: 'تعذّر الاتصال. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مجددًا.' },
  optional: { en: 'optional', ar: 'اختياري' },
  required: { en: 'required', ar: 'مطلوب' },
  showMore: { en: 'Show more', ar: 'عرض المزيد' },
  showLess: { en: 'Show less', ar: 'عرض أقل' },
  close: { en: 'Close', ar: 'إغلاق' },
  email: { en: 'Email address', ar: 'البريد الإلكتروني' },
  backToHome: { en: 'Back to Home', ar: 'العودة إلى الرئيسية' },
})
