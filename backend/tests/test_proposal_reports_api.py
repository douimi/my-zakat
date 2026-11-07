"""The HTTP surface of the funded -> report -> completed lifecycle.

The domain rules are covered in test_proposal_reports.py. These exist because a
name referenced only inside a function body is invisible to an import check —
exactly how `_client_ip` survived into the portal's report endpoint and would
have raised NameError on the first real submission. Everything here actually
calls the endpoint.
"""
import io

import pytest

import proposal_service as svc
from auth_utils import create_portal_token
from models import ProjectProposal, ProposalVersion

PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR"
       + b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00" + b"\x00" * 64)
PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"

APPLICANT = "naji@example.com"


def _content(**overrides) -> dict:
    base = {
        "full_name": "Naji Abu Raida", "national_id": "ID-1",
        "date_of_birth_year": 1992, "place_of_residence": "Khan Younis",
        "mobile_number": "+970700000000", "email": APPLICANT,
        "educational_level": "BSc", "project_name": "Rice and Potatoes",
        # The public POST validates these with min_length=10; the ORM does not.
        # This fixture goes through the real endpoint, so it meets the stricter
        # of the two contracts.
        "project_description": "Monthly food parcels for displaced families.",
        "problem_solved": "Displaced families cannot afford staple food.",
        "target_beneficiaries": "50 displaced families in Al-Mawasi",
        "community_impact": "Local suppliers provide the parcels.",
        "expected_impact": "Better nutrition for about 300 people.",
        "implementation_steps": "Identify families\nBuy supplies\nDistribute",
        "implementation_location": "Al-Mawasi, Khan Younis, Gaza",
        "required_materials": "Rice\nPotatoes\nPackaging",
        "expected_duration": "Two weeks after funding",
        "continuity_plan": "A local committee takes over procurement.",
        "feasibility": "Suppliers have already been identified and quoted.",
        "expected_challenges": "Crowding at the point of distribution.",
        "number_of_beneficiaries": 50,
        "cost_per_unit_usd": 90.0, "unit_type": "family",
        "additional_expenses_usd": 0.0, "additional_expenses_description": None,
        "total_amount_usd": 4500.0,
    }
    base.update(overrides)
    return base


@pytest.fixture
def portal_headers():
    return {"Authorization": "Bearer %s" % create_portal_token(APPLICANT)}


def _dossier(db, status="approved", email=APPLICANT):
    d = ProjectProposal(email=email, full_name="Naji Abu Raida", status=status)
    db.add(d)
    db.flush()
    v = ProposalVersion(proposal_id=d.id, version_no=1, **_content(email=email))
    db.add(v)
    db.flush()
    d.current_version_id = v.id
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def approved(db_session):
    return _dossier(db_session)


@pytest.fixture
def funded(db_session, approved):
    return svc.mark_funded(db_session, approved, reviewer_id=1)


@pytest.fixture(autouse=True)
def _no_outbound_email(monkeypatch):
    """Every endpoint here sends mail. Stub the senders so the tests assert on
    behaviour rather than on a queue, and so a template change cannot turn an
    endpoint test red for the wrong reason."""
    import email_service
    sent = []
    for name in ("send_proposal_funded", "send_report_received",
                 "send_report_changes_requested", "send_proposal_completed"):
        monkeypatch.setattr(
            email_service, name,
            lambda _n=name, **kw: sent.append((_n, kw)) or True)
    return sent


@pytest.fixture(autouse=True)
def _fake_s3(monkeypatch):
    """Keep bytes in memory. The S3 path is exercised by its own tests; here it
    would only make these slow and flaky."""
    import s3_service
    store = {}
    monkeypatch.setattr(s3_service, "upload_file",
                        lambda content, key, **kw: store.__setitem__(key, content) or key)
    monkeypatch.setattr(s3_service, "download_file", lambda key: store.get(key))
    monkeypatch.setattr(s3_service, "generate_object_key",
                        lambda prefix, filename: "%s/%s" % (prefix, filename))
    return store


