"""Sponsoring a family or an orphan: the rules that must never regress.

Design: docs/superpowers/specs/2026-11-09-sponsorship-and-arabic-design.md
"""
import itertools
import json
from datetime import date, timedelta

import pytest

import sponsorship_service as svc
from auth_utils import create_portal_token, create_sponsorship_portal_token, verify_token
from models import (
    Donation, Sponsorship, SponsorshipCase, SponsorshipCaseDocument, SponsorshipCaseEvent,
    SponsorshipOrphanDetails,
)

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


# ─────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fake_s3(monkeypatch):
    import s3_service
    store = {}
    monkeypatch.setattr(s3_service, "upload_file",
                        lambda content, key, **kw: store.__setitem__(key, content) or key)
    monkeypatch.setattr(s3_service, "download_file", lambda key: store.get(key))
    return store


@pytest.fixture(autouse=True)
def sent(monkeypatch):
    """Capture every sponsorship email instead of queueing it."""
    import sponsorship_emails
    box = []
    monkeypatch.setattr(sponsorship_emails, "_enqueue",
                        lambda slug, **kw: box.append(kw) or True)
    return box


@pytest.fixture
def stripe_sessions(monkeypatch):
    """Distinct checkout ids (the shared mock reuses one, which the unique
    constraint on stripe_checkout_session_id would rightly refuse)."""
    import stripe
    counter = itertools.count(1)
    created = []

    class Session:
        def __init__(self, n):
            self.id = "cs_test_%d" % n
            self.url = "https://checkout.stripe.test/%d" % n

    def create(**kwargs):
        created.append(kwargs)
        return Session(next(counter))

    monkeypatch.setattr(stripe, "api_key", "sk_test_fake")
    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(create))
    return created


@pytest.fixture
def stripe_cancels(monkeypatch):
    import stripe
    cancelled = []
    monkeypatch.setattr(stripe.Subscription, "cancel", staticmethod(lambda sid, **kw: cancelled.append(sid)))
    return cancelled


def portal(email):
    return {"Authorization": "Bearer %s" % create_sponsorship_portal_token(email)}


def family_payload(**over):
    body = {
        "lang": "en",
        "submitter_type": "self",
        "submitter_name": "Fatima Benali",
        "email": "fatima@example.com",
        "submitter_phone": "+212600000000",
        "country": "Morocco",
        "region": "Souss-Massa",
        "city": "Agadir",
        "address": "12 Rue Secrète, Quartier Talborjt",
        "situation_category": "loss_of_breadwinner",
        "situation_description": "My husband passed away last year and I raise our four children alone.",
        "monthly_income_cents": 15000,
        "needs": [{"category": "food", "monthly_cents": 12000}, {"category": "rent", "monthly_cents": 8000}],
        "consent_verification": True,
        "consent_publication": True,
        "head_full_name": "Fatima Benali",
        "head_national_id": "JB-445566",
        "head_birth_year": 1985,
        "household_size": 5,
        "housing_status": "rented",
        "monthly_rent_cents": 8000,
        "members": [
            {"first_name": "Yassine", "relationship": "child", "gender": "male", "birth_year": 2014, "is_orphan": True},
            {"first_name": "Salma", "relationship": "child", "gender": "female", "birth_year": 2016, "is_orphan": True},
        ],
    }
    body.update(over)
    return body


def orphan_payload(**over):
    body = {
        "lang": "ar",
        "submitter_type": "organization",
        "submitter_name": "Karim Haddad",
        "email": "assoc@example.org",
        "organization_name": "Jamiyat Al-Amal",
        "country": "Morocco",
        "city": "Agadir",
        "situation_description": "The child lost his father in an accident and lives with his mother.",
        "needs": [{"category": "education", "monthly_cents": 3000}, {"category": "clothing", "monthly_cents": 2000}],
        "consent_verification": True,
        "consent_publication": True,
        "full_name": "أحمد بن علي",
        "gender": "male",
        "birth_date": (date.today() - timedelta(days=365 * 9)).isoformat(),
        "orphan_type": "father",
        "father_name": "Ali",
        "father_death_date": "2023-04-02",
        "guardian_name": "Khadija",
        "guardian_relationship": "mother",
        "guardian_phone": "+212611111111",
        "school_level": "Grade 4",
    }
    body.update(over)
    return body


