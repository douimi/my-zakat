"""Portal authentication: token isolation, one-time codes, revision rules."""
import pytest
from datetime import timedelta

from models import ProjectProposal, ProposalAccessCode, ProposalVersion
from tests.test_project_proposals import _content, _payload


def test_a_portal_token_is_not_a_user_session(admin_user):
    """The defect this closes: a portal token for a staff address must not
    authenticate as that staff member."""
    from auth_utils import create_portal_token, verify_token

    token = create_portal_token(admin_user.email)

    assert verify_token(token) is None


def test_a_staff_token_is_still_a_user_session(admin_user):
    from auth_utils import create_access_token, verify_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_token(token) == admin_user.email


def test_a_portal_token_resolves_only_through_the_portal_verifier():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com")

    assert verify_portal_token(token) == "applicant@example.com"
    assert verify_portal_token("not-a-token") is None


def test_a_staff_token_is_not_a_portal_session(admin_user):
    from auth_utils import create_access_token, verify_portal_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_portal_token(token) is None


def test_an_expired_portal_token_is_refused():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com", expires_delta=timedelta(minutes=-1))

    assert verify_portal_token(token) is None


def test_a_portal_token_is_not_attributed_to_a_staff_member_in_the_audit_log(
    admin_user, monkeypatch
):
    """A rejected portal request must not appear in the audit trail under an
    administrator's name -- that would disguise the very confusion the typ
    claim exists to prevent."""
    import audit_middleware
    import auth_utils
    from audit_middleware import _decode_user_from_request
    from auth_utils import create_access_token, create_portal_token

    # audit_middleware defaults SECRET_KEY to "dev-only-insecure-secret-key"
    # while auth_utils defaults it to "test-secret-key-not-for-production"
    # under TESTING=true. In production both read the same env var, so align
    # them here -- otherwise the decoder rejects every token on signature
    # alone and the test would pass without exercising the typ check at all.
    monkeypatch.setattr(audit_middleware, "SECRET_KEY", auth_utils.SECRET_KEY)

    class _Request:
        def __init__(self, token):
            self.headers = {"authorization": f"Bearer {token}"}
            self.cookies = {}

    portal = _decode_user_from_request(_Request(create_portal_token(admin_user.email)))
    staff = _decode_user_from_request(_Request(create_access_token({"sub": admin_user.email})))

    # Returns a dict (or None), so compare by key -- getattr on a dict would
    # yield None and pass vacuously even with the bug present.
    assert portal is None
    assert staff is not None
    assert staff["email"] == admin_user.email