def _api(client, headers, method, path, **kw):
    return getattr(client, method)("/api/project-proposals%s" % path,
                                   headers=headers, **kw)


# ======================================================================
# Marking funded
# ======================================================================

def test_marking_funded(client, auth_headers, approved):
    r = _api(client, auth_headers, "post", "/%d/funded" % approved.id)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "funded"


def test_marking_funded_emails_the_team(client, auth_headers, approved,
                                        _no_outbound_email):
    _api(client, auth_headers, "post", "/%d/funded" % approved.id)
    assert [n for n, _ in _no_outbound_email] == ["send_proposal_funded"]


def test_marking_funded_twice_does_not_email_twice(client, auth_headers, approved,
                                                   _no_outbound_email):
    """Re-marking must not tell the team to start work they are halfway
    through."""
    _api(client, auth_headers, "post", "/%d/funded" % approved.id)
    r = _api(client, auth_headers, "post", "/%d/funded" % approved.id)
    assert r.status_code == 200
    assert len(_no_outbound_email) == 1


def test_an_unapproved_proposal_cannot_be_funded(client, auth_headers, db_session):
    d = _dossier(db_session, status="under_review")
    r = _api(client, auth_headers, "post", "/%d/funded" % d.id)
    assert r.status_code == 409, r.text


def test_funded_cannot_be_set_through_the_status_endpoint(client, auth_headers,
                                                          approved):
    r = _api(client, auth_headers, "patch", "/%d/status" % approved.id,
             json={"status": "funded"})
    assert r.status_code == 400, r.text
    assert "not a review verdict" in r.json()["detail"]


# ======================================================================
# The gate on new applications
# ======================================================================

def test_a_new_application_is_refused_while_a_report_is_outstanding(
    client, funded
):
    r = client.post("/api/project-proposals/", json=_content())
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert "#%d" % funded.id in detail, "the refusal must name the blocking dossier"
    assert "report" in detail.lower()


def test_the_gate_lifts_once_the_report_is_accepted(
    client, auth_headers, portal_headers, funded
):
    """The full journey, through HTTP only: fund, report, accept, re-apply."""
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "We served 48 families."})
    assert r.status_code == 201, r.text

    r = _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
             json={"decision": "approved"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"

    r = client.post("/api/project-proposals/", json=_content())
    assert r.status_code == 201, r.text


def test_a_different_applicant_is_not_blocked(client, funded):
    r = client.post("/api/project-proposals/", json=_content(email="other@example.com"))
    assert r.status_code == 201, r.text


# ======================================================================
# Submitting a report through the portal
# ======================================================================

def test_submitting_a_report_with_no_attachments(client, portal_headers, funded):
    r = client.post("/api/project-proposals/portal/%d/report" % funded.id,
                    headers=portal_headers, data={"narrative": "All done."})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "report_submitted"
    assert body["report"]["report_no"] == 1
    assert body["attachments_stored"] == 0


def test_submitting_a_report_with_attachments(client, portal_headers, funded,
                                              _fake_s3):
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers,
        data={"narrative": "Receipts and photos attached."},
        files=[("files", ("receipt.pdf", PDF, "application/pdf")),
               ("files", ("photo.png", PNG, "image/png"))],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["attachments_stored"] == 2
    kinds = sorted(a["kind"] for a in body["report"]["attachments"])
    assert kinds == ["document", "image"]
    assert len(_fake_s3) == 2


def test_a_30_mb_pdf_report_goes_through_whole(client, portal_headers, funded,
                                               _fake_s3):
    """Over the old 25 MB cap. Stored byte for byte: validating on the head and
    re-reading for storage must not truncate or shift the file."""
    big = PDF + bytes(range(256)) * (30 * 1024 * 4)  # ~30 MB, non-uniform bytes
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "Everything is in the PDF."},
        files=[("files", ("report.pdf", big, "application/pdf"))],
    )
    assert r.status_code == 201, r.text
    attachment = r.json()["report"]["attachments"][0]
    assert attachment["size_bytes"] == len(big)
    assert list(_fake_s3.values()) == [big]


