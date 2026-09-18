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
