"""Every email the sponsorship feature sends, in English and Arabic.

One template (email_templates/sponsorship_notice.*) lays out every notice; the
wording lives here, so each notice reads naturally in both languages rather
than being a translated copy of a template. The language is the one the
recipient used on the site: an applicant who filed in Arabic is written to in
Arabic, links included (they point at /ar/...).

Idempotency keys make a double trigger harmless: the outbox refuses a second
row with the same key. Access codes deliberately carry none — each request must
deliver its own fresh code.
"""
from __future__ import annotations

from typing import Optional

from email_service import ADMIN_NOTIFICATION_EMAIL, FRONTEND_URL, _enqueue

TEAM = {"en": "The MyZakat Team", "ar": "فريق ماي زكاة"}
SIGNOFF = {"en": "With gratitude,", "ar": "مع خالص الشكر والتقدير،"}


def _lang(lang: Optional[str]) -> str:
    return "ar" if lang == "ar" else "en"


def _url(lang: str, path: str) -> str:
    return "%s%s%s" % (FRONTEND_URL.rstrip("/"), "/ar" if lang == "ar" else "", path)


def _money(cents: int, lang: str) -> str:
    amount = ("%.2f" % (cents / 100)).rstrip("0").rstrip(".")
    return "%s دولار" % amount if lang == "ar" else "$%s" % amount


def _send(*, to: str, name: str, lang: str, subject: str, heading: str, paragraphs: list[str],
          key: Optional[str], cta_label: Optional[str] = None, cta_url: Optional[str] = None,
          quote: Optional[str] = None, code: Optional[str] = None) -> bool:
    lang = _lang(lang)
    return _enqueue(
        "sponsorship_notice",
        to_email=to,
        to_name=name,
        subject=subject,
        context={
            "lang": lang,
            "dir": "rtl" if lang == "ar" else "ltr",
            "heading": heading,
            "paragraphs": paragraphs,
            "quote": quote,
            "code": code,
            "cta_label": cta_label,
            "cta_url": cta_url,
            "signoff": SIGNOFF[lang],
            "team": TEAM[lang],
            "brand_subtitle": "ماي زكاة" if lang == "ar" else None,
        },
        category="transactional",
        idempotency_key=key,
    )


def _greeting(name: str, lang: str) -> str:
    return ("السلام عليكم %s،" % name) if lang == "ar" else ("Assalamu alaikum %s," % name)


def _kind_word(kind: str, lang: str) -> str:
    if lang == "ar":
        return "طلب كفالة الأسرة" if kind == "family" else "طلب كفالة اليتيم"
    return "family sponsorship request" if kind == "family" else "orphan sponsorship request"


# ─────────────────────────────────────────────────────────────────────
# Applicant (family, guardian or association)
# ─────────────────────────────────────────────────────────────────────

def access_code(*, email: str, code: str, ttl_minutes: int, lang: str) -> bool:
    lang = _lang(lang)
    if lang == "ar":
        return _send(
            to=email, name="", lang=lang, key=None,
            subject="رمز الدخول إلى حسابك في ماي زكاة",
            heading="رمز الدخول",
            paragraphs=["استخدم هذا الرمز للاطلاع على طلبات الكفالة أو الكفالات المرتبطة بهذا البريد الإلكتروني:",
                        "تنتهي صلاحية الرمز بعد %d دقائق ويُستخدم مرة واحدة فقط. إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة؛ لم تتم مشاركة أي معلومة." % ttl_minutes],
            code=code,
        )
    return _send(
        to=email, name="", lang=lang, key=None,
        subject="Your MyZakat sign-in code",
        heading="Your sign-in code",
        paragraphs=["Use this code to see the sponsorship requests or sponsorships linked to this email address:",
                    "The code expires in %d minutes and can be used once. If you did not ask for it, ignore this "
                    "email: nothing has been shared." % ttl_minutes],
        code=code,
    )


