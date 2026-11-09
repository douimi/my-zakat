"""Request bodies for the sponsorship routers.

The application schemas are used twice — for a first submission and for the
applicant's resubmission after an information request — so a resubmission can
never be less complete than the original.
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

import sponsorship_service as svc

NeedCategory = Literal["food", "rent", "utilities", "education", "health", "clothing", "transport", "other"]
SituationCategory = Literal["loss_of_breadwinner", "illness_disability", "unemployment", "displacement",
                            "divorce_abandonment", "low_income", "other"]
Gender = Literal["male", "female"]

_THIS_YEAR = date.today().year


def _blank_to_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class NeedItem(BaseModel):
    category: NeedCategory
    monthly_cents: int = Field(gt=0, le=svc.MAX_MONTHLY_CENTS)
    note: Optional[str] = Field(default=None, max_length=300)


class HouseholdMember(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    relationship: Literal["spouse", "child", "parent", "sibling", "grandchild", "grandparent", "other"]
    gender: Optional[Gender] = None
    birth_year: Optional[int] = Field(default=None, ge=1900, le=_THIS_YEAR)
    occupation_or_school: Optional[str] = Field(default=None, max_length=200)
    health_note: Optional[str] = Field(default=None, max_length=1000)
    is_orphan: bool = False


class ApplicationBase(BaseModel):
    lang: Literal["en", "ar"] = "en"
    submitter_type: Literal["self", "organization"] = "self"
    submitter_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    submitter_phone: Optional[str] = Field(default=None, max_length=50)
    organization_name: Optional[str] = Field(default=None, max_length=200)
    organization_registration: Optional[str] = Field(default=None, max_length=100)
    organization_contact_role: Optional[str] = Field(default=None, max_length=100)

    country: str = Field(min_length=2, max_length=100)
    region: Optional[str] = Field(default=None, max_length=150)
    city: str = Field(min_length=1, max_length=150)
    address: Optional[str] = Field(default=None, max_length=500)

    situation_category: Optional[SituationCategory] = None
    situation_description: str = Field(min_length=20, max_length=5000)
    monthly_income_cents: int = Field(default=0, ge=0, le=100_000_000)
    income_sources: Optional[str] = Field(default=None, max_length=2000)
    other_aid: Optional[str] = Field(default=None, max_length=2000)
    urgent_needs: Optional[str] = Field(default=None, max_length=2000)

    needs: list[NeedItem] = Field(min_length=1, max_length=10)

    consent_verification: bool
    consent_publication: bool = False
    consent_text: Optional[str] = Field(default=None, max_length=4000)
    # Only read on a resubmission: a note to the reviewer.
    message: Optional[str] = Field(default=None, max_length=2000)

    _strip = field_validator(
        "submitter_phone", "organization_name", "organization_registration", "organization_contact_role",
        "region", "address", "income_sources", "other_aid", "urgent_needs", mode="before",
    )(_blank_to_none)

    @model_validator(mode="after")
    def _organization_named(self):
        if self.submitter_type == "organization" and not self.organization_name:
            raise ValueError("organization_name is required when an association files the request")
        if not self.consent_verification:
            raise ValueError("consent_verification must be given")
        return self


class FamilyApplication(ApplicationBase):
    head_full_name: str = Field(min_length=2, max_length=200)
    head_national_id: Optional[str] = Field(default=None, max_length=50)
    head_birth_year: Optional[int] = Field(default=None, ge=1900, le=_THIS_YEAR)
    head_gender: Optional[Gender] = None
    head_marital_status: Optional[Literal["married", "widowed", "divorced", "single", "separated"]] = None
    head_occupation: Optional[str] = Field(default=None, max_length=150)
    household_size: int = Field(ge=1, le=30)
    housing_status: Optional[Literal["owned", "rented", "hosted", "shelter_camp", "other"]] = None
    monthly_rent_cents: int = Field(default=0, ge=0, le=100_000_000)
    health_notes: Optional[str] = Field(default=None, max_length=2000)
    members: list[HouseholdMember] = Field(default_factory=list, max_length=30)

    _strip_family = field_validator("head_national_id", "head_occupation", "health_notes", mode="before")(_blank_to_none)


class OrphanApplication(ApplicationBase):
    full_name: str = Field(min_length=2, max_length=200)
    gender: Gender
    birth_date: date
    orphan_type: Literal["father", "mother", "both"]
    father_name: Optional[str] = Field(default=None, max_length=200)
    father_death_date: Optional[date] = None
    father_death_cause: Optional[str] = Field(default=None, max_length=1000)
    mother_name: Optional[str] = Field(default=None, max_length=200)
    mother_alive: Optional[bool] = None
    mother_death_date: Optional[date] = None
    guardian_name: str = Field(min_length=2, max_length=200)
    guardian_relationship: str = Field(min_length=2, max_length=50)
    guardian_national_id: Optional[str] = Field(default=None, max_length=50)
    guardian_phone: Optional[str] = Field(default=None, max_length=50)
    lives_with: Optional[Literal["mother", "relatives", "guardian", "orphanage", "other"]] = None
    school_level: Optional[str] = Field(default=None, max_length=100)
    school_name: Optional[str] = Field(default=None, max_length=200)
    health_status: Optional[str] = Field(default=None, max_length=2000)
    interests: Optional[str] = Field(default=None, max_length=1000)
    siblings_count: int = Field(default=0, ge=0, le=30)
    family_reference: Optional[str] = Field(default=None, max_length=12)

    _strip_orphan = field_validator(
        "father_name", "father_death_cause", "mother_name", "guardian_national_id", "guardian_phone",
        "school_level", "school_name", "health_status", "interests", "family_reference", mode="before",
    )(_blank_to_none)

    @model_validator(mode="after")
    def _dates_make_sense(self):
        today = date.today()
        if self.birth_date > today:
            raise ValueError("birth_date cannot be in the future")
        for name in ("father_death_date", "mother_death_date"):
            value = getattr(self, name)
            if value and value > today:
                raise ValueError("%s cannot be in the future" % name)
        if self.orphan_type in ("mother", "both") and self.mother_alive:
            raise ValueError("mother_alive contradicts orphan_type")
        return self


class CheckoutRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    monthly_amount_cents: int = Field(gt=0, le=svc.MAX_MONTHLY_CENTS)
    lang: Literal["en", "ar"] = "en"


class CodeRequest(BaseModel):
    email: EmailStr
    audience: Literal["applicant", "sponsor"]
    lang: Literal["en", "ar"] = "en"


class CodeVerification(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class SponsorCancel(BaseModel):
    reason: Optional[Literal["financial", "changed_mind", "other_sponsorship", "other"]] = None
    note: Optional[str] = Field(default=None, max_length=2000)


# ── Staff ─────────────────────────────────────────────────────────────

class TransitionRequest(BaseModel):
    action: Literal["start_review", "request_info", "approve", "reject", "publish", "pause", "close", "reopen"]
    message: Optional[str] = Field(default=None, max_length=5000)
    note: Optional[str] = Field(default=None, max_length=5000)
    approved_monthly_cents: Optional[int] = Field(default=None, gt=0, le=svc.MAX_MONTHLY_CENTS)
    close_reason: Optional[Literal["aged_out", "self_sufficient", "moved", "duplicate", "deceased",
                                   "withdrawn", "other"]] = None
    end_sponsorships: bool = False


class StaffCaseEdit(BaseModel):
    """Any subset of the dossier, plus the curated profile. Unset = unchanged."""
    note: Optional[str] = Field(default=None, max_length=2000)
    assigned_to: Optional[int] = None
    # Profile
    public_name: Optional[str] = Field(default=None, max_length=100)
    public_title: Optional[str] = Field(default=None, max_length=200)
    public_title_ar: Optional[str] = Field(default=None, max_length=200)
    public_story: Optional[str] = Field(default=None, max_length=5000)
    public_story_ar: Optional[str] = Field(default=None, max_length=5000)
    approved_monthly_cents: Optional[int] = Field(default=None, gt=0, le=svc.MAX_MONTHLY_CENTS)
    consent_publication: Optional[bool] = None
    # Dossier
    submitter_name: Optional[str] = Field(default=None, max_length=200)
    submitter_phone: Optional[str] = Field(default=None, max_length=50)
    organization_name: Optional[str] = Field(default=None, max_length=200)
    country: Optional[str] = Field(default=None, max_length=100)
    region: Optional[str] = Field(default=None, max_length=150)
    city: Optional[str] = Field(default=None, max_length=150)
    address: Optional[str] = Field(default=None, max_length=500)
    situation_category: Optional[SituationCategory] = None
    situation_description: Optional[str] = Field(default=None, max_length=5000)
    monthly_income_cents: Optional[int] = Field(default=None, ge=0)
    income_sources: Optional[str] = Field(default=None, max_length=2000)
    other_aid: Optional[str] = Field(default=None, max_length=2000)
    urgent_needs: Optional[str] = Field(default=None, max_length=2000)
    needs: Optional[list[NeedItem]] = None
    # Family
    head_full_name: Optional[str] = Field(default=None, max_length=200)
    head_national_id: Optional[str] = Field(default=None, max_length=50)
    household_size: Optional[int] = Field(default=None, ge=1, le=30)
    housing_status: Optional[Literal["owned", "rented", "hosted", "shelter_camp", "other"]] = None
    monthly_rent_cents: Optional[int] = Field(default=None, ge=0)
    health_notes: Optional[str] = Field(default=None, max_length=2000)
    members: Optional[list[HouseholdMember]] = None
    # Orphan
    full_name: Optional[str] = Field(default=None, max_length=200)
    birth_date: Optional[date] = None
    school_level: Optional[str] = Field(default=None, max_length=100)
    school_name: Optional[str] = Field(default=None, max_length=200)
    health_status: Optional[str] = Field(default=None, max_length=2000)
    guardian_name: Optional[str] = Field(default=None, max_length=200)
    guardian_phone: Optional[str] = Field(default=None, max_length=50)


class DocumentReview(BaseModel):
    status: Literal["verified", "rejected", "pending"]
    note: Optional[str] = Field(default=None, max_length=2000)


class LinkRequest(BaseModel):
    family_reference: Optional[str] = Field(default=None, max_length=12)


class NoteRequest(BaseModel):
    note: str = Field(min_length=1, max_length=5000)


class DisbursementRequest(BaseModel):
    amount_cents: int = Field(gt=0, le=100_000_000)
    category: NeedCategory
    period: Optional[str] = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    description: str = Field(min_length=3, max_length=2000)
    description_ar: Optional[str] = Field(default=None, max_length=2000)
    internal_note: Optional[str] = Field(default=None, max_length=2000)
    disbursed_at: Optional[date] = None
    receipt_document_id: Optional[int] = None


class UpdateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    title_ar: Optional[str] = Field(default=None, max_length=200)
    body: str = Field(min_length=2, max_length=5000)
    body_ar: Optional[str] = Field(default=None, max_length=5000)
    notify_sponsors: bool = True


class StaffSponsorshipEnd(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=40)
    note: Optional[str] = Field(default=None, max_length=2000)
