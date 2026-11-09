"""Sponsoring a family or an orphan: the rules, in one place.

Design: docs/superpowers/specs/2026-11-09-sponsorship-and-arabic-design.md

Routers authenticate, parse and respond. Everything that decides something —
which transition is allowed, what must be true before a case is published, how
much of a need is still uncovered, what a given audience may see — lives here,
so the three routers (public, portal, admin) cannot disagree.

Four rules hold throughout:

  * Every change to a case writes a SponsorshipCaseEvent in the same
    transaction. Functions here add the event and leave the commit to the
    caller only where the caller has more to write; otherwise they commit.
  * Funding is derived, never stored: "fully sponsored" is computed from the
    active sponsorships each time, so it can never be stale.
  * There is one serializer per audience (public, applicant, sponsor, staff).
    A private field reaches an audience only by being written into that
    audience's function — never by being left out of a blacklist.
  * Money is integer cents everywhere in this module. Donation.amount is float
    dollars (legacy); it is converted at the boundary.
"""
from __future__ import annotations

import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from logging_config import get_logger, mask_email
import log_events as ev
from models import (
    Donation,
    Sponsorship,
    SponsorshipCase,
    SponsorshipCaseDocument,
    SponsorshipCaseEvent,
    SponsorshipCaseUpdate,
    SponsorshipDisbursement,
    SponsorshipFamilyDetails,
    SponsorshipHouseholdMember,
    SponsorshipOrphanDetails,
    User,
)

logger = get_logger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Vocabulary
# ─────────────────────────────────────────────────────────────────────

FAMILY = "family"
ORPHAN = "orphan"
KINDS = (FAMILY, ORPHAN)

SUBMITTED = "submitted"
UNDER_REVIEW = "under_review"
INFO_REQUESTED = "info_requested"
APPROVED = "approved"
PUBLISHED = "published"
PAUSED = "paused"
REJECTED = "rejected"
CLOSED = "closed"
STATUSES = (SUBMITTED, UNDER_REVIEW, INFO_REQUESTED, APPROVED, PUBLISHED, PAUSED, REJECTED, CLOSED)
# Statuses in which the applicant may still add documents.
OPEN_STATUSES = (SUBMITTED, UNDER_REVIEW, INFO_REQUESTED, APPROVED, PUBLISHED, PAUSED)

NEED_CATEGORIES = ("food", "rent", "utilities", "education", "health", "clothing", "transport", "other")
DISBURSEMENT_CATEGORIES = NEED_CATEGORIES
SITUATION_CATEGORIES = (
    "loss_of_breadwinner", "illness_disability", "unemployment", "displacement",
    "divorce_abandonment", "low_income", "other",
)
HOUSING_STATUSES = ("owned", "rented", "hosted", "shelter_camp", "other")
GENDERS = ("male", "female")
ORPHAN_TYPES = ("father", "mother", "both")
LIVES_WITH = ("mother", "relatives", "guardian", "orphanage", "other")
RELATIONSHIPS = ("spouse", "child", "parent", "sibling", "grandchild", "grandparent", "other")

DOC_TYPES = (
    "id_document", "death_certificate", "birth_certificate", "guardianship",
    "school_certificate", "medical_report", "income_proof", "residence_proof",
    "association_mandate", "photo", "receipt", "other",
)
# Must be verified before a case can be approved or published. Kept short on
# purpose: a family that cannot produce a scan today is not turned away, it is
# shown what is missing and can send it later.
REQUIRED_DOCS = {
    FAMILY: ("id_document",),
    ORPHAN: ("birth_certificate", "death_certificate"),
}
DOC_REVIEW_STATUSES = ("pending", "verified", "rejected")

CLOSE_REASONS = ("aged_out", "self_sufficient", "moved", "duplicate", "deceased", "withdrawn", "other")
SPONSOR_END_REASONS = ("financial", "changed_mind", "other_sponsorship", "case_closed", "staff", "payment_failed", "other")

SP_PENDING = "pending"
SP_ACTIVE = "active"
SP_PAST_DUE = "past_due"
SP_CANCELED = "canceled"
SP_ENDED = "ended"
SP_ABANDONED = "abandoned"
# A commitment that counts towards coverage. past_due still counts: Stripe is
# retrying, and dropping coverage on the first failed card would flip a case
# back to "needs a sponsor" for a problem that usually fixes itself.
COMMITTED_STATUSES = (SP_ACTIVE, SP_PAST_DUE)

MIN_MONTHLY_CENTS = 1000            # $10/month
MAX_MONTHLY_CENTS = 1_000_000       # $10,000/month, a typo guard
CHECKOUT_HOLD_MINUTES = 30          # Stripe's minimum session lifetime
ORPHAN_MAX_AGE = 18
AGING_OUT_WARNING_DAYS = 90
STALE_UPDATE_DAYS = 90
IDLE_FUNDS_DAYS = 60

# Documents: per file and per submission. Scans and phone photos, not video.
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024
MAX_DOCUMENTS_PER_REQUEST = 20
MAX_DOCUMENT_BATCH_BYTES = 100 * 1024 * 1024

_REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


class SponsorshipError(Exception):
    """A request the rules refuse, with a message safe to show its author."""


class TransitionRefused(SponsorshipError):
    """A status change that is not possible right now, and why."""

    def __init__(self, message: str, blockers: Optional[list[str]] = None):
        super().__init__(message)
        self.blockers = blockers or []


# ─────────────────────────────────────────────────────────────────────
# Actors and the history
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Actor:
    type: str                          # staff | applicant | sponsor | system
    user_id: Optional[int] = None
    label: Optional[str] = None

    @staticmethod
    def staff(user: User) -> "Actor":
        return Actor("staff", user.id, user.email)

    @staticmethod
    def applicant(email: str, acting_staff: Optional[str] = None) -> "Actor":
        # An admin acting through the portal is recorded as such: "the family
        # wrote this" and "staff typed it in for them" are different facts.
        if acting_staff:
            return Actor("staff", None, f"{acting_staff} (for {email})")
        return Actor("applicant", None, email)

    @staticmethod
    def sponsor(email: str) -> "Actor":
        # Sponsors are anonymous even inside the history a manager reads.
        return Actor("sponsor", None, mask_email(email))

    @staticmethod
    def system(label: str = "system") -> "Actor":
        return Actor("system", None, label)


def _jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return value


def record_event(
    db: Session, case: SponsorshipCase, type_: str, actor: Actor, *,
    visibility: str = "internal", message: Optional[str] = None,
    note: Optional[str] = None, from_status: Optional[str] = None,
    to_status: Optional[str] = None, changes: Optional[dict] = None,
) -> SponsorshipCaseEvent:
    """Append one line to the case's history. Does not commit."""
    event = SponsorshipCaseEvent(
        case_id=case.id,
        type=type_,
        actor_type=actor.type,
        actor_user_id=actor.user_id,
        actor_label=(actor.label or "")[:255] or None,
        from_status=from_status,
        to_status=to_status,
        visibility=visibility,
        message=message,
        note=note,
        changes=_jsonable(changes or {}),
        created_at=datetime.utcnow(),
    )
    db.add(event)
    return event


# ─────────────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────────────

def new_reference(db: Session, kind: str) -> str:
    prefix = "F" if kind == FAMILY else "O"
    for _ in range(20):
        ref = "%s-%s" % (prefix, "".join(secrets.choice(_REF_ALPHABET) for _ in range(6)))
        if not db.query(SponsorshipCase.id).filter(SponsorshipCase.reference == ref).first():
            return ref
    raise SponsorshipError("Could not allocate a reference; please try again.")


_ARABIC_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭ]")


def normalize_name(value: Optional[str]) -> str:
    """A comparison key for names typed by different people.

    Arabic names are written with or without short vowels, and with several
    forms of alef or of the final ta marbuta; two associations filing the same
    child will not type it identically. Latin names differ by case and accents.
    """
    if not value:
        return ""
    text = unicodedata.normalize("NFKC", value).strip().lower()
    text = _ARABIC_DIACRITICS.sub("", text)
    text = text.replace("ـ", "")                      # tatweel
    text = re.sub("[آأإ]", "ا", text)  # آ أ إ -> ا
    text = text.replace("ة", "ه").replace("ى", "ي")  # ة->ه, ى->ي
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_id(value: Optional[str]) -> str:
    return re.sub(r"[\s\-./]", "", (value or "")).upper()


def age_on(birth: Optional[date], today: Optional[date] = None) -> Optional[int]:
    if not birth:
        return None
    today = today or date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def eighteenth_birthday(birth: date) -> date:
    try:
        return birth.replace(year=birth.year + ORPHAN_MAX_AGE)
    except ValueError:  # 29 February
        return birth.replace(year=birth.year + ORPHAN_MAX_AGE, day=28)


def cents(amount_dollars: Optional[float]) -> int:
    return int(round((amount_dollars or 0) * 100))


def details_of(db: Session, case: SponsorshipCase):
    model = SponsorshipFamilyDetails if case.kind == FAMILY else SponsorshipOrphanDetails
    return db.query(model).filter(model.case_id == case.id).first()


def members_of(db: Session, case: SponsorshipCase) -> list[SponsorshipHouseholdMember]:
    return (
        db.query(SponsorshipHouseholdMember)
        .filter(SponsorshipHouseholdMember.case_id == case.id)
        .order_by(SponsorshipHouseholdMember.position, SponsorshipHouseholdMember.id)
        .all()
    )


