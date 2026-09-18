"""One-time portal codes: generation, single use, attempt cap, rate limits."""
from datetime import datetime, timedelta

from models import ProposalAccessCode


def test_a_code_is_six_digits_and_stored_only_as_a_hash(db_session):
    from auth_utils import verify_password
    from proposal_otp import issue_code

    code = issue_code(db_session, email="a@example.com", ip="203.0.113.1")

    assert code is not None
    assert len(code) == 6 and code.isdigit()
    row = db_session.query(ProposalAccessCode).one()
    # The stored value is a bcrypt digest that verifies the code, never the
    # code itself. (Asserting the digits are absent as a SUBSTRING would flake:
    # a six-digit run turns up in a bcrypt tail roughly once in 1,400 runs.)
    assert row.code_hash != code
    assert row.code_hash.startswith("$2")
    assert len(row.code_hash) >= 55
    assert verify_password(code, row.code_hash) is True
    assert verify_password("000000" if code != "000000" else "111111", row.code_hash) is False
    assert row.email == "a@example.com"
    assert row.request_ip == "203.0.113.1"
    assert row.expires_at > datetime.utcnow()


def test_the_right_code_verifies_once_and_only_once(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code=code) is True
    assert verify_code(db_session, email="a@example.com", code=code) is False


def test_a_wrong_code_fails_and_counts_an_attempt(db_session):
    from proposal_otp import issue_code, verify_code

    issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code="000000") is False
    assert db_session.query(ProposalAccessCode).one().attempts == 1


def test_the_code_burns_after_five_failures(db_session):
    from proposal_otp import MAX_ATTEMPTS, issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")
    for _ in range(MAX_ATTEMPTS):
        assert verify_code(db_session, email="a@example.com", code="000000") is False

    # Even the correct code is worthless now.
    assert verify_code(db_session, email="a@example.com", code=code) is False
    assert db_session.query(ProposalAccessCode).one().consumed_at is not None


def test_an_expired_code_is_refused(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")
    row = db_session.query(ProposalAccessCode).one()
    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db_session.commit()

    assert verify_code(db_session, email="a@example.com", code=code) is False


def test_requesting_a_new_code_invalidates_the_previous_one(db_session):
    from proposal_otp import issue_code, verify_code

    first = issue_code(db_session, email="a@example.com", ip="")
    second = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code=first) is False
    assert verify_code(db_session, email="a@example.com", code=second) is True


def test_a_code_never_unlocks_another_address(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="b@example.com", code=code) is False


def test_verifying_with_no_code_on_file_is_simply_false(db_session):
    from proposal_otp import verify_code

    assert verify_code(db_session, email="nobody@example.com", code="123456") is False


def test_an_email_is_capped_at_three_codes_per_window(db_session):
    from proposal_otp import MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is not None

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is None


def test_the_email_cap_is_case_insensitive(db_session):
    from proposal_otp import MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        issue_code(db_session, email="A@Example.com", ip="203.0.113.1")

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is None


def test_an_ip_is_capped_across_different_addresses(db_session):
    from proposal_otp import MAX_CODES_PER_IP, issue_code

    for n in range(MAX_CODES_PER_IP):
        assert issue_code(db_session, email=f"user{n}@example.com", ip="198.51.100.9") is not None

    assert issue_code(db_session, email="another@example.com", ip="198.51.100.9") is None


def test_an_old_request_no_longer_counts_towards_the_cap(db_session):
    from proposal_otp import EMAIL_WINDOW_MINUTES, MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        issue_code(db_session, email="a@example.com", ip="203.0.113.1")
    for row in db_session.query(ProposalAccessCode).all():
        row.created_at = datetime.utcnow() - timedelta(minutes=EMAIL_WINDOW_MINUTES + 1)
    db_session.commit()

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is not None
