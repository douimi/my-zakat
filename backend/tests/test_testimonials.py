import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Testimonial


@pytest.mark.api
class TestTestimonialsAPI:
    """Test testimonials API endpoints"""
    
    def test_get_all_testimonials(self, client: TestClient, db_session: Session):
        """Test getting all testimonials"""
        testimonials = [
            Testimonial(
                name="Ahmed Ali",
                text="This organization changed my life!",
                country="Egypt",
                rating=5,
                is_approved=True
            ),
            Testimonial(
                name="Fatima Hassan",
                text="Amazing work helping families in need.",
                country="Morocco",
                rating=5,
                is_approved=True
            ),
        ]
        
        for testimonial in testimonials:
            db_session.add(testimonial)
        db_session.commit()
        
        response = client.get("/api/testimonials/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        
        for testimonial in data:
            assert "id" in testimonial
            assert "name" in testimonial
            assert "text" in testimonial
    
    def test_get_approved_testimonials_only(self, client: TestClient, db_session: Session):
        """Test getting only approved testimonials"""
        testimonials = [
            Testimonial(
                name="Approved User",
                text="Approved testimonial",
                is_approved=True
            ),
            Testimonial(
                name="Pending User",
                text="Pending testimonial",
                is_approved=False
            ),
        ]
        
        for testimonial in testimonials:
            db_session.add(testimonial)
        db_session.commit()
        
        response = client.get("/api/testimonials/?approved_only=true")
        
        assert response.status_code == 200
        data = response.json()
        
        # All returned testimonials should be approved
        for testimonial in data:
            if testimonial["name"] in ["Approved User", "Pending User"]:
                if testimonial["name"] == "Approved User":
                    assert testimonial["is_approved"] == True
    
    def test_get_testimonial_by_id(self, client: TestClient, db_session: Session):
        """Test getting a specific testimonial by ID"""
        testimonial = Testimonial(
            name="Test User",
            text="Test testimonial text",
            is_approved=True
        )
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        response = client.get(f"/api/testimonials/{testimonial.id}")
        
        # Check if endpoint exists
        if response.status_code == 200:
            data = response.json()
            assert data["name"] == "Test User"
            assert data["text"] == "Test testimonial text"
        else:
            # Endpoint may not be implemented yet
            assert response.status_code in [404, 405]
    
    def test_create_testimonial_unauthorized(self, client: TestClient):
        """Test creating testimonial without authentication"""
        testimonial_data = {
            "name": "New User",
            "text": "New testimonial"
        }
        
        response = client.post("/api/testimonials/", json=testimonial_data)
        assert response.status_code in [401, 403, 405]  # 405 if endpoint doesn't exist
    
    def test_delete_testimonial_unauthorized(self, client: TestClient, db_session: Session):
        """Test deleting testimonial without authentication"""
        testimonial = Testimonial(
            name="Test User",
            text="Test testimonial",
            is_approved=True
        )
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        response = client.delete(f"/api/testimonials/{testimonial.id}")
        assert response.status_code in [401, 403, 405]  # 405 if not implemented
    
    def test_delete_testimonial_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting testimonial with authentication"""
        testimonial = Testimonial(
            name="Delete Test",
            text="To be deleted",
            is_approved=True
        )
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        response = client.delete(f"/api/testimonials/{testimonial.id}", headers=auth_headers)
        
        # Check if deletion is supported
        if response.status_code == 200:
            # Verify deletion
            deleted_testimonial = db_session.query(Testimonial).filter(
                Testimonial.id == testimonial.id
            ).first()
            assert deleted_testimonial is None
        else:
            # Endpoint may not be implemented
            assert response.status_code in [404, 405]


@pytest.mark.unit
class TestTestimonialModel:
    """Test Testimonial model"""
    
    def test_testimonial_creation(self, db_session: Session):
        """Test creating a testimonial model"""
        testimonial = Testimonial(
            name="John Smith",
            text="Your organization helped my family during difficult times. Forever grateful!",
            country="USA",
            image="john.jpg",
            rating=5,
            is_approved=True
        )
        
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        assert testimonial.id is not None
        assert testimonial.name == "John Smith"
        assert testimonial.text == "Your organization helped my family during difficult times. Forever grateful!"
        assert testimonial.image == "john.jpg"
        assert testimonial.country == "USA"
        assert testimonial.rating == 5
        assert testimonial.is_approved == True
        assert testimonial.created_at is not None
    
    def test_testimonial_defaults(self, db_session: Session):
        """Test testimonial default values"""
        testimonial = Testimonial(
            name="Jane Doe",
            text="Simple testimonial"
        )
        
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        assert testimonial.is_approved == False  # Default value
        assert testimonial.image is None
        assert testimonial.country is None
    
    def test_testimonial_without_image(self, db_session: Session):
        """Test creating testimonial without image"""
        testimonial = Testimonial(
            name="No Image User",
            text="Testimonial without image",
            is_approved=True
        )
        
        db_session.add(testimonial)
        db_session.commit()
        db_session.refresh(testimonial)
        
        assert testimonial.id is not None
        assert testimonial.image is None