def documents_of(db: Session, case_id: int) -> list[SponsorshipCaseDocument]:
    return (
        db.query(SponsorshipCaseDocument)
        .filter(SponsorshipCaseDocument.case_id == case_id)
        .order_by(SponsorshipCaseDocument.uploaded_at.desc(), SponsorshipCaseDocument.id.desc())
        .all()
    )


def needs_total(needs: Iterable[dict]) -> int:
    return sum(max(int(n.get("monthly_cents") or 0), 0) for n in needs or [])


# ─────────────────────────────────────────────────────────────────────
# Documents
# ─────────────────────────────────────────────────────────────────────

def missing_required_docs(case: SponsorshipCase, docs: list[SponsorshipCaseDocument]) -> list[str]:
    """Required types with no document that is pending or verified.

    A refused document does not count: the applicant has to send another one.
    """
    present = {d.doc_type for d in docs if d.review_status in ("pending", "verified")}
    return [t for t in REQUIRED_DOCS[case.kind] if t not in present]


def unverified_required_docs(case: SponsorshipCase, docs: list[SponsorshipCaseDocument]) -> list[str]:
    verified = {d.doc_type for d in docs if d.review_status == "verified"}
    return [t for t in REQUIRED_DOCS[case.kind] if t not in verified]


def add_document(
    db: Session, case: SponsorshipCase, *, doc_type: str, checked, object_key: str,
    uploaded_by: str, uploaded_by_email: Optional[str], actor: Actor,
) -> SponsorshipCaseDocument:
    """Record a stored file and log it. Does not commit."""
    doc = SponsorshipCaseDocument(
        case_id=case.id,
        doc_type=doc_type if doc_type in DOC_TYPES else "other",
        filename=checked.filename,
        object_key=object_key,
        content_type=checked.content_type,
        kind=checked.kind,
        size_bytes=checked.size_bytes,
        uploaded_by=uploaded_by,
        uploaded_by_email=uploaded_by_email,
        uploaded_at=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()
    record_event(
        db, case, "document_uploaded", actor,
        visibility="applicant" if uploaded_by == "applicant" else "internal",
        changes={"document_id": doc.id, "doc_type": doc.doc_type, "filename": doc.filename},
    )
    if uploaded_by == "applicant":
        case.last_applicant_activity_at = datetime.utcnow()
    return doc


def review_document(
    db: Session, case: SponsorshipCase, doc: SponsorshipCaseDocument, *,
    status: str, note: Optional[str], staff: User,
) -> SponsorshipCaseDocument:
    if status not in ("verified", "rejected", "pending"):
        raise SponsorshipError("Unknown review status.")
    if status == "rejected" and not (note or "").strip():
        raise SponsorshipError("Say why the document is refused: the applicant needs to know what to send instead.")
    before = doc.review_status
    doc.review_status = status
    doc.review_note = (note or "").strip() or None
    doc.reviewed_at = datetime.utcnow()
    doc.reviewed_by = staff.id
    record_event(
        db, case, "document_reviewed", Actor.staff(staff),
        # A refusal is something the applicant must act on; a verification is
        # reassurance. Both belong in their timeline.
        visibility="applicant" if status in ("verified", "rejected") else "internal",
        message=doc.review_note if status == "rejected" else None,
        changes={"document_id": doc.id, "doc_type": doc.doc_type, "review_status": [before, status]},
    )
    db.commit()
    logger.event(
        ev.SPONSORSHIP_DOCUMENT_REVIEWED, "a supporting document was reviewed",
        case_id=case.id, document_id=doc.id, doc_type=doc.doc_type, review_status=status,
    )
    return doc


# ─────────────────────────────────────────────────────────────────────
# Duplicates and links
# ─────────────────────────────────────────────────────────────────────

def find_duplicates(db: Session, case: SponsorshipCase, details) -> list[dict]:
    """Other cases that look like the same household or the same child.

    Never blocking: the same family is legitimately filed twice when two
    associations accompany it. It is a flag a reviewer must look at.
    """
    flags: list[dict] = []
    if case.kind == FAMILY:
        head_id = normalize_id(details.head_national_id)
        head_name = normalize_name(details.head_full_name)
        rows = (
            db.query(SponsorshipCase, SponsorshipFamilyDetails)
            .join(SponsorshipFamilyDetails, SponsorshipFamilyDetails.case_id == SponsorshipCase.id)
            .filter(SponsorshipCase.id != case.id)
            .all()
        )
        for other, od in rows:
            if head_id and normalize_id(od.head_national_id) == head_id:
                flags.append({"case_id": other.id, "reference": other.reference, "reason": "same_national_id"})
            elif head_name and normalize_name(od.head_full_name) == head_name \
                    and normalize_name(other.city) == normalize_name(case.city):
                flags.append({"case_id": other.id, "reference": other.reference, "reason": "same_name_and_city"})
    else:
        child = normalize_name(details.full_name)
        rows = (
            db.query(SponsorshipCase, SponsorshipOrphanDetails)
            .join(SponsorshipOrphanDetails, SponsorshipOrphanDetails.case_id == SponsorshipCase.id)
            .filter(SponsorshipCase.id != case.id)
            .all()
        )
        for other, od in rows:
            if child and normalize_name(od.full_name) == child and od.birth_date == details.birth_date:
                flags.append({"case_id": other.id, "reference": other.reference, "reason": "same_child"})
    return flags


def link_orphan_to_family(
    db: Session, orphan_case: SponsorshipCase, family_case: Optional[SponsorshipCase], actor: Actor,
) -> None:
    """Point an orphan at its family, or detach it (family_case=None). Commits."""
    if orphan_case.kind != ORPHAN:
        raise SponsorshipError("Only an orphan's case can be linked to a family.")
    if family_case is not None and family_case.kind != FAMILY:
        raise SponsorshipError("An orphan can only be linked to a family case.")
    details = details_of(db, orphan_case)
    before = details.family_case_id
    after = family_case.id if family_case else None
    if before == after:
        return
    details.family_case_id = after
    old_ref = None
    if before:
        old = db.query(SponsorshipCase).get(before)
        old_ref = old.reference if old else before
    record_event(
        db, orphan_case, "family_linked" if after else "family_unlinked", actor,
        changes={"family": [old_ref, family_case.reference if family_case else None]},
    )
    if family_case is not None:
        record_event(db, family_case, "orphan_linked", actor, changes={"orphan": orphan_case.reference})
    db.commit()


# ─────────────────────────────────────────────────────────────────────
# Submission
# ─────────────────────────────────────────────────────────────────────

CASE_FIELDS = (
    "submitter_name", "submitter_phone", "organization_name", "organization_registration",
    "organization_contact_role", "country", "region", "city", "address",
    "situation_category", "situation_description", "monthly_income_cents", "income_sources",
    "other_aid", "urgent_needs",
)
FAMILY_FIELDS = (
    "head_full_name", "head_national_id", "head_birth_year", "head_gender",
    "head_marital_status", "head_occupation", "household_size", "housing_status",
    "monthly_rent_cents", "health_notes",
)
ORPHAN_FIELDS = (
    "full_name", "gender", "birth_date", "orphan_type", "father_name", "father_death_date",
    "father_death_cause", "mother_name", "mother_alive", "mother_death_date",
    "guardian_name", "guardian_relationship", "guardian_national_id", "guardian_phone",
    "lives_with", "school_level", "school_name", "health_status", "interests", "siblings_count",
)
MEMBER_FIELDS = ("first_name", "relationship", "gender", "birth_year", "occupation_or_school",
                 "health_note", "is_orphan")
# What staff may edit on top: the curated profile and the approved amount.
PROFILE_FIELDS = ("public_name", "public_title", "public_title_ar", "public_story",
                  "public_story_ar", "approved_monthly_cents")


def _clean_needs(needs: Iterable[dict]) -> list[dict]:
    out = []
    for n in needs or []:
        category = n.get("category")
        amount = int(n.get("monthly_cents") or 0)
        if category not in NEED_CATEGORIES or amount <= 0:
            continue
        out.append({"category": category, "monthly_cents": amount,
                    "note": (n.get("note") or "").strip()[:300] or None})
    return out


def validate_orphan(data: dict, today: Optional[date] = None) -> None:
    birth = data.get("birth_date")
    age = age_on(birth, today)
    if age is None or age < 0:
        raise SponsorshipError("The child's date of birth is not valid.")
    if age >= ORPHAN_MAX_AGE:
        raise SponsorshipError("Orphan sponsorship is for children under 18. "
                               "An older young person can be included in a family request.")
    if data.get("orphan_type") in ("father", "both") and not data.get("father_name"):
        raise SponsorshipError("Give the father's name.")


def create_case(
    db: Session, kind: str, data: dict, *, ip: Optional[str], actor: Actor,
    submitter_email: str, submitter_type: str, lang: str = "en",
) -> SponsorshipCase:
    """File a new request. Validated input in, committed case out."""
    if kind not in KINDS:
        raise SponsorshipError("Unknown request type.")
    if not data.get("consent_verification"):
        raise SponsorshipError("We can only review a request we are allowed to verify.")
    if kind == ORPHAN:
        validate_orphan(data)

    needs = _clean_needs(data.get("needs") or [])
    if not needs:
        raise SponsorshipError("List at least one monthly need with an amount.")

    now = datetime.utcnow()
    case = SponsorshipCase(
        reference=new_reference(db, kind),
        kind=kind,
        status=SUBMITTED,
        submitter_type=submitter_type,
        submitter_email=submitter_email.strip(),
        preferred_language="ar" if lang == "ar" else "en",
        needs=needs,
        requested_monthly_cents=needs_total(needs),
        consent_verification=True,
        consent_publication=bool(data.get("consent_publication")),
        consent_text=(data.get("consent_text") or "")[:4000] or None,
        consent_at=now,
        submitted_at=now,
        submitted_ip=ip,
        updated_at=now,
        last_applicant_activity_at=now,
        duplicate_flags=[],
    )
    for field in CASE_FIELDS:
        if field in data:
            setattr(case, field, data[field])
    db.add(case)
    db.flush()

    if kind == FAMILY:
        details = SponsorshipFamilyDetails(case_id=case.id, **{f: data.get(f) for f in FAMILY_FIELDS})
        if details.monthly_rent_cents is None:
            details.monthly_rent_cents = 0
        db.add(details)
        for i, m in enumerate(data.get("members") or []):
            db.add(SponsorshipHouseholdMember(case_id=case.id, position=i,
                                              **{f: m.get(f) for f in MEMBER_FIELDS}))
    else:
        details = SponsorshipOrphanDetails(case_id=case.id, **{f: data.get(f) for f in ORPHAN_FIELDS})
        if details.siblings_count is None:
            details.siblings_count = 0
        db.add(details)
    db.flush()

    record_event(
        db, case, "submitted", actor, visibility="applicant", to_status=SUBMITTED,
        changes={"requested_monthly_cents": case.requested_monthly_cents},
    )

    flags = find_duplicates(db, case, details)

    # An orphan filed under a family reference: linked only when that family
    # was filed from the same address. Anyone can type a reference; only the
    # owner of the family's dossier may attach a child to it.
    family_ref = (data.get("family_reference") or "").strip().upper()
    if kind == ORPHAN and family_ref:
        family = db.query(SponsorshipCase).filter(
            SponsorshipCase.reference == family_ref, SponsorshipCase.kind == FAMILY).first()
        if family and family.submitter_email.strip().lower() == case.submitter_email.lower():
            details.family_case_id = family.id
            record_event(db, case, "family_linked", actor, changes={"family": [None, family.reference]})
            record_event(db, family, "orphan_linked", actor, changes={"orphan": case.reference})
        else:
            flags.append({"case_id": family.id if family else None, "reference": family_ref,
                          "reason": "family_reference_unverified"})

    if flags:
        case.duplicate_flags = flags
        record_event(db, case, "duplicates_flagged", Actor.system(), changes={"flags": flags})

    db.commit()
    db.refresh(case)
    logger.event(
        ev.SPONSORSHIP_CASE_SUBMITTED, "a sponsorship request was filed",
        case_id=case.id, reference=case.reference, kind=kind, submitter_type=submitter_type,
        email=mask_email(case.submitter_email), flags=len(flags),
        requested_monthly_cents=case.requested_monthly_cents,
    )
    return case


def _diff(obj, fields: Iterable[str], data: dict) -> dict:
    changes = {}
    for field in fields:
        if field not in data:
            continue
        old = getattr(obj, field)
        new = data[field]
        if old != new:
            changes[field] = [old, new]
            setattr(obj, field, new)
    return changes


def _member_summary(m) -> str:
    get = m.get if isinstance(m, dict) else (lambda k: getattr(m, k))
    return "%s (%s, %s)" % (get("first_name"), get("relationship"), get("birth_year") or "?")


def _apply_content(db: Session, case: SponsorshipCase, data: dict, *, include_profile: bool) -> dict:
    """Write dossier fields, returning a {field: [old, new]} diff."""
    changes = _diff(case, CASE_FIELDS, data)
    if "needs" in data:
        needs = _clean_needs(data["needs"])
        if not needs:
            raise SponsorshipError("List at least one monthly need with an amount.")
        if needs != case.needs:
            changes["needs"] = [case.needs, needs]
            case.needs = needs
            case.requested_monthly_cents = needs_total(needs)
    if include_profile:
        changes.update(_diff(case, PROFILE_FIELDS, data))
        if case.approved_monthly_cents is not None and case.approved_monthly_cents <= 0:
            raise SponsorshipError("The approved monthly amount must be positive.")
    if "consent_publication" in data and bool(data["consent_publication"]) != case.consent_publication:
        changes["consent_publication"] = [case.consent_publication, bool(data["consent_publication"])]
        case.consent_publication = bool(data["consent_publication"])

    details = details_of(db, case)
    if case.kind == FAMILY:
        changes.update(_diff(details, FAMILY_FIELDS, data))
        if "members" in data:
            old = members_of(db, case)
            old_summary = [_member_summary(m) for m in old]
            new_summary = [_member_summary(m) for m in data["members"] or []]
            if old_summary != new_summary or len(old) != len(data["members"] or []):
                for m in old:
                    db.delete(m)
                for i, m in enumerate(data["members"] or []):
                    db.add(SponsorshipHouseholdMember(case_id=case.id, position=i,
                                                      **{f: m.get(f) for f in MEMBER_FIELDS}))
                changes["members"] = [old_summary, new_summary]
    else:
        merged = {f: getattr(details, f) for f in ORPHAN_FIELDS}
        merged.update({k: v for k, v in data.items() if k in ORPHAN_FIELDS})
        validate_orphan(merged)
        changes.update(_diff(details, ORPHAN_FIELDS, data))
    case.updated_at = datetime.utcnow()
    return changes


def resubmit(db: Session, case: SponsorshipCase, data: dict, actor: Actor) -> dict:
    """The applicant answers an information request. Commits."""
    if case.status != INFO_REQUESTED:
        raise SponsorshipError("This request can only be changed when we have asked you for more information.")
    changes = _apply_content(db, case, data, include_profile=False)
    before = case.status
    case.status = UNDER_REVIEW
    case.last_applicant_activity_at = datetime.utcnow()
    record_event(
        db, case, "resubmitted", actor, visibility="applicant",
        from_status=before, to_status=case.status, changes=changes,
        message=(data.get("message") or "").strip()[:2000] or None,
    )
    db.commit()
    logger.event(
        ev.SPONSORSHIP_CASE_RESUBMITTED, "an applicant answered an information request",
        case_id=case.id, reference=case.reference, fields_changed=len(changes),
    )
    return changes


def staff_edit(db: Session, case: SponsorshipCase, data: dict, staff: User, note: Optional[str] = None) -> dict:
    """Staff correct the dossier or write the public profile. Commits."""
    changes = _apply_content(db, case, data, include_profile=True)
    if "assigned_to" in data and data["assigned_to"] != case.assigned_to:
        changes["assigned_to"] = [case.assigned_to, data["assigned_to"]]
        case.assigned_to = data["assigned_to"]
    if not changes:
        return {}
    # Private fields are diffed in full: the history is staff-only, and a
    # reviewer has to be able to see what a colleague changed.
    record_event(db, case, "edited", Actor.staff(staff), note=note, changes=changes)
    db.commit()
    logger.event(
        ev.SPONSORSHIP_CASE_EDITED, "staff edited a sponsorship case",
        case_id=case.id, reference=case.reference, fields=",".join(sorted(changes))[:200],
    )
    return changes


# ─────────────────────────────────────────────────────────────────────
# Coverage — derived, never stored
# ─────────────────────────────────────────────────────────────────────

def coverage_map(db: Session, cases: list[SponsorshipCase]) -> dict[int, dict]:
    ids = [c.id for c in cases]
    if not ids:
        return {}
    now = datetime.utcnow()
    committed = dict(
        db.query(Sponsorship.case_id, func.coalesce(func.sum(Sponsorship.monthly_amount_cents), 0))
        .filter(Sponsorship.case_id.in_(ids), Sponsorship.status.in_(COMMITTED_STATUSES))
        .group_by(Sponsorship.case_id).all()
    )
    sponsors = dict(
        db.query(Sponsorship.case_id, func.count(Sponsorship.id))
        .filter(Sponsorship.case_id.in_(ids), Sponsorship.status.in_(COMMITTED_STATUSES))
        .group_by(Sponsorship.case_id).all()
    )
    held = dict(
        db.query(Sponsorship.case_id, func.coalesce(func.sum(Sponsorship.monthly_amount_cents), 0))
        .filter(Sponsorship.case_id.in_(ids), Sponsorship.status == SP_PENDING,
                Sponsorship.checkout_expires_at > now)
        .group_by(Sponsorship.case_id).all()
    )
    return {c.id: coverage_of(c, int(committed.get(c.id, 0)), int(held.get(c.id, 0)),
                              int(sponsors.get(c.id, 0))) for c in cases}


def coverage_of(case: SponsorshipCase, committed: int, held: int = 0, sponsors: int = 0) -> dict:
    need = case.approved_monthly_cents or 0
    remaining = max(need - committed, 0)
    available = max(need - committed - held, 0)
    if committed <= 0:
        state = "unfunded"
    elif committed >= need > 0:
        state = "full"
    else:
        state = "partial"
    return {
        "monthly_need_cents": need,
        "committed_cents": committed,
        "remaining_cents": remaining,
        # What a new sponsor may still take on: excludes open checkouts, so
        # two donors cannot both be offered the last $50.
        "available_cents": available,
        "percent": min(100, round(committed * 100 / need)) if need else 0,
        "state": state,
        "overfunded": need > 0 and committed > need,
        "sponsors": sponsors,
    }


# ─────────────────────────────────────────────────────────────────────
# Transitions
# ─────────────────────────────────────────────────────────────────────

# action -> (allowed from, to, visibility of the event to the applicant)
TRANSITIONS: dict[str, tuple[tuple[str, ...], str]] = {
    "start_review": ((SUBMITTED,), UNDER_REVIEW),
    "request_info": ((SUBMITTED, UNDER_REVIEW, APPROVED), INFO_REQUESTED),
    "approve": ((SUBMITTED, UNDER_REVIEW), APPROVED),
    "reject": ((SUBMITTED, UNDER_REVIEW, INFO_REQUESTED, APPROVED), REJECTED),
    "publish": ((APPROVED, PAUSED), PUBLISHED),
    "pause": ((PUBLISHED,), PAUSED),
    "close": ((SUBMITTED, UNDER_REVIEW, INFO_REQUESTED, APPROVED, PUBLISHED, PAUSED, REJECTED), CLOSED),
    "reopen": ((REJECTED, CLOSED), UNDER_REVIEW),
}
# These carry a message the applicant must read, so one is required.
MESSAGE_REQUIRED = ("request_info", "reject")


def approval_blockers(db: Session, case: SponsorshipCase, amount_cents: Optional[int]) -> list[str]:
    blockers = []
    docs = documents_of(db, case.id)
    for t in unverified_required_docs(case, docs):
        blockers.append("document_not_verified:%s" % t)
    if not (amount_cents or case.approved_monthly_cents or case.requested_monthly_cents):
        blockers.append("no_monthly_amount")
    if case.duplicate_flags and not case.duplicates_reviewed_at:
        blockers.append("duplicates_not_reviewed")
    return blockers


def publish_blockers(db: Session, case: SponsorshipCase) -> list[str]:
    blockers = []
    if not case.approved_monthly_cents:
        blockers.append("no_monthly_amount")
    if not (case.public_name or "").strip():
        blockers.append("no_public_name")
    if not (case.public_title or "").strip():
        blockers.append("no_public_title")
    if not (case.public_story or "").strip():
        blockers.append("no_public_story")
    if not case.consent_publication:
        blockers.append("no_publication_consent")
    docs = documents_of(db, case.id)
    for t in unverified_required_docs(case, docs):
        blockers.append("document_not_verified:%s" % t)
    if case.kind == ORPHAN:
        d = details_of(db, case)
        if d and (age_on(d.birth_date) or 0) >= ORPHAN_MAX_AGE:
            blockers.append("orphan_aged_out")
    return blockers


def committed_sponsorships(db: Session, case_id: int) -> list[Sponsorship]:
    return (
        db.query(Sponsorship)
        .filter(Sponsorship.case_id == case_id, Sponsorship.status.in_(COMMITTED_STATUSES))
        .all()
    )


def transition(
    db: Session, case: SponsorshipCase, action: str, staff: User, *,
    message: Optional[str] = None, note: Optional[str] = None,
    approved_monthly_cents: Optional[int] = None, close_reason: Optional[str] = None,
    end_sponsorships: bool = False, cancel_subscription=None,
) -> SponsorshipCase:
    """Move a case through its lifecycle, or refuse with the reasons why.

    `cancel_subscription(sponsorship)` is injected by the router so that this
    module stays free of Stripe; closing a case with sponsors calls it for
    each before anything is written, so a Stripe failure changes nothing.
    """
    if action not in TRANSITIONS:
        raise TransitionRefused("Unknown action.")
    allowed_from, to_status = TRANSITIONS[action]
    if case.status not in allowed_from:
        raise TransitionRefused("A case that is %s cannot be moved that way." % case.status.replace("_", " "))
    message = (message or "").strip() or None
    note = (note or "").strip() or None
    if action in MESSAGE_REQUIRED and not message:
        raise TransitionRefused("Write the message the applicant will receive.", ["message_required"])

    actor = Actor.staff(staff)
    changes: dict = {}
    now = datetime.utcnow()

    if action == "approve":
        amount = approved_monthly_cents or case.approved_monthly_cents or case.requested_monthly_cents
        blockers = approval_blockers(db, case, amount)
        if blockers:
            raise TransitionRefused("This case cannot be approved yet.", blockers)
        if amount != case.approved_monthly_cents:
            changes["approved_monthly_cents"] = [case.approved_monthly_cents, amount]
        case.approved_monthly_cents = amount
        case.approved_at = now
    elif action == "publish":
        blockers = publish_blockers(db, case)
        if blockers:
            raise TransitionRefused("This case cannot be published yet.", blockers)
        if not case.published_at:
            # Kept across pause/publish so "waiting since" stays honest.
            case.published_at = now
    elif action == "close":
        if close_reason not in CLOSE_REASONS:
            raise TransitionRefused("Choose why the case is being closed.", ["close_reason_required"])
        active = committed_sponsorships(db, case.id)
        if active and not end_sponsorships:
            raise TransitionRefused(
                "%d sponsor(s) are still giving to this case. Confirm that their "
                "sponsorships should end." % len(active), ["active_sponsorships"])
        for sp in active:
            if cancel_subscription is not None:
                cancel_subscription(sp)
            _mark_ended(db, sp, status=SP_ENDED, by="staff", reason="case_closed", note=None)
            record_event(db, case, "sponsorship_ended", actor, visibility="sponsor",
                         changes={"sponsorship_id": sp.id, "reason": "case_closed"})
        case.close_reason = close_reason
        case.closed_at = now
        changes["close_reason"] = close_reason
        if active:
            changes["sponsorships_ended"] = len(active)
    elif action == "reopen":
        case.closed_at = None
        case.close_reason = None

    before = case.status
    case.status = to_status
    case.updated_at = now
    record_event(
        db, case, action, actor,
        visibility="applicant", from_status=before, to_status=to_status,
        message=message, note=note, changes=changes,
    )
    db.commit()
    db.refresh(case)
    logger.event(
        ev.SPONSORSHIP_CASE_TRANSITIONED, "a sponsorship case changed status",
        case_id=case.id, reference=case.reference, kind=case.kind, action=action,
        from_status=before, to_status=to_status, by=mask_email(staff.email),
    )
    return case


def mark_seen(db: Session, case: SponsorshipCase) -> None:
    case.admin_seen_at = datetime.utcnow()
    db.commit()


def is_unread(case: SponsorshipCase) -> bool:
    return case.admin_seen_at is None or case.last_applicant_activity_at > case.admin_seen_at


def clear_duplicates(db: Session, case: SponsorshipCase, staff: User, note: Optional[str]) -> None:
    case.duplicates_reviewed_at = datetime.utcnow()
    record_event(db, case, "duplicates_reviewed", Actor.staff(staff), note=note,
                 changes={"flags": case.duplicate_flags})
    db.commit()


def add_note(db: Session, case: SponsorshipCase, staff: User, note: str) -> None:
    if not (note or "").strip():
        raise SponsorshipError("The note is empty.")
    record_event(db, case, "note", Actor.staff(staff), note=note.strip())
    db.commit()


# ─────────────────────────────────────────────────────────────────────
# Sponsorships — the money path
# ─────────────────────────────────────────────────────────────────────

def open_checkout(
    db: Session, case: SponsorshipCase, *, email: str, name: str, amount_cents: int, lang: str,
) -> Sponsorship:
    """Reserve a monthly amount for a donor about to pay. Commits.

    The caller creates the Stripe session and stores its id and expiry.
    """
    if case.status != PUBLISHED:
        raise SponsorshipError("This profile is not open for sponsorship at the moment.")
    cov = coverage_map(db, [case])[case.id]
    available = cov["available_cents"]
    if available <= 0:
        raise SponsorshipError("This need is already fully covered. Thank you — "
                               "please choose someone who is still waiting.")
    if amount_cents > MAX_MONTHLY_CENTS:
        raise SponsorshipError("That amount looks too large; please check it.")
    # Below the minimum is allowed only to close the last gap exactly.
    if amount_cents < MIN_MONTHLY_CENTS and amount_cents != available:
        raise SponsorshipError("The minimum sponsorship is $%d a month." % (MIN_MONTHLY_CENTS // 100))
    if amount_cents > available:
        raise SponsorshipError("Only $%s a month is still needed." % _dollars(available))
    sp = Sponsorship(
        case_id=case.id,
        sponsor_email=email.strip(),
        sponsor_name=name.strip(),
        preferred_language="ar" if lang == "ar" else "en",
        monthly_amount_cents=amount_cents,
        status=SP_PENDING,
        checkout_expires_at=datetime.utcnow() + timedelta(minutes=CHECKOUT_HOLD_MINUTES),
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp


def _dollars(amount_cents: int) -> str:
    return ("%.2f" % (amount_cents / 100)).rstrip("0").rstrip(".")


def find_sponsorship(db: Session, *, sponsorship_id=None, subscription_id=None, session_id=None):
    q = db.query(Sponsorship)
    if subscription_id:
        row = q.filter(Sponsorship.stripe_subscription_id == subscription_id).first()
        if row:
            return row
    if session_id:
        row = q.filter(Sponsorship.stripe_checkout_session_id == session_id).first()
        if row:
            return row
    if sponsorship_id:
        try:
            return q.filter(Sponsorship.id == int(sponsorship_id)).first()
        except (TypeError, ValueError):
            return None
    return None


def _mark_started(db: Session, sp: Sponsorship, event_id: str = "") -> None:
    """pending -> active, with its history line and log event. Does not commit.

    Called from whichever Stripe event arrives first: checkout completion and
    the first paid invoice race each other, and the sponsorship must start
    exactly once either way.
    """
    sp.status = SP_ACTIVE
    sp.started_at = sp.started_at or datetime.utcnow()
    case = db.query(SponsorshipCase).get(sp.case_id)
    record_event(
        db, case, "sponsorship_started", Actor.sponsor(sp.sponsor_email),
        # The family is told it has a sponsor and for how much; never who.
        visibility="applicant",
        changes={"sponsorship_id": sp.id, "monthly_amount_cents": sp.monthly_amount_cents},
    )
    logger.event(
        ev.SPONSORSHIP_STARTED, "a sponsorship started", outcome=ev.OUTCOME_SUCCESS,
        sponsorship_id=sp.id, case_id=sp.case_id, monthly_amount_cents=sp.monthly_amount_cents,
        email=mask_email(sp.sponsor_email), stripe_subscription=sp.stripe_subscription_id,
        stripe_event=event_id,
    )


def activate(db: Session, sp: Sponsorship, *, subscription_id: Optional[str],
             customer_id: Optional[str], event_id: str = "") -> bool:
    """The donor completed checkout. True when this call started it. Commits."""
    if subscription_id and not sp.stripe_subscription_id:
        sp.stripe_subscription_id = subscription_id
    if customer_id and not sp.stripe_customer_id:
        sp.stripe_customer_id = customer_id
    started = sp.status in (SP_PENDING, SP_ABANDONED)
    if started:
        _mark_started(db, sp, event_id)
    db.commit()
    return started


def invoice_subscription_id(invoice: dict) -> Optional[str]:
    """The subscription an invoice belongs to, across Stripe API versions."""
    sub = invoice.get("subscription")
    if isinstance(sub, dict):
        sub = sub.get("id")
    if sub:
        return sub
    parent = invoice.get("parent") or {}
    details = parent.get("subscription_details") or {}
    sub = details.get("subscription")
    return sub.get("id") if isinstance(sub, dict) else sub


def invoice_sponsorship_id(invoice: dict) -> Optional[str]:
    for holder in (
        (invoice.get("subscription_details") or {}),
        ((invoice.get("parent") or {}).get("subscription_details") or {}),
    ):
        sid = (holder.get("metadata") or {}).get("sponsorship_id")
        if sid:
            return sid
    for line in ((invoice.get("lines") or {}).get("data") or []):
        sid = (line.get("metadata") or {}).get("sponsorship_id")
        if sid:
            return sid
    return None


def record_payment(db: Session, invoice: dict, event_id: str = "") -> tuple[Optional[Sponsorship], Optional[Donation], bool, bool]:
    """Tag (or create) the Donation for a paid sponsorship invoice. Commits.

    Returns (sponsorship, donation, created, started). `created` is True when
    this hook had to write the Donation itself — the generic subscription path
    skips an invoice whose DonationSubscription row has not arrived yet, and
    money that was taken must never go unrecorded — in which case the caller
    sends the receipt. `started` is True when this payment is what started the
    sponsorship (its checkout event has not been processed yet).
    """
    sub_id = invoice_subscription_id(invoice)
    sp = find_sponsorship(db, subscription_id=sub_id, sponsorship_id=invoice_sponsorship_id(invoice))
    if sp is None:
        return None, None, False, False
    if sub_id and not sp.stripe_subscription_id:
        sp.stripe_subscription_id = sub_id

    invoice_id = invoice.get("id", "")
    amount = (invoice.get("amount_paid") or 0) / 100.0
    donation = db.query(Donation).filter(Donation.stripe_session_id == invoice_id).first()
    created = False
    if donation is None:
        case = db.query(SponsorshipCase).get(sp.case_id)
        donation = Donation(
            name=sp.sponsor_name,
            email=sp.sponsor_email,
            amount=amount,
            frequency="Sponsorship (monthly) %s" % (case.reference if case else ""),
            stripe_session_id=invoice_id,
            donated_at=datetime.utcnow(),
            certificate_filename="available",
            payment_method="Stripe",
            sponsorship_id=sp.id,
        )
        db.add(donation)
        created = True
    else:
        donation.sponsorship_id = sp.id

    first_payment = sp.last_payment_at is None
    sp.last_payment_at = datetime.utcnow()
    started = sp.status in (SP_PENDING, SP_ABANDONED)
    if started:
        _mark_started(db, sp, event_id)
    elif sp.status == SP_PAST_DUE:
        sp.status = SP_ACTIVE
        case = db.query(SponsorshipCase).get(sp.case_id)
        record_event(db, case, "sponsorship_recovered", Actor.system("stripe"),
                     changes={"sponsorship_id": sp.id})
    db.commit()
    db.refresh(donation)
    logger.event(
        ev.SPONSORSHIP_PAYMENT_RECORDED, "a sponsorship payment was recorded",
        outcome=ev.OUTCOME_SUCCESS, sponsorship_id=sp.id, case_id=sp.case_id,
        donation_id=donation.id, amount=amount, currency="usd", first_payment=first_payment,
        recorded_as="created_by_hook" if created else "tagged", stripe_event=event_id,
    )
    return sp, donation, created, started


def mark_past_due(db: Session, subscription_id: str, event_id: str = "") -> Optional[Sponsorship]:
    sp = find_sponsorship(db, subscription_id=subscription_id)
    if sp is None or sp.status not in (SP_ACTIVE, SP_PENDING):
        return sp
    sp.status = SP_PAST_DUE
    case = db.query(SponsorshipCase).get(sp.case_id)
    record_event(db, case, "sponsorship_past_due", Actor.system("stripe"),
                 changes={"sponsorship_id": sp.id})
    db.commit()
    logger.event(
        ev.SPONSORSHIP_PAYMENT_FAILED, "a sponsorship payment failed",
        level=30, outcome=ev.OUTCOME_FAILURE, reason=ev.REASON_CARD_DECLINED,
        sponsorship_id=sp.id, case_id=sp.case_id, stripe_event=event_id,
    )
    return sp


def _mark_ended(db: Session, sp: Sponsorship, *, status: str, by: str,
                reason: Optional[str], note: Optional[str]) -> None:
    sp.status = status
    sp.ended_at = datetime.utcnow()
    sp.ended_by = by
    sp.end_reason = reason
    sp.end_note = (note or "").strip()[:2000] or None
    logger.event(
        ev.SPONSORSHIP_ENDED, "a sponsorship ended",
        sponsorship_id=sp.id, case_id=sp.case_id, ended_by=by, reason=reason,
        monthly_amount_cents=sp.monthly_amount_cents,
    )


def end_from_stripe(db: Session, subscription_id: str) -> Optional[Sponsorship]:
    """Stripe deleted the subscription (retries exhausted, or cancelled in Stripe)."""
    sp = find_sponsorship(db, subscription_id=subscription_id)
    if sp is None or sp.status in (SP_CANCELED, SP_ENDED):
        return sp
    reason = "payment_failed" if sp.status == SP_PAST_DUE else "other"
    _mark_ended(db, sp, status=SP_ENDED, by="stripe", reason=reason, note=None)
    case = db.query(SponsorshipCase).get(sp.case_id)
    record_event(db, case, "sponsorship_ended", Actor.system("stripe"),
                 changes={"sponsorship_id": sp.id, "reason": reason})
    db.commit()
    return sp


def expire_checkout(db: Session, session_id: str) -> None:
    sp = find_sponsorship(db, session_id=session_id)
    if sp is not None and sp.status == SP_PENDING:
        sp.status = SP_ABANDONED
        db.commit()


def end_by_sponsor(db: Session, sp: Sponsorship, *, reason: Optional[str], note: Optional[str]) -> None:
    if sp.status not in COMMITTED_STATUSES:
        raise SponsorshipError("This sponsorship is not running.")
    _mark_ended(db, sp, status=SP_CANCELED, by="sponsor",
                reason=reason if reason in SPONSOR_END_REASONS else "other", note=note)
    case = db.query(SponsorshipCase).get(sp.case_id)
    record_event(db, case, "sponsorship_ended", Actor.sponsor(sp.sponsor_email),
                 note=sp.end_note, changes={"sponsorship_id": sp.id, "reason": sp.end_reason})
    db.commit()


def end_by_staff(db: Session, sp: Sponsorship, staff: User, *, reason: Optional[str], note: Optional[str]) -> None:
    if sp.status not in COMMITTED_STATUSES + (SP_PENDING,):
        raise SponsorshipError("This sponsorship is not running.")
    _mark_ended(db, sp, status=SP_ENDED, by="staff", reason=reason or "staff", note=note)
    case = db.query(SponsorshipCase).get(sp.case_id)
    record_event(db, case, "sponsorship_ended", Actor.staff(staff), note=sp.end_note,
                 changes={"sponsorship_id": sp.id, "reason": sp.end_reason})
    db.commit()


# ─────────────────────────────────────────────────────────────────────
# Use of funds and updates
# ─────────────────────────────────────────────────────────────────────

def finances_map(db: Session, case_ids: list[int]) -> dict[int, dict]:
    if not case_ids:
        return {}
    collected = dict(
        db.query(Sponsorship.case_id, func.coalesce(func.sum(Donation.amount), 0.0))
        .join(Donation, Donation.sponsorship_id == Sponsorship.id)
        .filter(Sponsorship.case_id.in_(case_ids))
        .group_by(Sponsorship.case_id).all()
    )
    disbursed = dict(
        db.query(SponsorshipDisbursement.case_id, func.coalesce(func.sum(SponsorshipDisbursement.amount_cents), 0))
        .filter(SponsorshipDisbursement.case_id.in_(case_ids))
        .group_by(SponsorshipDisbursement.case_id).all()
    )
    out = {}
    for cid in case_ids:
        c = cents(collected.get(cid, 0))
        d = int(disbursed.get(cid, 0))
        out[cid] = {"collected_cents": c, "disbursed_cents": d, "balance_cents": c - d}
    return out


def record_disbursement(db: Session, case: SponsorshipCase, staff: User, data: dict) -> SponsorshipDisbursement:
    if data.get("category") not in DISBURSEMENT_CATEGORIES:
        raise SponsorshipError("Choose what the money was spent on.")
    if not (data.get("description") or "").strip():
        raise SponsorshipError("Describe the distribution: sponsors and the family will read it.")
    amount = int(data.get("amount_cents") or 0)
    if amount <= 0:
        raise SponsorshipError("The amount must be positive.")
    row = SponsorshipDisbursement(
        case_id=case.id,
        amount_cents=amount,
        category=data["category"],
        period=data.get("period"),
        description=data["description"].strip(),
        description_ar=(data.get("description_ar") or "").strip() or None,
        internal_note=(data.get("internal_note") or "").strip() or None,
        disbursed_at=data.get("disbursed_at") or date.today(),
        receipt_document_id=data.get("receipt_document_id"),
        recorded_by=staff.id,
    )
    db.add(row)
    db.flush()
    record_event(
        db, case, "disbursement_recorded", Actor.staff(staff), visibility="sponsor",
        changes={"disbursement_id": row.id, "amount_cents": amount, "category": row.category},
    )
    db.commit()
    db.refresh(row)
    logger.event(
        ev.SPONSORSHIP_DISBURSEMENT_RECORDED, "funds were distributed to a sponsored case",
        case_id=case.id, disbursement_id=row.id, amount_cents=amount, category=row.category,
    )
    return row


def post_update(db: Session, case: SponsorshipCase, staff: User, data: dict) -> SponsorshipCaseUpdate:
    if not (data.get("title") or "").strip() or not (data.get("body") or "").strip():
        raise SponsorshipError("An update needs a title and a message.")
    row = SponsorshipCaseUpdate(
        case_id=case.id,
        title=data["title"].strip()[:200],
        title_ar=(data.get("title_ar") or "").strip()[:200] or None,
        body=data["body"].strip(),
        body_ar=(data.get("body_ar") or "").strip() or None,
        photo_key=data.get("photo_key"),
        created_by=staff.id,
    )
    db.add(row)
    db.flush()
    record_event(db, case, "update_posted", Actor.staff(staff), visibility="sponsor",
                 changes={"update_id": row.id, "title": row.title})
    db.commit()
    db.refresh(row)
    return row


# ─────────────────────────────────────────────────────────────────────
# Serializers — one per audience
# ─────────────────────────────────────────────────────────────────────

def _iso(value) -> Optional[str]:
    return value.isoformat() if value else None


def _public_needs(case: SponsorshipCase) -> list[dict]:
    # Category and amount only: the applicant's own notes can name people.
    return [{"category": n["category"], "monthly_cents": n["monthly_cents"]} for n in case.needs or []]


def _verified_doc_types(docs: list[SponsorshipCaseDocument]) -> list[str]:
    return sorted({d.doc_type for d in docs if d.review_status == "verified" and d.doc_type != "photo"})


def public_card(case: SponsorshipCase, details, coverage: dict, *, photo_url: Optional[str] = None) -> dict:
    """What anyone browsing the listing may see. Written field by field."""
    card = {
        "reference": case.reference,
        "kind": case.kind,
        "display_name": case.public_name,
        "title": case.public_title,
        "title_ar": case.public_title_ar,
        "country": case.country,
        "region": case.region,
        "monthly_need_cents": case.approved_monthly_cents or 0,
        "coverage": {k: coverage[k] for k in ("committed_cents", "remaining_cents", "available_cents",
                                              "percent", "state", "sponsors")},
        "waiting_since": _iso(case.published_at),
        "verified_at": _iso(case.approved_at),
        "photo_url": photo_url,
        "needs": _public_needs(case),
    }
    if case.kind == ORPHAN and details is not None:
        card["age"] = age_on(details.birth_date)
        card["gender"] = details.gender
    elif details is not None:
        card["household_size"] = details.household_size
    return card


def public_detail(
    db: Session, case: SponsorshipCase, details, coverage: dict, *,
    photo_url: Optional[str], finances: dict, related: list[dict],
) -> dict:
    out = public_card(case, details, coverage, photo_url=photo_url)
    out.update({
        "story": case.public_story,
        "story_ar": case.public_story_ar,
        "verified_documents": _verified_doc_types(documents_of(db, case.id)),
        # Totals only. The line-by-line use of funds is for sponsors.
        "distributed_cents": finances.get("disbursed_cents", 0),
        "related": related,
    })
    if case.kind == ORPHAN and details is not None:
        out["school_level"] = details.school_level
        out["orphan_type"] = details.orphan_type
    return out


def disbursement_view(row: SponsorshipDisbursement) -> dict:
    return {
        "id": row.id,
        "amount_cents": row.amount_cents,
        "category": row.category,
        "period": row.period,
        "description": row.description,
        "description_ar": row.description_ar,
        "disbursed_at": _iso(row.disbursed_at),
    }


def update_view(row: SponsorshipCaseUpdate, photo_url: Optional[str] = None) -> dict:
    return {
        "id": row.id, "title": row.title, "title_ar": row.title_ar,
        "body": row.body, "body_ar": row.body_ar, "photo_url": photo_url,
        "created_at": _iso(row.created_at),
    }


def document_view(doc: SponsorshipCaseDocument, *, staff: bool = False) -> dict:
    out = {
        "id": doc.id, "doc_type": doc.doc_type, "filename": doc.filename, "kind": doc.kind,
        "size_bytes": doc.size_bytes, "uploaded_at": _iso(doc.uploaded_at),
        "review_status": doc.review_status, "review_note": doc.review_note,
        "reviewed_at": _iso(doc.reviewed_at),
    }
    if staff:
        out.update({"uploaded_by": doc.uploaded_by, "uploaded_by_email": doc.uploaded_by_email,
                    "content_type": doc.content_type, "reviewed_by": doc.reviewed_by})
    return out


def event_view(e: SponsorshipCaseEvent, *, staff: bool) -> dict:
    out = {
        "id": e.id, "type": e.type, "from_status": e.from_status, "to_status": e.to_status,
        "message": e.message, "created_at": _iso(e.created_at),
    }
    if staff:
        out.update({"actor_type": e.actor_type, "actor_label": e.actor_label,
                    "actor_user_id": e.actor_user_id, "visibility": e.visibility,
                    "note": e.note, "changes": e.changes or {}})
    else:
        # The applicant learns whether it was them or the team, not who on the team.
        out["by"] = "you" if e.actor_type == "applicant" else ("sponsor" if e.actor_type == "sponsor" else "team")
        if e.type in ("document_uploaded", "document_reviewed"):
            ch = e.changes or {}
            out["doc_type"] = ch.get("doc_type")
            rs = ch.get("review_status")
            out["review_status"] = rs[1] if isinstance(rs, list) else None
        if e.type == "sponsorship_started":
            out["monthly_amount_cents"] = (e.changes or {}).get("monthly_amount_cents")
    return out


def _details_dict(case: SponsorshipCase, details) -> dict:
    fields = FAMILY_FIELDS if case.kind == FAMILY else ORPHAN_FIELDS
    data = {f: _jsonable(getattr(details, f)) for f in fields} if details is not None else {}
    if case.kind == ORPHAN and details is not None:
        data["family_case_id"] = details.family_case_id
        data["age"] = age_on(details.birth_date)
    return data


def _dossier(case: SponsorshipCase) -> dict:
    data = {f: getattr(case, f) for f in CASE_FIELDS}
    data.update({
        "needs": case.needs or [],
        "requested_monthly_cents": case.requested_monthly_cents,
        "consent_publication": case.consent_publication,
    })
    return data


def applicant_view(db: Session, case: SponsorshipCase, coverage: dict, finances: dict) -> dict:
    """The applicant's own dossier: everything they told us, and where it stands."""
    details = details_of(db, case)
    docs = documents_of(db, case.id)
    events = (
        db.query(SponsorshipCaseEvent)
        .filter(SponsorshipCaseEvent.case_id == case.id, SponsorshipCaseEvent.visibility == "applicant")
        .order_by(SponsorshipCaseEvent.created_at.desc(), SponsorshipCaseEvent.id.desc())
        .all()
    )
    disbursements = (
        db.query(SponsorshipDisbursement)
        .filter(SponsorshipDisbursement.case_id == case.id)
        .order_by(SponsorshipDisbursement.disbursed_at.desc()).all()
    )
    # The last message the team addressed to the applicant, for the banner.
    last_message = next((e.message for e in events if e.message and e.actor_type == "staff"), None)
    family_ref = None
    linked_orphans = []
    if case.kind == ORPHAN and details is not None and details.family_case_id:
        fam = db.query(SponsorshipCase).get(details.family_case_id)
        family_ref = fam.reference if fam else None
    if case.kind == FAMILY:
        linked_orphans = [
            {"reference": c.reference, "status": c.status}
            for c, _ in db.query(SponsorshipCase, SponsorshipOrphanDetails)
            .join(SponsorshipOrphanDetails, SponsorshipOrphanDetails.case_id == SponsorshipCase.id)
            .filter(SponsorshipOrphanDetails.family_case_id == case.id).all()
        ]
    return {
        "id": case.id,
        "reference": case.reference,
        "kind": case.kind,
        "status": case.status,
        "submitted_at": _iso(case.submitted_at),
        "updated_at": _iso(case.updated_at),
        "editable": case.status == INFO_REQUESTED,
        "may_upload": case.status in OPEN_STATUSES,
        "last_message": last_message,
        "dossier": _dossier(case),
        "details": _details_dict(case, details),
        "members": [{f: getattr(m, f) for f in MEMBER_FIELDS} for m in members_of(db, case)] if case.kind == FAMILY else [],
        "documents": [document_view(d) for d in docs],
        "missing_documents": missing_required_docs(case, docs),
        "required_documents": list(REQUIRED_DOCS[case.kind]),
        "timeline": [event_view(e, staff=False) for e in events],
        "unread": sum(1 for e in events if case.applicant_seen_at is None or e.created_at > case.applicant_seen_at),
        "family_reference": family_ref,
        "linked_orphans": linked_orphans,
        "sponsorship": {
            "monthly_need_cents": coverage["monthly_need_cents"],
            "committed_cents": coverage["committed_cents"],
            "sponsors": coverage["sponsors"],
            "state": coverage["state"],
        } if case.status in (PUBLISHED, PAUSED, CLOSED) else None,
        "disbursements": [disbursement_view(d) for d in disbursements],
        "received_cents": finances.get("disbursed_cents", 0),
    }


def staff_case_summary(case: SponsorshipCase, details, coverage: dict, finances: dict,
                       docs_pending: int = 0, missing: Optional[list[str]] = None) -> dict:
    """A row in the admin list."""
    name = None
    extra = {}
    if details is not None:
        if case.kind == FAMILY:
            name = details.head_full_name
            extra["household_size"] = details.household_size
        else:
            name = details.full_name
            extra["age"] = age_on(details.birth_date)
            extra["family_case_id"] = details.family_case_id
            b18 = eighteenth_birthday(details.birth_date)
            extra["ages_out_on"] = _iso(b18)
    return {
        "id": case.id,
        "reference": case.reference,
        "kind": case.kind,
        "status": case.status,
        "name": name,
        "public_name": case.public_name,
        "submitter_type": case.submitter_type,
        "submitter_email": case.submitter_email,
        "organization_name": case.organization_name,
        "country": case.country,
        "city": case.city,
        "submitted_at": _iso(case.submitted_at),
        "updated_at": _iso(case.updated_at),
        "published_at": _iso(case.published_at),
        "requested_monthly_cents": case.requested_monthly_cents,
        "approved_monthly_cents": case.approved_monthly_cents,
        "coverage": coverage,
        "finances": finances,
        "unread": is_unread(case),
        "flags": len(case.duplicate_flags or []) if not case.duplicates_reviewed_at else 0,
        "docs_pending": docs_pending,
        "missing_documents": missing or [],
        "assigned_to": case.assigned_to,
        **extra,
    }


def staff_view(db: Session, case: SponsorshipCase, *, photo_url_for) -> dict:
    """Everything, for staff."""
    details = details_of(db, case)
    docs = documents_of(db, case.id)
    cov = coverage_map(db, [case])[case.id]
    fin = finances_map(db, [case.id])[case.id]
    sponsorships = (
        db.query(Sponsorship).filter(Sponsorship.case_id == case.id)
        .order_by(Sponsorship.created_at.desc()).all()
    )
    payments = {}
    if sponsorships:
        for d in (db.query(Donation).filter(Donation.sponsorship_id.in_([s.id for s in sponsorships]))
                  .order_by(Donation.donated_at.desc()).all()):
            payments.setdefault(d.sponsorship_id, []).append(
                {"donation_id": d.id, "amount_cents": cents(d.amount), "paid_at": _iso(d.donated_at)})
    events = (
        db.query(SponsorshipCaseEvent).filter(SponsorshipCaseEvent.case_id == case.id)
        .order_by(SponsorshipCaseEvent.created_at.desc(), SponsorshipCaseEvent.id.desc()).all()
    )
    disbursements = (
        db.query(SponsorshipDisbursement).filter(SponsorshipDisbursement.case_id == case.id)
        .order_by(SponsorshipDisbursement.disbursed_at.desc()).all()
    )
    updates = (
        db.query(SponsorshipCaseUpdate).filter(SponsorshipCaseUpdate.case_id == case.id)
        .order_by(SponsorshipCaseUpdate.created_at.desc()).all()
    )
    users = {u.id: u.email for u in db.query(User).filter(User.id.in_(
        {e.actor_user_id for e in events if e.actor_user_id} | ({case.assigned_to} if case.assigned_to else set())
    )).all()} if events or case.assigned_to else {}

    related = []
    if case.kind == ORPHAN and details is not None and details.family_case_id:
        fam = db.query(SponsorshipCase).get(details.family_case_id)
        if fam:
            related.append({"id": fam.id, "reference": fam.reference, "kind": FAMILY, "status": fam.status,
                            "relation": "family"})
    if case.kind == ORPHAN and details is not None and details.family_case_id:
        for c, _ in (db.query(SponsorshipCase, SponsorshipOrphanDetails)
                     .join(SponsorshipOrphanDetails, SponsorshipOrphanDetails.case_id == SponsorshipCase.id)
                     .filter(SponsorshipOrphanDetails.family_case_id == details.family_case_id,
                             SponsorshipCase.id != case.id).all()):
            related.append({"id": c.id, "reference": c.reference, "kind": ORPHAN, "status": c.status,
                            "relation": "sibling"})
    if case.kind == FAMILY:
        for c, _ in (db.query(SponsorshipCase, SponsorshipOrphanDetails)
                     .join(SponsorshipOrphanDetails, SponsorshipOrphanDetails.case_id == SponsorshipCase.id)
                     .filter(SponsorshipOrphanDetails.family_case_id == case.id).all()):
            related.append({"id": c.id, "reference": c.reference, "kind": ORPHAN, "status": c.status,
                            "relation": "orphan"})

    return {
        **staff_case_summary(case, details, cov, fin,
                             docs_pending=sum(1 for d in docs if d.review_status == "pending"),
                             missing=missing_required_docs(case, docs)),
        "submitter_name": case.submitter_name,
        "submitter_phone": case.submitter_phone,
        "organization_registration": case.organization_registration,
        "organization_contact_role": case.organization_contact_role,
        "preferred_language": case.preferred_language,
        "dossier": _dossier(case),
        "details": _details_dict(case, details),
        "members": [{f: getattr(m, f) for f in MEMBER_FIELDS} for m in members_of(db, case)] if case.kind == FAMILY else [],
        "profile": {f: getattr(case, f) for f in PROFILE_FIELDS},
        "photo_url": photo_url_for(case) if case.public_photo_key else None,
        "consent": {
            "verification": case.consent_verification,
            "publication": case.consent_publication,
            "text": case.consent_text,
            "at": _iso(case.consent_at),
        },
        "duplicate_flags": case.duplicate_flags or [],
        "duplicates_reviewed_at": _iso(case.duplicates_reviewed_at),
        "close_reason": case.close_reason,
        "approved_at": _iso(case.approved_at),
        "closed_at": _iso(case.closed_at),
        "assigned_to_email": users.get(case.assigned_to) if case.assigned_to else None,
        "documents": [document_view(d, staff=True) for d in docs],
        "required_documents": list(REQUIRED_DOCS[case.kind]),
        "approval_blockers": approval_blockers(db, case, None) if case.status in (SUBMITTED, UNDER_REVIEW) else [],
        "publish_blockers": publish_blockers(db, case) if case.status in (APPROVED, PAUSED) else [],
        "allowed_actions": [a for a, (frm, _) in TRANSITIONS.items() if case.status in frm],
        "sponsorships": [{
            "id": s.id,
            "sponsor_name": s.sponsor_name,
            "sponsor_email": s.sponsor_email,
            "monthly_amount_cents": s.monthly_amount_cents,
            "status": s.status,
            "started_at": _iso(s.started_at),
            "last_payment_at": _iso(s.last_payment_at),
            "ended_at": _iso(s.ended_at),
            "end_reason": s.end_reason,
            "end_note": s.end_note,
            "ended_by": s.ended_by,
            "created_at": _iso(s.created_at),
            "payments": payments.get(s.id, []),
        } for s in sponsorships if s.status != SP_ABANDONED],
        "disbursements": [{**disbursement_view(d), "internal_note": d.internal_note,
                           "receipt_document_id": d.receipt_document_id} for d in disbursements],
        "updates": [update_view(u) for u in updates],
        "history": [{**event_view(e, staff=True),
                     "actor_email": users.get(e.actor_user_id) if e.actor_user_id else None} for e in events],
        "related": related,
    }


def sponsor_view(db: Session, sp: Sponsorship, *, photo_url_for) -> dict:
    """A sponsor's view of one sponsorship: the public profile, their own
    payments, and what was done with the money — never private data."""
    case = db.query(SponsorshipCase).get(sp.case_id)
    details = details_of(db, case)
    cov = coverage_map(db, [case])[case.id]
    fin = finances_map(db, [case.id])[case.id]
    payments = (
        db.query(Donation).filter(Donation.sponsorship_id == sp.id)
        .order_by(Donation.donated_at.desc()).all()
    )
    disbursements = (
        db.query(SponsorshipDisbursement).filter(SponsorshipDisbursement.case_id == case.id)
        .order_by(SponsorshipDisbursement.disbursed_at.desc()).all()
    )
    updates = (
        db.query(SponsorshipCaseUpdate).filter(SponsorshipCaseUpdate.case_id == case.id)
        .order_by(SponsorshipCaseUpdate.created_at.desc()).all()
    )
    return {
        "id": sp.id,
        "status": sp.status,
        "monthly_amount_cents": sp.monthly_amount_cents,
        "started_at": _iso(sp.started_at),
        "ended_at": _iso(sp.ended_at),
        "end_reason": sp.end_reason,
        "total_given_cents": sum(cents(p.amount) for p in payments),
        "payments": [{"donation_id": p.id, "amount_cents": cents(p.amount), "paid_at": _iso(p.donated_at)}
                     for p in payments],
        "case": {
            **public_card(case, details, cov, photo_url=photo_url_for(case) if case.public_photo_key else None),
            "story": case.public_story,
            "story_ar": case.public_story_ar,
            "case_status": case.status,
        },
        "finances": fin,
        "disbursements": [disbursement_view(d) for d in disbursements],
        "updates": [update_view(u) for u in updates],
    }


# ─────────────────────────────────────────────────────────────────────
# The admin overview
# ─────────────────────────────────────────────────────────────────────

def overview(db: Session, today: Optional[date] = None) -> dict:
    today = today or date.today()
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    cases = db.query(SponsorshipCase).all()
    by_kind_status: dict[str, dict[str, int]] = {k: {s: 0 for s in STATUSES} for k in KINDS}
    for c in cases:
        by_kind_status[c.kind][c.status] += 1

    published = [c for c in cases if c.status == PUBLISHED]
    cov = coverage_map(db, published)
    funding = {"full": 0, "partial": 0, "unfunded": 0}
    need_total = committed_total = 0
    overfunded = []
    for c in published:
        cv = cov[c.id]
        funding[cv["state"]] += 1
        need_total += cv["monthly_need_cents"]
        committed_total += min(cv["committed_cents"], cv["monthly_need_cents"])
        if cv["overfunded"]:
            overfunded.append({"id": c.id, "reference": c.reference,
                               "excess_cents": cv["committed_cents"] - cv["monthly_need_cents"]})

    sps = db.query(Sponsorship).all()
    active = [s for s in sps if s.status in COMMITTED_STATUSES]
    started_this_month = [s for s in sps if s.started_at and s.started_at >= month_start]
    ended_this_month = [s for s in sps if s.ended_at and s.ended_at >= month_start
                        and s.status in (SP_CANCELED, SP_ENDED)]
    end_reasons: dict[str, int] = {}
    for s in sps:
        if s.status in (SP_CANCELED, SP_ENDED) and s.end_reason:
            end_reasons[s.end_reason] = end_reasons.get(s.end_reason, 0) + 1

    collected_month = cents(
        db.query(func.coalesce(func.sum(Donation.amount), 0.0))
        .filter(Donation.sponsorship_id.isnot(None), Donation.donated_at >= month_start).scalar())
    collected_total = cents(
        db.query(func.coalesce(func.sum(Donation.amount), 0.0))
        .filter(Donation.sponsorship_id.isnot(None)).scalar())
    disbursed_month = int(
        db.query(func.coalesce(func.sum(SponsorshipDisbursement.amount_cents), 0))
        .filter(SponsorshipDisbursement.disbursed_at >= month_start.date()).scalar() or 0)
    disbursed_total = int(
        db.query(func.coalesce(func.sum(SponsorshipDisbursement.amount_cents), 0)).scalar() or 0)

    # Average days from submission to approval, and from publication to the
    # first sponsor, over cases where both ends exist.
    review_days = [(c.approved_at - c.submitted_at).days for c in cases if c.approved_at]
    first_sponsor: dict[int, datetime] = {}
    for s in sps:
        if s.started_at and (s.case_id not in first_sponsor or s.started_at < first_sponsor[s.case_id]):
            first_sponsor[s.case_id] = s.started_at
    wait_days = [(first_sponsor[c.id] - c.published_at).days for c in cases
                 if c.published_at and c.id in first_sponsor and first_sponsor[c.id] >= c.published_at]

    # ── Alerts ──
    pending_docs = (
        db.query(SponsorshipCaseDocument.case_id, func.count(SponsorshipCaseDocument.id))
        .filter(SponsorshipCaseDocument.review_status == "pending")
        .group_by(SponsorshipCaseDocument.case_id).all()
    )
    ref = {c.id: c for c in cases}
    open_ids = {c.id for c in cases if c.status not in (CLOSED, REJECTED)}
    aging = []
    for c, d in (db.query(SponsorshipCase, SponsorshipOrphanDetails)
                 .join(SponsorshipOrphanDetails, SponsorshipOrphanDetails.case_id == SponsorshipCase.id)
                 .filter(SponsorshipCase.status.in_((APPROVED, PUBLISHED, PAUSED))).all()):
        b18 = eighteenth_birthday(d.birth_date)
        if b18 <= today + timedelta(days=AGING_OUT_WARNING_DAYS):
            aging.append({"id": c.id, "reference": c.reference, "ages_out_on": b18.isoformat()})
    sponsored_ids = {s.case_id for s in active}
    last_update = dict(
        db.query(SponsorshipCaseUpdate.case_id, func.max(SponsorshipCaseUpdate.created_at))
        .group_by(SponsorshipCaseUpdate.case_id).all())
    stale = []
    for cid in sponsored_ids:
        c = ref.get(cid)
        if not c:
            continue
        since = last_update.get(cid) or min((s.started_at for s in active if s.case_id == cid and s.started_at),
                                            default=None)
        if since and since < now - timedelta(days=STALE_UPDATE_DAYS):
            stale.append({"id": cid, "reference": c.reference, "since": since.isoformat()})
    fin = finances_map(db, list(sponsored_ids))
    last_disb = dict(
        db.query(SponsorshipDisbursement.case_id, func.max(SponsorshipDisbursement.disbursed_at))
        .group_by(SponsorshipDisbursement.case_id).all())
    idle = []
    for cid, f in fin.items():
        if f["balance_cents"] > 0:
            last = last_disb.get(cid)
            if last is None or last < today - timedelta(days=IDLE_FUNDS_DAYS):
                idle.append({"id": cid, "reference": ref[cid].reference, "balance_cents": f["balance_cents"]})

    return {
        "pipeline": by_kind_status,
        "unread": sum(1 for c in cases if c.status not in (CLOSED, REJECTED) and is_unread(c)),
        "funding": funding,
        "monthly_need_cents": need_total,
        "monthly_committed_cents": committed_total,
        "coverage_percent": round(committed_total * 100 / need_total) if need_total else 0,
        "sponsorships": {
            "active": len([s for s in active if s.status == SP_ACTIVE]),
            "past_due": len([s for s in active if s.status == SP_PAST_DUE]),
            "sponsors": len({s.sponsor_email.lower() for s in active}),
            "started_this_month": len(started_this_month),
            "ended_this_month": len(ended_this_month),
            "end_reasons": end_reasons,
            "monthly_recurring_cents": sum(s.monthly_amount_cents for s in active),
        },
        "money": {
            "collected_this_month_cents": collected_month,
            "disbursed_this_month_cents": disbursed_month,
            "collected_total_cents": collected_total,
            "disbursed_total_cents": disbursed_total,
            "undistributed_cents": collected_total - disbursed_total,
        },
        "timing": {
            "avg_review_days": round(sum(review_days) / len(review_days), 1) if review_days else None,
            "avg_wait_for_sponsor_days": round(sum(wait_days) / len(wait_days), 1) if wait_days else None,
        },
        "alerts": {
            "documents_pending": [{"id": cid, "reference": ref[cid].reference, "count": n}
                                  for cid, n in pending_docs if cid in open_ids],
            "duplicates": [{"id": c.id, "reference": c.reference, "flags": len(c.duplicate_flags or [])}
                           for c in cases if c.duplicate_flags and not c.duplicates_reviewed_at
                           and c.status not in (CLOSED, REJECTED)],
            "overfunded": overfunded,
            "aging_out": aging,
            "no_recent_update": stale,
            "idle_funds": idle,
            "past_due": [{"id": s.id, "case_id": s.case_id,
                          "reference": ref[s.case_id].reference if s.case_id in ref else None}
                         for s in active if s.status == SP_PAST_DUE],
        },
    }