def test_the_size_cap_is_measured_on_the_bytes_received(
    client, portal_headers, funded, db_session, _fake_s3, monkeypatch
):
    import report_attachments
    monkeypatch.setattr(report_attachments, "MAX_ATTACHMENT_BYTES", 1024)
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "x"},
        files=[("files", ("report.pdf", PDF + b"\0" * 2048, "application/pdf"))],
    )
    assert r.status_code == 400, r.text
    assert svc.current_report(db_session, funded) is None
    assert _fake_s3 == {}


def test_a_batch_over_the_total_cap_is_refused_before_anything_is_saved(
    client, portal_headers, funded, db_session, _fake_s3, monkeypatch
):
    import report_attachments
    monkeypatch.setattr(report_attachments, "MAX_REPORT_BYTES", len(PDF) + 10)
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "x"},
        files=[("files", ("a.pdf", PDF, "application/pdf")),
               ("files", ("b.pdf", PDF, "application/pdf"))],
    )
    assert r.status_code == 400, r.text
    assert "in total" in r.json()["detail"]
    assert svc.current_report(db_session, funded) is None
    assert _fake_s3 == {}


def test_the_stored_type_is_what_the_bytes_are_not_what_was_declared(
    client, portal_headers, funded
):
    """A PDF uploaded with a generic type must be stored as application/pdf."""
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "x"},
        files=[("files", ("receipt.pdf", PDF, "application/octet-stream"))],
    )
    assert r.status_code == 201, r.text
    assert r.json()["report"]["attachments"][0]["kind"] == "document"


def test_a_spoofed_attachment_is_refused_and_nothing_is_saved(
    client, portal_headers, funded, db_session, _fake_s3
):
    """Validation happens before the report row exists, so a refusal leaves no
    half-made submission and no orphaned objects."""
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "x"},
        files=[("files", ("x.png", b"not an image at all" * 4, "image/png"))],
    )
    assert r.status_code == 400, r.text
    db_session.refresh(funded)
    assert funded.status == "funded", "the dossier moved despite the refusal"
    assert svc.current_report(db_session, funded) is None
    assert _fake_s3 == {}


def test_a_report_on_someone_elses_dossier_is_not_found(client, db_session):
    """The token's address is the only identity. An id alone must not reach
    another applicant's dossier."""
    mine = _dossier(db_session, status="funded", email=APPLICANT)
    theirs = _dossier(db_session, status="funded", email="someone@else.com")
    headers = {"Authorization": "Bearer %s" % create_portal_token(APPLICANT)}
    r = client.post("/api/project-proposals/portal/%d/report" % theirs.id,
                    headers=headers, data={"narrative": "x"})
    assert r.status_code == 404, r.text
    assert mine.id != theirs.id


def test_a_report_before_funding_is_refused(client, portal_headers, approved):
    r = client.post("/api/project-proposals/portal/%d/report" % approved.id,
                    headers=portal_headers, data={"narrative": "x"})
    assert r.status_code == 409, r.text


def test_an_empty_narrative_is_refused(client, portal_headers, funded):
    r = client.post("/api/project-proposals/portal/%d/report" % funded.id,
                    headers=portal_headers, data={"narrative": "   "})
    assert r.status_code == 400, r.text


def test_submitting_a_report_acknowledges_it_by_email(client, portal_headers,
                                                       funded, _no_outbound_email):
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "done"})
    assert [n for n, _ in _no_outbound_email] == ["send_report_received"]


def test_the_report_endpoint_requires_a_portal_token(client, funded):
    r = client.post("/api/project-proposals/portal/%d/report" % funded.id,
                    data={"narrative": "x"})
    assert r.status_code in (401, 403), r.text


# ======================================================================
# Reviewing a report
# ======================================================================