def apply(client, kind, payload, docs=()):
    files = [("files", (name, content, ctype)) for name, content, ctype, _ in docs]
    data = {"payload": json.dumps(payload), "doc_types": [t for *_, t in docs]}
    return client.post("/api/sponsorship/apply/%s" % kind, data=data, files=files or None)


def admin(client, headers, method, path, **kw):
    return getattr(client, method)("/api/sponsorship/admin%s" % path, headers=headers, **kw)


def published_family(client, auth_headers, db_session, **over):
    """A family case taken all the way to published, through the API."""
    r = apply(client, "family", family_payload(**over),
              docs=[("id.pdf", PDF, "application/pdf", "id_document")])
    assert r.status_code == 201, r.text
    case = db_session.query(SponsorshipCase).filter_by(reference=r.json()["reference"]).one()
    doc = db_session.query(SponsorshipCaseDocument).filter_by(case_id=case.id).one()
    assert admin(client, auth_headers, "post", "/cases/%d/documents/%d/review" % (case.id, doc.id),
                 json={"status": "verified"}).status_code == 200
    assert admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                 json={"action": "approve", "approved_monthly_cents": 10000}).status_code == 200
    assert admin(client, auth_headers, "patch", "/cases/%d" % case.id, json={
        "public_name": "Family of Fatima", "public_title": "A mother raising four children in Agadir",
        "public_story": "A widowed mother keeps her children in school against the odds.",
    }).status_code == 200
    r = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id, json={"action": "publish"})
    assert r.status_code == 200, r.text
    db_session.expire_all()
    return db_session.query(SponsorshipCase).get(case.id)


# ─────────────────────────────────────────────────────────────────────
# Filing a request
# ─────────────────────────────────────────────────────────────────────

def test_a_family_request_is_filed_with_its_documents(client, db_session, sent):
    r = apply(client, "family", family_payload(), docs=[("id.pdf", PDF, "application/pdf", "id_document")])

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reference"].startswith("F-") and len(body["reference"]) == 8
    assert body["documents_stored"] == 1
    assert body["missing_documents"] == []
    case = db_session.query(SponsorshipCase).filter_by(reference=body["reference"]).one()
    assert case.status == "submitted"
    assert case.requested_monthly_cents == 20000
    assert [e.type for e in db_session.query(SponsorshipCaseEvent).filter_by(case_id=case.id)] \
        == ["submitted", "document_uploaded"]
    # The applicant is acknowledged and the team is told.
    assert {m["to_email"] for m in sent} == {"fatima@example.com", svc_admin_email()}


def svc_admin_email():
    from email_service import ADMIN_NOTIFICATION_EMAIL
    return ADMIN_NOTIFICATION_EMAIL


def test_a_request_without_its_required_documents_is_accepted_and_says_what_is_missing(client):
    r = apply(client, "orphan", orphan_payload())
    assert r.status_code == 201, r.text
    assert r.json()["reference"].startswith("O-")
    assert set(r.json()["missing_documents"]) == {"birth_certificate", "death_certificate"}


def test_an_arabic_applicant_is_written_to_in_arabic(client, sent):
    apply(client, "orphan", orphan_payload(lang="ar"))
    to_applicant = [m for m in sent if m["to_email"] == "assoc@example.org"][0]
    assert to_applicant["context"]["dir"] == "rtl"
    assert "/ar/my-requests" in to_applicant["context"]["cta_url"]


def test_orphan_sponsorship_is_for_children_under_eighteen(client):
    r = apply(client, "orphan", orphan_payload(birth_date=(date.today() - timedelta(days=365 * 19)).isoformat()))
    assert r.status_code == 400
    assert "under 18" in r.json()["detail"]


