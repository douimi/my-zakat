import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Volunteer


@pytest.mark.api
class TestVolunteersAPI:
    """Test volunteers API endpoints"""
    
    def test_create_volunteer(self, client: TestClient, db_session: Session):
        """Test creating a volunteer submission"""
        volunteer_data = {
            "name": "Sarah Johnson",
            "email": "sarah@example.com",
            "interest": "Event planning"
        }
        
        response = client.post("/api/volunteers/", json=volunteer_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Sarah Johnson"
        assert data["email"] == "sarah@example.com"
        assert data["interest"] == "Event planning"
        assert "id" in data
        assert "submitted_at" in data
    
    def test_create_volunteer_missing_fields(self, client: TestClient):
        """Test creating volunteer with missing required fields"""
        # Missing email
        response = client.post("/api/volunteers/", json={
            "name": "John",
            "interest": "Fundraising"
        })
        assert response.status_code == 422
    
    def test_create_volunteer_invalid_email(self, client: TestClient):
        """Test creating volunteer with invalid email"""
        volunteer_data = {
            "name": "Test User",
            "email": "invalid-email",
            "interest": "Teaching"
        }
        
        response = client.post("/api/volunteers/", json=volunteer_data)
        assert response.status_code == 422
    
    def test_get_all_volunteers_unauthorized(self, client: TestClient):
        """Test getting volunteers without authentication"""
        response = client.get("/api/volunteers/")
        assert response.status_code in [401, 403]
    
    def test_get_all_volunteers_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting all volunteers with authentication"""
        volunteers = [
            Volunteer(
                name="Alice",
                email="alice@example.com",
                interest="Teaching"
            ),
            Volunteer(
                name="Bob",
                email="bob@example.com",
                interest="Tech support"
            ),
        ]
        
        for volunteer in volunteers:
            db_session.add(volunteer)
        db_session.commit()
        
        response = client.get("/api/volunteers/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        
        for volunteer in data:
            assert "id" in volunteer
            assert "name" in volunteer
            assert "email" in volunteer
    
    def test_delete_volunteer(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting a volunteer"""
        volunteer = Volunteer(
            name="Test Volunteer",
            email="test@example.com",
            interest="Marketing"
        )
        db_session.add(volunteer)
        db_session.commit()
        db_session.refresh(volunteer)
        
        response = client.delete(f"/api/volunteers/{volunteer.id}", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify deletion
        deleted_volunteer = db_session.query(Volunteer).filter(
            Volunteer.id == volunteer.id
        ).first()
        assert deleted_volunteer is None
    
    def test_delete_nonexistent_volunteer(self, client: TestClient, auth_headers: dict):
        """Test deleting a volunteer that doesn't exist"""
        response = client.delete("/api/volunteers/9999", headers=auth_headers)
        assert response.status_code == 404


@pytest.mark.unit
class TestVolunteerModel:
    """Test Volunteer model"""
    
    def test_volunteer_creation(self, db_session: Session):
        """Test creating a volunteer model"""
        volunteer = Volunteer(
            name="Mike Wilson",
            email="mike@example.com",
            interest="Marketing"
        )
        
        db_session.add(volunteer)
        db_session.commit()
        db_session.refresh(volunteer)
        
        assert volunteer.id is not None
        assert volunteer.name == "Mike Wilson"
        assert volunteer.email == "mike@example.com"
        assert volunteer.interest == "Marketing"
        assert volunteer.submitted_at is not None
    
    def test_volunteer_with_different_interests(self, db_session: Session):
        """Test creating volunteers with different interests"""
        interests = ["Teaching", "Fundraising", "Tech Support", "Event Planning"]
        
        for i, interest in enumerate(interests):
            volunteer = Volunteer(
                name=f"Volunteer {i}",
                email=f"vol{i}@example.com",
                interest=interest
            )
            db_session.add(volunteer)
        
        db_session.commit()
        
        # Verify all were created
        all_volunteers = db_session.query(Volunteer).all()
        assert len([v for v in all_volunteers if v.interest in interests]) == 4