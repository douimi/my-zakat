import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import ContactSubmission


@pytest.mark.api
class TestContactAPI:
    """Test contact API endpoints"""
    
    def test_create_contact_submission(self, client: TestClient, db_session: Session):
        """Test creating a contact submission"""
        contact_data = {
            "name": "John Doe",
            "email": "john@example.com",
            "message": "I have a question about donations"
        }
        
        response = client.post("/api/contact/", json=contact_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "John Doe"
        assert data["email"] == "john@example.com"
        assert data["message"] == "I have a question about donations"
        assert data["resolved"] == False
        assert "id" in data
        assert "submitted_at" in data
    
    def test_create_contact_missing_fields(self, client: TestClient):
        """Test creating contact with missing fields"""
        # Missing email
        response = client.post("/api/contact/", json={
            "name": "John",
            "message": "Test"
        })
        assert response.status_code == 422
        
        # Missing name
        response = client.post("/api/contact/", json={
            "email": "john@example.com",
            "message": "Test"
        })
        assert response.status_code == 422
        
        # Missing message
        response = client.post("/api/contact/", json={
            "name": "John",
            "email": "john@example.com"
        })
        assert response.status_code == 422
    
    def test_create_contact_invalid_email(self, client: TestClient):
        """Test creating contact with invalid email"""
        contact_data = {
            "name": "John Doe",
            "email": "invalid-email",
            "message": "Test message"
        }
        
        response = client.post("/api/contact/", json=contact_data)
        assert response.status_code == 422
    
    def test_get_all_contacts_unauthorized(self, client: TestClient):
        """Test getting contacts without authentication"""
        response = client.get("/api/contact/")
        assert response.status_code in [401, 403]
    
    def test_get_all_contacts_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting all contacts with authentication"""
        # Create test contacts
        contacts = [
            ContactSubmission(
                name="Alice",
                email="alice@example.com",
                message="Question 1",
                resolved=False
            ),
            ContactSubmission(
                name="Bob",
                email="bob@example.com",
                message="Question 2",
                resolved=True
            ),
        ]
        
        for contact in contacts:
            db_session.add(contact)
        db_session.commit()
        
        response = client.get("/api/contact/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
    
    def test_get_unresolved_contacts(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test filtering by resolved status"""
        contacts = [
            ContactSubmission(
                name="Alice",
                email="alice@example.com",
                message="Unresolved",
                resolved=False
            ),
            ContactSubmission(
                name="Bob",
                email="bob@example.com",
                message="Resolved",
                resolved=True
            ),
        ]
        
        for contact in contacts:
            db_session.add(contact)
        db_session.commit()
        
        response = client.get("/api/contact/?resolved=false", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that returned contacts are unresolved
        for contact in data:
            if contact["message"] in ["Unresolved", "Resolved"]:
                if contact["message"] == "Unresolved":
                    assert contact["resolved"] == False
    
    def test_resolve_contact(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test resolving a contact submission"""
        contact = ContactSubmission(
            name="Test User",
            email="test@example.com",
            message="Test message",
            resolved=False
        )
        db_session.add(contact)
        db_session.commit()
        db_session.refresh(contact)
        
        response = client.patch(f"/api/contact/{contact.id}/resolve", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["resolved"] == True
    
    def test_resolve_nonexistent_contact(self, client: TestClient, auth_headers: dict):
        """Test resolving a contact that doesn't exist"""
        response = client.patch("/api/contact/9999/resolve", headers=auth_headers)
        assert response.status_code == 404
    
    def test_delete_contact(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting a contact submission"""
        contact = ContactSubmission(
            name="Test User",
            email="test@example.com",
            message="Test message"
        )
        db_session.add(contact)
        db_session.commit()
        db_session.refresh(contact)
        
        response = client.delete(f"/api/contact/{contact.id}", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify deletion
        deleted_contact = db_session.query(ContactSubmission).filter(
            ContactSubmission.id == contact.id
        ).first()
        assert deleted_contact is None


@pytest.mark.unit
class TestContactModel:
    """Test ContactSubmission model"""
    
    def test_contact_creation(self, db_session: Session):
        """Test creating a contact submission"""
        contact = ContactSubmission(
            name="Jane Smith",
            email="jane@example.com",
            message="I would like to volunteer"
        )
        
        db_session.add(contact)
        db_session.commit()
        db_session.refresh(contact)
        
        assert contact.id is not None
        assert contact.name == "Jane Smith"
        assert contact.email == "jane@example.com"
        assert contact.message == "I would like to volunteer"
        assert contact.resolved == False
        assert contact.submitted_at is not None