def test_validation_errors_come_back_per_field(client):
    r = apply(client, "family", family_payload(household_size=0, needs=[]))
    assert r.status_code == 422
    fields = {tuple(e["loc"]) for e in r.json()["detail"]}
    assert ("household_size",) in fields and ("needs",) in fields


def test_an_association_must_name_itself(client):
    r = apply(client, "family", family_payload(submitter_type="organization", organization_name=""))
    assert r.status_code == 422


def test_a_video_is_not_a_document(client):
    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    r = apply(client, "family", family_payload(), docs=[("clip.mp4", mp4, "video/mp4", "id_document")])
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────────────
# Review, publication, privacy
# ─────────────────────────────────────────────────────────────────────

def test_nothing_is_public_before_publication(client, db_session):
    ref = apply(client, "family", family_payload()).json()["reference"]
    assert client.get("/api/sponsorship/cases/%s" % ref).status_code == 404
    assert client.get("/api/sponsorship/cases").json()["items"] == []


def test_approval_waits_for_the_required_documents_to_be_verified(client, auth_headers, db_session):
    ref = apply(client, "family", family_payload(), docs=[("id.pdf", PDF, "application/pdf", "id_document")]).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=ref).one()

    r = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id, json={"action": "approve"})

    assert r.status_code == 409
    assert "document_not_verified:id_document" in r.json()["detail"]["blockers"]


def test_publication_needs_a_profile_and_consent(client, auth_headers, db_session):
    r = apply(client, "family", family_payload(consent_publication=False),
              docs=[("id.pdf", PDF, "application/pdf", "id_document")])
    case = db_session.query(SponsorshipCase).filter_by(reference=r.json()["reference"]).one()
    doc = db_session.query(SponsorshipCaseDocument).filter_by(case_id=case.id).one()
    admin(client, auth_headers, "post", "/cases/%d/documents/%d/review" % (case.id, doc.id), json={"status": "verified"})
    assert admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                 json={"action": "approve"}).status_code == 200

    r = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id, json={"action": "publish"})

    assert r.status_code == 409
    assert {"no_public_name", "no_public_title", "no_public_story", "no_publication_consent"} \
        <= set(r.json()["detail"]["blockers"])


def test_the_public_profile_carries_no_private_data(client, auth_headers, db_session):
    case = published_family(client, auth_headers, db_session)

    listing = client.get("/api/sponsorship/cases?kind=family")
    detail = client.get("/api/sponsorship/cases/%s" % case.reference)

    assert listing.status_code == 200 and detail.status_code == 200
    assert listing.json()["total"] == 1
    text = listing.text + detail.text
    for secret in ("Benali", "JB-445566", "fatima@example.com", "Rue Secrète", "+212600000000", "Yassine"):
        assert secret not in text, secret
    body = detail.json()
    assert body["display_name"] == "Family of Fatima"
    assert body["verified_documents"] == ["id_document"]
    assert body["coverage"]["remaining_cents"] == 10000


def test_a_refused_document_is_explained_to_the_applicant(client, auth_headers, db_session, sent):
    r = apply(client, "family", family_payload(), docs=[("id.pdf", PDF, "application/pdf", "id_document")])
    case = db_session.query(SponsorshipCase).filter_by(reference=r.json()["reference"]).one()
    doc = db_session.query(SponsorshipCaseDocument).filter_by(case_id=case.id).one()

    no_reason = admin(client, auth_headers, "post", "/cases/%d/documents/%d/review" % (case.id, doc.id),
                      json={"status": "rejected"})
    refused = admin(client, auth_headers, "post", "/cases/%d/documents/%d/review" % (case.id, doc.id),
                    json={"status": "rejected", "note": "The scan is unreadable."})

    assert no_reason.status_code == 400
    assert refused.status_code == 200
    assert any(m.get("context", {}).get("quote") == "The scan is unreadable." for m in sent)
    mine = client.get("/api/sponsorship/portal/requests", headers=portal("fatima@example.com")).json()["items"][0]
    assert mine["missing_documents"] == ["id_document"]