def test_the_admin_sees_the_report_history_with_staff_fields(
    client, auth_headers, portal_headers, funded
):
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "done"})
    r = _api(client, auth_headers, "get", "/%d/reports" % funded.id)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["awaiting_review"] is True
    assert body["current_report_no"] == 1
    assert "internal_note" in body["reports"][0]
    assert "submitted_ip" in body["reports"][0]


def test_sending_a_report_back_requires_a_reason(client, auth_headers,
                                                  portal_headers, funded):
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "thin"})
    r = _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
             json={"decision": "changes_requested"})
    assert r.status_code == 400, r.text


def test_sending_a_report_back_then_resubmitting(client, auth_headers,
                                                 portal_headers, funded):
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "thin"})
    r = _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
             json={"decision": "changes_requested",
                   "decision_comment": "Attach the receipts."})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "report_changes_requested"

    r = client.post("/api/project-proposals/portal/%d/report" % funded.id,
                    headers=portal_headers, data={"narrative": "with receipts"})
    assert r.status_code == 201, r.text
    assert r.json()["report"]["report_no"] == 2


def test_an_invalid_report_verdict_is_refused_by_the_schema(client, auth_headers,
                                                             funded):
    r = _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
             json={"decision": "rejected"})
    assert r.status_code == 422, r.text


def test_a_verdict_with_no_report_is_409(client, auth_headers, funded):
    r = _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
             json={"decision": "approved"})
    assert r.status_code == 409, r.text


# ======================================================================
# Attachments
# ======================================================================

def test_the_admin_can_download_an_attachment(client, auth_headers,
                                              portal_headers, funded):
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=portal_headers, data={"narrative": "x"},
        files=[("files", ("receipt.pdf", PDF, "application/pdf"))])
    report_no = r.json()["report"]["report_no"]
    assert report_no == 1

    listing = _api(client, auth_headers, "get", "/%d/reports" % funded.id).json()
    report = listing["reports"][0]
    att = report["attachments"][0]
    r = _api(client, auth_headers, "get",
             "/%d/reports/%d/attachments/%d" % (funded.id, report["id"], att["id"]))
    assert r.status_code == 200, r.text
    assert r.content == PDF
    assert r.headers["content-type"] == "application/pdf"
    assert "receipt.pdf" in r.headers["content-disposition"]


def test_an_attachment_cannot_be_read_through_the_wrong_report(
    client, auth_headers, portal_headers, funded, db_session
):
    """Every id is checked against its parent. An attachment id alone must not
    read any report's file."""
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "x"},
                files=[("files", ("a.pdf", PDF, "application/pdf"))])
    listing = _api(client, auth_headers, "get", "/%d/reports" % funded.id).json()
    att_id = listing["reports"][0]["attachments"][0]["id"]
    wrong_report_id = listing["reports"][0]["id"] + 999
    r = _api(client, auth_headers, "get",
             "/%d/reports/%d/attachments/%d" % (funded.id, wrong_report_id, att_id))
    assert r.status_code == 404, r.text


def test_an_attachment_cannot_be_read_through_another_dossier(
    client, auth_headers, portal_headers, funded, db_session
):
    other = _dossier(db_session, status="approved", email="other@example.com")
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "x"},
                files=[("files", ("a.pdf", PDF, "application/pdf"))])
    listing = _api(client, auth_headers, "get", "/%d/reports" % funded.id).json()
    report_id = listing["reports"][0]["id"]
    att_id = listing["reports"][0]["attachments"][0]["id"]
    r = _api(client, auth_headers, "get",
             "/%d/reports/%d/attachments/%d" % (other.id, report_id, att_id))
    assert r.status_code == 404, r.text