def applicant_received(case) -> bool:
    lang = _lang(case.preferred_language)
    ref = case.reference
    if lang == "ar":
        paragraphs = [
            _greeting(case.submitter_name, lang),
            "شكرًا لثقتك بنا. لقد استلمنا %s، ورقمه المرجعي هو %s. يُرجى ذكره في أي تواصل معنا." % (_kind_word(case.kind, lang), ref),
            "سيقوم فريقنا بدراسة الطلب والتحقق من الوثائق بكل عناية وسرية. يمكنك متابعة حالة الطلب في أي وقت وإرسال وثائق إضافية من صفحة «متابعة طلبي» باستخدام هذا البريد الإلكتروني.",
        ]
        return _send(to=case.submitter_email, name=case.submitter_name, lang=lang,
                     key="sp-case-%d-received" % case.id,
                     subject="استلمنا طلبك %s — ماي زكاة" % ref, heading="استلمنا طلبك",
                     paragraphs=paragraphs, cta_label="متابعة طلبي", cta_url=_url(lang, "/my-requests"))
    paragraphs = [
        _greeting(case.submitter_name, lang),
        "Thank you for trusting us. We have received your %s; its reference is %s. Please quote it whenever you "
        "contact us." % (_kind_word(case.kind, lang), ref),
        "Our team will review it and verify the documents carefully and in confidence. You can follow its status "
        "and send more documents at any time from \"Follow my request\", using this email address.",
    ]
    return _send(to=case.submitter_email, name=case.submitter_name, lang=lang,
                 key="sp-case-%d-received" % case.id,
                 subject="We received your request %s — MyZakat" % ref, heading="We received your request",
                 paragraphs=paragraphs, cta_label="Follow my request", cta_url=_url(lang, "/my-requests"))


# action -> (en subject, en heading, en body, ar subject, ar heading, ar body)
_DECISIONS = {
    "request_info": (
        "We need a little more information — %s",
        "We need more information",
        "To continue reviewing request %s, we need a few more details or documents. Here is our message:",
        "نحتاج إلى بعض المعلومات الإضافية — %s",
        "نحتاج إلى معلومات إضافية",
        "لمواصلة دراسة الطلب %s نحتاج إلى بعض التفاصيل أو الوثائق الإضافية. إليك رسالتنا:",
    ),
    "approve": (
        "Your request %s has been approved",
        "Your request has been approved",
        "Good news: we have verified request %s and approved it. We are now preparing its profile, which will "
        "only ever show a first name or pseudonym, an age and a region — never your identity or address.",
        "تمت الموافقة على طلبك %s",
        "تمت الموافقة على طلبك",
        "يسعدنا إبلاغك بأننا تحققنا من الطلب %s ووافقنا عليه. نحن الآن بصدد إعداد صفحة التعريف الخاصة به، والتي لن تُظهر سوى اسم أول أو اسم مستعار والعمر والمنطقة — دون أي معلومات تكشف هويتك أو عنوانك.",
    ),
    "publish": (
        "Request %s is now open to sponsors",
        "Now open to sponsors",
        "Request %s is now visible to our donors, anonymously. We will email you as soon as a sponsor commits.",
        "الطلب %s متاح الآن للكفلاء",
        "متاح الآن للكفلاء",
        "أصبح الطلب %s ظاهرًا للمتبرعين بشكل مجهول الهوية. سنراسلك فور التزام أحد الكفلاء.",
    ),
    "reject": (
        "About your request %s",
        "About your request",
        "We have carefully reviewed request %s and are unfortunately unable to accept it. Here is why:",
        "بخصوص طلبك %s",
        "بخصوص طلبك",
        "لقد درسنا الطلب %s بعناية، ونعتذر عن عدم تمكننا من قبوله. وإليك السبب:",
    ),
    "close": (
        "Request %s has been closed",
        "Your request has been closed",
        "Request %s has been closed. Thank you for the trust you placed in us.",
        "تم إغلاق الطلب %s",
        "تم إغلاق طلبك",
        "تم إغلاق الطلب %s. نشكرك على ثقتك بنا.",
    ),
    "reopen": (
        "Request %s is being reviewed again",
        "Your request is being reviewed again",
        "We have reopened request %s and our team is looking at it again.",
        "نعيد دراسة الطلب %s",
        "نعيد دراسة طلبك",
        "أعدنا فتح الطلب %s ويعمل فريقنا على دراسته من جديد.",
    ),
}