# ─────────────────────────────────────────────────────────────────────
# The applicant's space
# ─────────────────────────────────────────────────────────────────────

def test_an_information_request_can_be_answered_from_the_portal(client, auth_headers, db_session):
    ref = apply(client, "family", family_payload()).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=ref).one()
    assert admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                 json={"action": "request_info"}).status_code == 409   # a message is required
    assert admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                 json={"action": "request_info", "message": "Please confirm the household size."}).status_code == 200
    admin(client, auth_headers, "get", "/cases/%d" % case.id)   # staff read it

    mine = client.get("/api/sponsorship/portal/requests", headers=portal("fatima@example.com")).json()["items"][0]
    assert mine["editable"] is True
    assert mine["last_message"] == "Please confirm the household size."

    r = client.put("/api/sponsorship/portal/requests/%d" % case.id, headers=portal("fatima@example.com"),
                   json=family_payload(household_size=6, message="We are six now."))

    assert r.status_code == 200, r.text
    db_session.expire_all()
    case = db_session.query(SponsorshipCase).get(case.id)
    assert case.status == "under_review"
    assert svc.is_unread(case)
    last = db_session.query(SponsorshipCaseEvent).filter_by(case_id=case.id, type="resubmitted").one()
    assert last.changes["household_size"] == [5, 6]


def test_a_request_cannot_be_edited_unless_information_was_asked_for(client, db_session):
    ref = apply(client, "family", family_payload()).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=ref).one()
    r = client.put("/api/sponsorship/portal/requests/%d" % case.id, headers=portal("fatima@example.com"),
                   json=family_payload(household_size=6))
    assert r.status_code == 409


def test_one_applicant_cannot_reach_another_applicants_request(client, db_session):
    ref = apply(client, "family", family_payload()).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=ref).one()

    other = client.get("/api/sponsorship/portal/requests/%d/documents/1" % case.id, headers=portal("x@example.com"))
    proposal_token = client.get("/api/sponsorship/portal/requests", headers={
        "Authorization": "Bearer %s" % create_portal_token("fatima@example.com")})

    assert other.status_code == 404
    assert proposal_token.status_code == 401


def test_a_sponsorship_portal_token_is_not_a_staff_session(admin_user):
    assert verify_token(create_sponsorship_portal_token(admin_user.email)) is None


def test_the_applicant_timeline_never_shows_staff_notes(client, auth_headers, db_session):
    ref = apply(client, "family", family_payload()).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=ref).one()
    admin(client, auth_headers, "post", "/cases/%d/notes" % case.id, json={"note": "Neighbour says rent is lower."})
    admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
          json={"action": "start_review", "note": "Call the landlord."})

    r = client.get("/api/sponsorship/portal/requests", headers=portal("fatima@example.com"))

    assert "landlord" not in r.text and "Neighbour" not in r.text
    assert [e["type"] for e in r.json()["items"][0]["timeline"]][:1] == ["start_review"]


# ─────────────────────────────────────────────────────────────────────
# Families and orphans: links and duplicates
# ─────────────────────────────────────────────────────────────────────

def test_an_orphan_is_linked_to_a_family_filed_from_the_same_address(client, db_session):
    fam = apply(client, "family", family_payload(email="assoc@example.org")).json()["reference"]
    orphan = apply(client, "orphan", orphan_payload(family_reference=fam)).json()["reference"]

    case = db_session.query(SponsorshipCase).filter_by(reference=orphan).one()
    details = db_session.query(SponsorshipOrphanDetails).get(case.id)
    family = db_session.query(SponsorshipCase).filter_by(reference=fam).one()
    assert details.family_case_id == family.id
    assert case.duplicate_flags == []


