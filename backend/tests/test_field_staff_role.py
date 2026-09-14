"""Tests for the field_staff role and the staff-level auth dependency."""
import pytest
from fastapi import HTTPException

from auth_utils import _role_of, get_current_staff, get_current_manager_or_admin
from models import User


def _user(role, is_admin=False):
    return User(id=1, email="x@example.com", password="x", role=role, is_admin=is_admin)


def test_role_of_prefers_the_role_column():
    assert _role_of(_user("field_staff")) == "field_staff"
    assert _role_of(_user("manager")) == "manager"


def test_role_of_falls_back_to_is_admin_when_role_is_missing():
    assert _role_of(_user(None, is_admin=True)) == "admin"
    assert _role_of(_user(None, is_admin=False)) == "user"


def test_role_of_rejects_an_unknown_role_value():
    assert _role_of(_user("wizard", is_admin=False)) == "user"


@pytest.mark.parametrize("role", ["admin", "manager", "field_staff"])
def test_get_current_staff_allows_every_staff_role(role):
    user = _user(role)
    assert get_current_staff(user) is user


def test_get_current_staff_rejects_a_donor():
    with pytest.raises(HTTPException) as exc:
        get_current_staff(_user("user"))
    assert exc.value.status_code == 403


def test_field_staff_is_not_a_manager_or_admin():
    with pytest.raises(HTTPException) as exc:
        get_current_manager_or_admin(_user("field_staff"))
    assert exc.value.status_code == 403


def test_admin_can_assign_the_field_staff_role(client, auth_headers):
    response = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={
            "email": "photographer@example.com",
            "password": "testpass1",
            "name": "Field Photographer",
            "role": "field_staff",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "field_staff"


def test_admin_cannot_assign_an_unknown_role(client, auth_headers):
    response = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "nope@example.com", "password": "testpass1", "role": "wizard"},
    )
    assert response.status_code == 400
