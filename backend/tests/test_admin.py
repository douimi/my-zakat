import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from models import User, Donation, ContactSubmission, Event, Story


@pytest.mark.api
class TestAdminAPI:
    """Test admin API endpoints"""
    
    def test_get_dashboard_unauthorized(self, client: TestClient):
        """Test accessing dashboard without authentication"""
        response = client.get("/api/admin/dashboard")
        assert response.status_code in [401, 403]
    
    def test_get_dashboard_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting dashboard statistics with authentication"""
        # Create test data
        donations = [
            Donation(
                name="Donor 1",
                email="donor1@example.com",
                amount=100.0,
                frequency="one-time"
            ),
            Donation(
                name="Donor 2",
                email="donor2@example.com",
                amount=50.0,
                frequency="monthly"
            ),
        ]
        
        for donation in donations:
            db_session.add(donation)
        
        contacts = [
            ContactSubmission(
                name="Contact 1",
                email="contact1@example.com",
                message="Test message",
                resolved=False
            ),
            ContactSubmission(
                name="Contact 2",
                email="contact2@example.com",
                message="Another message",
                resolved=True
            ),
        ]
        
        for contact in contacts:
            db_session.add(contact)
        
        db_session.commit()
        
        response = client.get("/api/admin/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "total_donations" in data or "donations" in data
        # Dashboard should return some statistics
        assert isinstance(data, dict)
    
    def test_change_password_unauthorized(self, client: TestClient):
        """Test changing password without authentication"""
        password_data = {
            "old_password": "admin",
            "new_password": "newpassword123"
        }
        
        response = client.post("/api/admin/change-password", json=password_data)
        assert response.status_code in [401, 403]
    
    def test_change_password_success(self, client: TestClient, auth_headers: dict, admin_user: User, db_session: Session):
        """Test successfully changing password"""
        password_data = {
            "old_password": "testpass",
            "new_password": "newpassword123"
        }
        
        response = client.post("/api/admin/change-password", json=password_data, headers=auth_headers)
        
        # Should succeed or return specific status
        assert response.status_code in [200, 201]
    
    def test_change_password_wrong_old_password(self, client: TestClient, auth_headers: dict):
        """Test changing password with wrong old password"""
        password_data = {
            "old_password": "wrongpassword",
            "new_password": "newpassword123"
        }
        
        response = client.post("/api/admin/change-password", json=password_data, headers=auth_headers)
        
        # Should return error
        assert response.status_code in [400, 401, 403]
    
    def test_change_password_weak_new_password(self, client: TestClient, auth_headers: dict):
        """Test changing password with weak new password"""
        password_data = {
            "old_password": "testpass",
            "new_password": "123"  # Too short
        }
        
        response = client.post("/api/admin/change-password", json=password_data, headers=auth_headers)
        
        # Should return validation error or bad request
        assert response.status_code in [400, 422]


@pytest.mark.unit
class TestAdminModel:
    """Test User model with admin privileges"""
    
    def test_admin_creation(self, db_session: Session):
        """Test creating an admin user"""
        from auth_utils import get_password_hash
        
        admin = User(
            email="newadmin@example.com",
            password=get_password_hash("securepassword"),
            name="New Admin",
            is_active=True,
            is_admin=True
        )
        
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)
        
        assert admin.id is not None
        assert admin.email == "newadmin@example.com"
        assert admin.name == "New Admin"
        assert admin.is_admin is True
        assert admin.password is not None
        assert admin.password != "securepassword"  # Should be hashed
    
    def test_admin_unique_email(self, db_session: Session):
        """Test that admin emails are unique"""
        from auth_utils import get_password_hash
        
        admin1 = User(
            email="testuser@example.com", 
            password=get_password_hash("pass1"),
            name="Test User 1",
            is_admin=True
        )
        db_session.add(admin1)
        db_session.commit()
        
        # Try to create another admin with same email
        admin2 = User(
            email="testuser@example.com", 
            password=get_password_hash("pass2"),
            name="Test User 2",
            is_admin=True
        )
        db_session.add(admin2)
        
        with pytest.raises(Exception):  # Should raise integrity error
            db_session.commit()


@pytest.mark.integration
class TestAdminWorkflow:
    """Test complete admin workflows"""
    
    def test_full_admin_workflow(self, client: TestClient, db_session: Session):
        """Test a complete admin workflow"""
        # 1. Create admin user
        from auth_utils import get_password_hash
        admin = User(
            email="workflowadmin@example.com", 
            password=get_password_hash("testpass"),
            name="Workflow Admin",
            is_active=True,
            is_admin=True
        )
        db_session.add(admin)
        db_session.commit()
        
        # 2. Login
        login_response = client.post(
            "/api/auth/login",
            json={"email": "workflowadmin@example.com", "password": "testpass"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 3. Access dashboard
        dashboard_response = client.get("/api/admin/dashboard", headers=headers)
        assert dashboard_response.status_code == 200
        
        # 4. Create some data
        event = Event(
            title="Admin Event",
            description="Created by admin",
            date=datetime.utcnow() + timedelta(days=7),
            location="Admin Office"
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        # 5. Verify access to protected endpoints
        contacts_response = client.get("/api/contact/", headers=headers)
        assert contacts_response.status_code == 200