def test_a_stranger_cannot_attach_a_child_to_someone_elses_family(client, db_session):
    fam = apply(client, "family", family_payload()).json()["reference"]          # fatima@
    orphan = apply(client, "orphan", orphan_payload(family_reference=fam)).json()["reference"]  # assoc@

    case = db_session.query(SponsorshipCase).filter_by(reference=orphan).one()
    assert db_session.query(SponsorshipOrphanDetails).get(case.id).family_case_id is None
    assert case.duplicate_flags[0]["reason"] == "family_reference_unverified"


def test_the_same_child_filed_twice_is_flagged_and_must_be_cleared_before_approval(client, auth_headers, db_session):
    apply(client, "orphan", orphan_payload(full_name="أحمد بن علي"))
    second = apply(client, "orphan", orphan_payload(full_name="احمد بن عليّ", email="other@example.org"),
                   docs=[("b.pdf", PDF, "application/pdf", "birth_certificate"),
                         ("d.pdf", PDF, "application/pdf", "death_certificate")]).json()["reference"]
    case = db_session.query(SponsorshipCase).filter_by(reference=second).one()
    assert case.duplicate_flags and case.duplicate_flags[0]["reason"] == "same_child"
    for doc in db_session.query(SponsorshipCaseDocument).filter_by(case_id=case.id):
        admin(client, auth_headers, "post", "/cases/%d/documents/%d/review" % (case.id, doc.id), json={"status": "verified"})

    blocked = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id, json={"action": "approve"})
    admin(client, auth_headers, "post", "/cases/%d/duplicates/clear" % case.id, json={"note": "Different child."})
    allowed = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id, json={"action": "approve"})

    assert "duplicates_not_reviewed" in blocked.json()["detail"]["blockers"]
    assert allowed.status_code == 200


def test_names_are_compared_the_way_people_write_them():
    assert svc.normalize_name("أحمد بن عليّ") == svc.normalize_name("احمد بن علي")
    assert svc.normalize_name("  Zoé  O'Neil ") == svc.normalize_name("zoe o neil")
    assert svc.normalize_id("ab-12 34") == "AB1234"


# ─────────────────────────────────────────────────────────────────────
# Sponsoring
# ─────────────────────────────────────────────────────────────────────

def checkout(client, ref, amount, email="donor@example.com"):
    return client.post("/api/sponsorship/cases/%s/checkout" % ref,
                       json={"name": "A Donor", "email": email, "monthly_amount_cents": amount})


def test_a_need_cannot_be_offered_twice(client, auth_headers, db_session, stripe_sessions):
    case = published_family(client, auth_headers, db_session)   # needs $100/month

    first = checkout(client, case.reference, 6000)
    too_much = checkout(client, case.reference, 6000)
    too_small = checkout(client, case.reference, 500)
    rest = checkout(client, case.reference, 4000)
    nothing_left = checkout(client, case.reference, 1000)

    assert first.status_code == 200, first.text
    assert too_much.status_code == 409 and "$40" in too_much.json()["detail"]
    assert too_small.status_code == 409
    assert rest.status_code == 200
    assert nothing_left.status_code == 409
    sent_to_stripe = stripe_sessions[0]
    assert sent_to_stripe["mode"] == "subscription"
    assert sent_to_stripe["subscription_data"]["metadata"]["case_reference"] == case.reference
    assert sent_to_stripe["line_items"][0]["price_data"]["recurring"] == {"interval": "month"}


def test_an_abandoned_checkout_releases_its_hold(client, auth_headers, db_session, stripe_sessions):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()
    sp.checkout_expires_at = sp.checkout_expires_at - timedelta(hours=1)
    db_session.commit()
    assert checkout(client, case.reference, 10000).status_code == 200


def _hook(db_session, kind, obj, event_id="evt"):
    from routers.donations import _sponsorship_hook
    _sponsorship_hook(kind, db_session, obj, event_id)