def test_a_team_can_re_read_its_own_attachment(client, portal_headers, funded):
    r = client.post("/api/project-proposals/portal/%d/report" % funded.id,
                    headers=portal_headers, data={"narrative": "x"},
                    files=[("files", ("a.pdf", PDF, "application/pdf"))])
    att_id = r.json()["report"]["attachments"][0]["id"]
    r = client.get(
        "/api/project-proposals/portal/%d/report/attachments/%d" % (funded.id, att_id),
        headers=portal_headers)
    assert r.status_code == 200, r.text
    assert r.content == PDF


def test_a_team_cannot_read_another_teams_attachment(client, portal_headers,
                                                      funded, db_session):
    theirs = _dossier(db_session, status="funded", email="someone@else.com")
    their_report = svc.submit_report(db_session, theirs, narrative="theirs")
    from report_attachments import CheckedAttachment
    att = svc.add_report_attachment(
        db_session, their_report,
        checked=CheckedAttachment("secret.pdf", "application/pdf", "document", 10),
        object_key="k")
    r = client.get(
        "/api/project-proposals/portal/%d/report/attachments/%d" % (theirs.id, att.id),
        headers=portal_headers)
    assert r.status_code == 404, r.text


# ======================================================================
# The badge
# ======================================================================

def test_an_arriving_report_raises_the_unread_count(client, auth_headers,
                                                     portal_headers, funded):
    _api(client, auth_headers, "post", "/%d/seen" % funded.id)
    before = _api(client, auth_headers, "get", "/unread-count").json()["count"]

    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "done"})

    after = _api(client, auth_headers, "get", "/unread-count").json()["count"]
    assert after == before + 1


def test_the_list_flags_a_report_awaiting_review(client, auth_headers,
                                                  portal_headers, funded):
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "done"})
    rows = _api(client, auth_headers, "get", "/").json()["items"]
    row = next(r for r in rows if r["id"] == funded.id)
    assert row["awaiting_report_review"] is True
    assert row["report_unread"] is True
    assert row["has_report"] is True


@pytest.mark.parametrize("method,path", [
    ("post", "/1/funded"),
    ("get", "/1/reports"),
    ("post", "/1/report-decision"),
    ("get", "/1/reports/1/attachments/1"),
])
def test_every_new_admin_endpoint_requires_auth(client, method, path):
    r = getattr(client, method)("/api/project-proposals%s" % path)
    assert r.status_code in (401, 403), "%s %s is unauthenticated!" % (method, path)


def test_the_portal_listing_carries_the_report_and_its_verdict(
    client, auth_headers, portal_headers, funded
):
    """Without this the team cannot see WHY their report was sent back, and
    that comment is the only thing telling them what to fix."""
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=portal_headers, data={"narrative": "first try"},
                files=[("files", ("a.pdf", PDF, "application/pdf"))])
    _api(client, auth_headers, "post", "/%d/report-decision" % funded.id,
         json={"decision": "changes_requested",
               "decision_comment": "Attach the receipts.",
               "internal_note": "SECRET"})

    body = client.get("/api/project-proposals/portal/me",
                      headers=portal_headers).json()
    row = next(i for i in body["items"] if i["id"] == funded.id)

    assert row["status"] == "report_changes_requested"
    assert row["may_submit_report"] is True
    assert row["report"]["decision"] == "changes_requested"
    assert row["report"]["decision_comment"] == "Attach the receipts."
    assert len(row["report"]["attachments"]) == 1
    assert "SECRET" not in repr(row), "the internal note reached the applicant"


def test_the_portal_listing_has_no_report_before_one_is_filed(
    client, portal_headers, funded
):
    body = client.get("/api/project-proposals/portal/me",
                      headers=portal_headers).json()
    row = next(i for i in body["items"] if i["id"] == funded.id)
    assert row["report"] is None
    assert row["may_submit_report"] is True


# ======================================================================
# Adding files to a report that is waiting for review
# ======================================================================

def _file_report(client, headers, proposal_id, files=()):
    return client.post(
        "/api/project-proposals/portal/%d/report" % proposal_id,
        headers=headers, data={"narrative": "Done."}, files=list(files))