def applicant_decision(case, action: str, message: Optional[str], event_id: int) -> bool:
    """Tell the applicant what changed. start_review and pause send nothing:
    the portal shows them, and an email for each would be noise."""
    if action not in _DECISIONS:
        return False
    lang = _lang(case.preferred_language)
    en_s, en_h, en_b, ar_s, ar_h, ar_b = _DECISIONS[action]
    subject, heading, body = (ar_s, ar_h, ar_b) if lang == "ar" else (en_s, en_h, en_b)
    paragraphs = [_greeting(case.submitter_name, lang), body % case.reference]
    if action == "request_info":
        paragraphs_after = ("يمكنك تعديل طلبك وإرسال الوثائق المطلوبة من صفحة «متابعة طلبي»." if lang == "ar"
                            else "You can update your request and send the documents from \"Follow my request\".")
    else:
        paragraphs_after = None
    ok = _send(
        to=case.submitter_email, name=case.submitter_name, lang=lang,
        key="sp-case-%d-%s-%d" % (case.id, action, event_id),
        subject=subject % case.reference + (" — ماي زكاة" if lang == "ar" else " — MyZakat"),
        heading=heading, paragraphs=paragraphs + ([paragraphs_after] if paragraphs_after else []),
        quote=message,
        cta_label="متابعة طلبي" if lang == "ar" else "Follow my request",
        cta_url=_url(lang, "/my-requests"),
    )
    return ok


def applicant_document_refused(case, doc_type_label: str, note: str, doc_id: int) -> bool:
    lang = _lang(case.preferred_language)
    if lang == "ar":
        return _send(
            to=case.submitter_email, name=case.submitter_name, lang=lang, key="sp-doc-%d-refused" % doc_id,
            subject="وثيقة تحتاج إلى استبدال — %s" % case.reference, heading="وثيقة تحتاج إلى استبدال",
            paragraphs=[_greeting(case.submitter_name, lang),
                        "لم نتمكن من قبول الوثيقة «%s» المرفقة بالطلب %s. السبب:" % (doc_type_label, case.reference),
                        "يُرجى إرسال وثيقة بديلة من صفحة «متابعة طلبي»."],
            quote=note, cta_label="متابعة طلبي", cta_url=_url(lang, "/my-requests"))
    return _send(
        to=case.submitter_email, name=case.submitter_name, lang=lang, key="sp-doc-%d-refused" % doc_id,
        subject="A document needs replacing — %s" % case.reference, heading="A document needs replacing",
        paragraphs=[_greeting(case.submitter_name, lang),
                    "We could not accept the \"%s\" attached to request %s. Here is why:" % (doc_type_label, case.reference),
                    "Please send a replacement from \"Follow my request\"."],
        quote=note, cta_label="Follow my request", cta_url=_url(lang, "/my-requests"))


def applicant_sponsor_found(case, monthly_cents: int, sponsorship_id: int) -> bool:
    lang = _lang(case.preferred_language)
    if lang == "ar":
        return _send(
            to=case.submitter_email, name=case.submitter_name, lang=lang, key="sp-%d-found" % sponsorship_id,
            subject="وجدنا كفيلًا — %s" % case.reference, heading="الحمد لله، وجدنا كفيلًا",
            paragraphs=[_greeting(case.submitter_name, lang),
                        "التزم أحد المتبرعين بكفالة الطلب %s بمبلغ %s شهريًا. تبقى هوية الكفيل سرية، كما تبقى هويتكم سرية بالنسبة له." % (case.reference, _money(monthly_cents, lang)),
                        "سنتواصل معكم بخصوص طريقة صرف المساعدات، وستجدون كل عملية صرف مسجّلة في صفحة «متابعة طلبي»."],
            cta_label="متابعة طلبي", cta_url=_url(lang, "/my-requests"))
    return _send(
        to=case.submitter_email, name=case.submitter_name, lang=lang, key="sp-%d-found" % sponsorship_id,
        subject="A sponsor has been found — %s" % case.reference, heading="A sponsor has been found",
        paragraphs=[_greeting(case.submitter_name, lang),
                    "A donor has committed %s a month to request %s. The sponsor's identity stays private, and so "
                    "does yours." % (_money(monthly_cents, lang), case.reference),
                    "We will be in touch about how the support is distributed; every distribution is recorded in "
                    "\"Follow my request\"."],
        cta_label="Follow my request", cta_url=_url(lang, "/my-requests"))


# ─────────────────────────────────────────────────────────────────────
# Sponsor
# ─────────────────────────────────────────────────────────────────────