def _invoice(sp, n=1, amount=10000):
    return {"id": "in_%d_%d" % (sp.id, n), "amount_paid": amount, "subscription": "sub_%d" % sp.id,
            "subscription_details": {"metadata": {"sponsorship_id": str(sp.id)}}}


def test_the_stripe_lifecycle_of_a_sponsorship(client, auth_headers, db_session, stripe_sessions, sent):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()

    _hook(db_session, "checkout_completed", {
        "id": sp.stripe_checkout_session_id, "subscription": "sub_%d" % sp.id, "customer": "cus_1",
        "metadata": {"type": "sponsorship", "sponsorship_id": str(sp.id)}})
    _hook(db_session, "invoice_paid", _invoice(sp, 1))
    _hook(db_session, "invoice_paid", _invoice(sp, 1))      # a Stripe retry
    db_session.expire_all()

    assert sp.status == "active"
    donations = db_session.query(Donation).filter_by(sponsorship_id=sp.id).all()
    assert len(donations) == 1 and donations[0].amount == 100.0
    assert svc.coverage_map(db_session, [case])[case.id]["state"] == "full"
    assert {m["to_email"] for m in sent} >= {"donor@example.com", "fatima@example.com"}

    _hook(db_session, "invoice_failed", _invoice(sp, 2))
    db_session.expire_all()
    assert sp.status == "past_due"
    assert svc.coverage_map(db_session, [case])[case.id]["state"] == "full"   # still retrying

    _hook(db_session, "subscription_deleted", {"id": "sub_%d" % sp.id})
    db_session.expire_all()
    assert sp.status == "ended" and sp.ended_by == "stripe" and sp.end_reason == "payment_failed"
    assert svc.coverage_map(db_session, [case])[case.id]["state"] == "unfunded"


def test_a_first_invoice_arriving_before_the_checkout_event_starts_the_sponsorship_once(
        client, auth_headers, db_session, stripe_sessions):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()

    _hook(db_session, "invoice_paid", _invoice(sp, 1))
    _hook(db_session, "checkout_completed", {
        "id": sp.stripe_checkout_session_id, "subscription": "sub_%d" % sp.id,
        "metadata": {"type": "sponsorship", "sponsorship_id": str(sp.id)}})

    started = db_session.query(SponsorshipCaseEvent).filter_by(case_id=case.id, type="sponsorship_started").count()
    assert started == 1


def test_the_sponsor_sees_payments_and_use_of_funds_but_nothing_private(
        client, auth_headers, db_session, stripe_sessions, admin_user):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()
    _hook(db_session, "invoice_paid", _invoice(sp, 1))
    r = admin(client, auth_headers, "post", "/cases/%d/disbursements" % case.id, json={
        "amount_cents": 8000, "category": "food", "description": "Food basket for October",
        "internal_note": "Paid cash to the mother at the office"})
    assert r.status_code == 201, r.text

    mine = client.get("/api/sponsorship/portal/sponsorships", headers=portal("donor@example.com"))

    assert mine.status_code == 200
    item = mine.json()["items"][0]
    assert item["total_given_cents"] == 10000
    assert item["finances"] == {"collected_cents": 10000, "disbursed_cents": 8000, "balance_cents": 2000}
    assert item["disbursements"][0]["description"] == "Food basket for October"
    for secret in ("Benali", "JB-445566", "fatima@example.com", "cash to the mother"):
        assert secret not in mine.text


def test_moving_money_is_for_admins(client, auth_headers, manager_headers, db_session):
    case = published_family(client, auth_headers, db_session)
    r = admin(client, manager_headers, "post", "/cases/%d/disbursements" % case.id, json={
        "amount_cents": 100, "category": "food", "description": "Basket"})
    assert r.status_code == 403
    # ...while review work is open to managers.
    assert admin(client, manager_headers, "get", "/cases/%d" % case.id).status_code == 200