def _add(client, headers, proposal_id, files):
    return client.post(
        "/api/project-proposals/portal/%d/report/attachments" % proposal_id,
        headers=headers, files=files)


def test_a_text_only_report_can_be_completed_with_its_files(
    client, portal_headers, funded, db_session, _fake_s3
):
    """The team whose 50 MB PDF did not make it the first time."""
    assert _file_report(client, portal_headers, funded.id).status_code == 201

    r = _add(client, portal_headers, funded.id,
             [("files", ("report.pdf", PDF, "application/pdf"))])

    assert r.status_code == 201, r.text
    assert r.json()["attachments_stored"] == 1
    assert [a["filename"] for a in r.json()["report"]["attachments"]] == ["report.pdf"]
    assert len(_fake_s3) == 1
    db_session.refresh(funded)
    assert funded.status == "report_submitted", "adding files is not a new report"


def test_added_files_mark_the_report_unread_for_the_admins(
    client, portal_headers, auth_headers, funded, db_session
):
    _file_report(client, portal_headers, funded.id)
    report = svc.current_report(db_session, funded)
    funded.admin_seen_report_id = report.id
    db_session.commit()

    _add(client, portal_headers, funded.id, [("files", ("report.pdf", PDF, "application/pdf"))])

    db_session.refresh(funded)
    assert funded.admin_seen_report_id is None


def test_files_cannot_be_added_once_the_report_was_reviewed(
    client, portal_headers, auth_headers, funded, _fake_s3
):
    _file_report(client, portal_headers, funded.id)
    client.post("/api/project-proposals/%d/report-decision" % funded.id, headers=auth_headers,
                json={"decision": "approved"})

    r = _add(client, portal_headers, funded.id, [("files", ("late.pdf", PDF, "application/pdf"))])
    assert r.status_code == 409
    assert _fake_s3 == {}


def test_files_cannot_be_added_before_any_report(client, portal_headers, funded, _fake_s3):
    r = _add(client, portal_headers, funded.id, [("files", ("x.pdf", PDF, "application/pdf"))])
    assert r.status_code == 409


def test_adding_files_respects_the_count_already_on_the_report(
    client, portal_headers, funded, monkeypatch, _fake_s3
):
    import report_attachments
    monkeypatch.setattr(report_attachments, "MAX_ATTACHMENTS_PER_REPORT", 2)
    _file_report(client, portal_headers, funded.id,
                 [("files", ("a.pdf", PDF, "application/pdf")),
                  ("files", ("b.pdf", PDF, "application/pdf"))])

    r = _add(client, portal_headers, funded.id, [("files", ("c.pdf", PDF, "application/pdf"))])
    assert r.status_code == 400
    assert len(_fake_s3) == 2


def test_adding_files_needs_a_file_and_a_session(client, portal_headers, funded):
    _file_report(client, portal_headers, funded.id)
    assert _add(client, portal_headers, funded.id, []).status_code == 400
    assert _add(client, {}, funded.id,
                [("files", ("x.pdf", PDF, "application/pdf"))]).status_code in (401, 403)


def test_attachment_downloads_require_authentication(client, portal_headers, funded):
    """Why the console and the portal fetch files with their token instead of
    linking to them: a plain link carries no Authorization header and is
    refused, which is how admins came to see a report's text but never its PDF."""
    r = _file_report(client, portal_headers, funded.id,
                     [("files", ("report.pdf", PDF, "application/pdf"))])
    attachment_id = r.json()["report"]["attachments"][0]["id"]
    report_id = r.json()["report"].get("id")

    team_url = "/api/project-proposals/portal/%d/report/attachments/%d" % (funded.id, attachment_id)
    assert client.get(team_url).status_code in (401, 403)
    assert client.get(team_url, headers=portal_headers).content == PDF
    if report_id:
        staff_url = "/api/project-proposals/%d/reports/%d/attachments/%d" % (funded.id, report_id, attachment_id)
        assert client.get(staff_url).status_code in (401, 403)