def sponsor_started(sp, case) -> bool:
    lang = _lang(sp.preferred_language)
    who = case.public_name or case.reference
    if lang == "ar":
        return _send(
            to=sp.sponsor_email, name=sp.sponsor_name, lang=lang, key="sp-%d-started" % sp.id,
            subject="جزاك الله خيرًا على كفالتك — %s" % case.reference, heading="بدأت كفالتك",
            paragraphs=[_greeting(sp.sponsor_name, lang),
                        "بارك الله فيك. بدأت كفالتك لـ«%s» بمبلغ %s شهريًا. سيصلك إيصال بكل دفعة." % (who, _money(sp.monthly_amount_cents, lang)),
                        "تبقى هويتك سرية. ويمكنك في أي وقت متابعة ما تم صرفه من أموالك والأخبار الجديدة، أو إيقاف الكفالة، من صفحة «كفالاتي»."],
            cta_label="كفالاتي", cta_url=_url(lang, "/my-sponsorships"))
    return _send(
        to=sp.sponsor_email, name=sp.sponsor_name, lang=lang, key="sp-%d-started" % sp.id,
        subject="Thank you for your sponsorship — %s" % case.reference, heading="Your sponsorship has started",
        paragraphs=[_greeting(sp.sponsor_name, lang),
                    "May Allah reward you. Your sponsorship of %s at %s a month has started; you will receive a "
                    "receipt for every payment." % (who, _money(sp.monthly_amount_cents, lang)),
                    "Your identity stays private. At any time you can see how your money was used, read updates, or "
                    "stop the sponsorship from \"My sponsorships\"."],
        cta_label="My sponsorships", cta_url=_url(lang, "/my-sponsorships"))


def sponsor_update(sp, case, update) -> bool:
    lang = _lang(sp.preferred_language)
    title = (update.title_ar if lang == "ar" and update.title_ar else update.title)
    body = (update.body_ar if lang == "ar" and update.body_ar else update.body)
    who = case.public_name or case.reference
    return _send(
        to=sp.sponsor_email, name=sp.sponsor_name, lang=lang, key="sp-%d-update-%d" % (sp.id, update.id),
        subject=("خبر جديد عن %s" % who) if lang == "ar" else ("News from %s" % who),
        heading=title, paragraphs=[_greeting(sp.sponsor_name, lang)], quote=body,
        cta_label="كفالاتي" if lang == "ar" else "My sponsorships", cta_url=_url(lang, "/my-sponsorships"))


def sponsor_case_closed(sp, case, event_id: int) -> bool:
    lang = _lang(sp.preferred_language)
    who = case.public_name or case.reference
    if lang == "ar":
        return _send(
            to=sp.sponsor_email, name=sp.sponsor_name, lang=lang, key="sp-%d-closed-%d" % (sp.id, event_id),
            subject="انتهاء كفالتك لـ%s" % who, heading="انتهت الكفالة",
            paragraphs=[_greeting(sp.sponsor_name, lang),
                        "انتهى ملف «%s»، ولذلك أوقفنا كفالتك ولن تُخصم منك أي دفعات أخرى." % who,
                        "جزاك الله خيرًا على كل ما قدمته. يمكنك اختيار كفالة شخص آخر ما زال ينتظر."],
            cta_label="كفالة جديدة", cta_url=_url(lang, "/sponsor"))
    return _send(
        to=sp.sponsor_email, name=sp.sponsor_name, lang=lang, key="sp-%d-closed-%d" % (sp.id, event_id),
        subject="Your sponsorship of %s has ended" % who, heading="Your sponsorship has ended",
        paragraphs=[_greeting(sp.sponsor_name, lang),
                    "The case of %s has been closed, so we have stopped your sponsorship; you will not be charged "
                    "again." % who,
                    "May Allah reward you for everything you gave. Someone else is still waiting, if you would like "
                    "to sponsor again."],
        cta_label="Sponsor someone new", cta_url=_url(lang, "/sponsor"))


# ─────────────────────────────────────────────────────────────────────
# Staff
# ─────────────────────────────────────────────────────────────────────

def staff_new_request(case) -> bool:
    return _send(
        to=ADMIN_NOTIFICATION_EMAIL, name="MyZakat team", lang="en", key="sp-case-%d-staff-new" % case.id,
        subject="New %s sponsorship request %s" % (case.kind, case.reference),
        heading="New sponsorship request",
        paragraphs=["A new %s request (%s) was filed by %s%s, %s, %s." % (
            case.kind, case.reference, case.submitter_name,
            " (%s)" % case.organization_name if case.organization_name else "", case.city, case.country)],
        cta_label="Open in the admin", cta_url="%s/admin/sponsorship/cases/%d" % (FRONTEND_URL.rstrip("/"), case.id),
    )