def test_a_sponsor_can_stop_and_stripe_is_told_first(client, auth_headers, db_session, stripe_sessions, stripe_cancels):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()
    _hook(db_session, "invoice_paid", _invoice(sp, 1))

    r = client.post("/api/sponsorship/portal/sponsorships/%d/cancel" % sp.id, headers=portal("donor@example.com"),
                    json={"reason": "financial"})

    assert r.status_code == 200, r.text
    assert stripe_cancels == ["sub_%d" % sp.id]
    db_session.expire_all()
    assert sp.status == "canceled" and sp.ended_by == "sponsor"
    assert svc.coverage_map(db_session, [case])[case.id]["state"] == "unfunded"


def test_closing_a_sponsored_case_needs_an_explicit_decision_and_tells_the_sponsors(
        client, auth_headers, db_session, stripe_sessions, stripe_cancels, sent):
    case = published_family(client, auth_headers, db_session)
    checkout(client, case.reference, 10000)
    sp = db_session.query(Sponsorship).one()
    _hook(db_session, "invoice_paid", _invoice(sp, 1))

    refused = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                    json={"action": "close", "close_reason": "self_sufficient"})
    closed = admin(client, auth_headers, "post", "/cases/%d/transition" % case.id,
                   json={"action": "close", "close_reason": "self_sufficient", "end_sponsorships": True})

    assert refused.status_code == 409 and "active_sponsorships" in refused.json()["detail"]["blockers"]
    assert closed.status_code == 200, closed.text
    assert stripe_cancels == ["sub_%d" % sp.id]
    db_session.expire_all()
    assert sp.status == "ended" and sp.end_reason == "case_closed"
    assert any(m["to_email"] == "donor@example.com" and "ended" in m["subject"] for m in sent)
    assert client.get("/api/sponsorship/cases/%s" % case.reference).status_code == 404


def test_every_step_is_in_the_history(client, auth_headers, db_session):
    case = published_family(client, auth_headers, db_session)
    history = admin(client, auth_headers, "get", "/cases/%d" % case.id).json()["history"]
    types = [e["type"] for e in reversed(history)]
    assert types == ["submitted", "document_uploaded", "document_reviewed", "approve", "edited", "publish"]
    edited = next(e for e in history if e["type"] == "edited")
    assert edited["actor_label"] == "testadmin@example.com"
    assert edited["changes"]["public_name"] == [None, "Family of Fatima"]


def test_the_overview_counts_the_pipeline_and_the_money(client, auth_headers, db_session, stripe_sessions):
    case = published_family(client, auth_headers, db_session)
    apply(client, "orphan", orphan_payload())
    checkout(client, case.reference, 4000)
    sp = db_session.query(Sponsorship).one()
    _hook(db_session, "invoice_paid", _invoice(sp, 1, amount=4000))

    o = admin(client, auth_headers, "get", "/overview").json()

    assert o["pipeline"]["family"]["published"] == 1
    assert o["pipeline"]["orphan"]["submitted"] == 1
    assert o["funding"] == {"full": 0, "partial": 1, "unfunded": 0}
    assert o["monthly_need_cents"] == 10000 and o["monthly_committed_cents"] == 4000
    assert o["money"]["collected_total_cents"] == 4000
    assert o["money"]["undistributed_cents"] == 4000
    assert {a["reference"] for a in o["alerts"]["documents_pending"]} == set()   # orphan filed none


# ─────────────────────────────────────────────────────────────────────
# Storage keys
# ─────────────────────────────────────────────────────────────────────

def test_uploaded_documents_are_stored_under_their_case(client, db_session, fake_s3):
    apply(client, "family", family_payload(), docs=[("invoice.pdf", PDF, "application/pdf", "id_document")])
    apply(client, "family", family_payload(email="b@example.com"),
          docs=[("invoice.pdf", PDF, "application/pdf", "id_document")])

    keys = [d.object_key for d in db_session.query(SponsorshipCaseDocument).all()]
    assert len(set(keys)) == 2
    assert all(k.startswith("sponsorship/") for k in keys)
