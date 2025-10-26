import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Event


@pytest.mark.api
class TestEventsAPI:
    """Test events API endpoints"""
    
    def test_get_all_events(self, client: TestClient, db_session: Session):
        """Test getting all events"""
        # Create test events
        future_date = datetime.utcnow() + timedelta(days=30)
        past_date = datetime.utcnow() - timedelta(days=30)
        
        events = [
            Event(
                title="Future Event",
                description="A future event",
                date=future_date,
                location="City Hall",
                image="event1.jpg"
            ),
            Event(
                title="Past Event",
                description="A past event",
                date=past_date,
                location="Community Center",
                image="event2.jpg"
            ),
        ]
        
        for event in events:
            db_session.add(event)
        db_session.commit()
        
        response = client.get("/api/events/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        
        # Verify structure
        for event in data:
            assert "id" in event
            assert "title" in event
            assert "description" in event
            assert "date" in event
            assert "location" in event
    
    def test_get_upcoming_events_only(self, client: TestClient, db_session: Session):
        """Test getting only upcoming events"""
        future_date = datetime.utcnow() + timedelta(days=30)
        past_date = datetime.utcnow() - timedelta(days=30)
        
        events = [
            Event(
                title="Future Event",
                description="A future event",
                date=future_date,
                location="City Hall"
            ),
            Event(
                title="Past Event",
                description="A past event",
                date=past_date,
                location="Community Center"
            ),
        ]
        
        for event in events:
            db_session.add(event)
        db_session.commit()
        
        response = client.get("/api/events/?upcoming_only=true")
        
        assert response.status_code == 200
        data = response.json()
        # Should only return future events
        assert len(data) >= 1
        for event in data:
            event_date = datetime.fromisoformat(event["date"].replace('Z', '+00:00'))
            assert event_date >= datetime.utcnow().replace(tzinfo=event_date.tzinfo)
    
    def test_get_event_by_id(self, client: TestClient, db_session: Session):
        """Test getting a specific event by ID"""
        event = Event(
            title="Test Event",
            description="Test Description",
            date=datetime.utcnow() + timedelta(days=10),
            location="Test Location"
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        response = client.get(f"/api/events/{event.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Event"
        assert data["description"] == "Test Description"
        assert data["location"] == "Test Location"
    
    def test_get_nonexistent_event(self, client: TestClient):
        """Test getting an event that doesn't exist"""
        response = client.get("/api/events/9999")
        assert response.status_code == 404
    
    def test_delete_event_unauthorized(self, client: TestClient, db_session: Session):
        """Test deleting event without authentication"""
        event = Event(
            title="Test Event",
            description="Test",
            date=datetime.utcnow(),
            location="Test"
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        response = client.delete(f"/api/events/{event.id}")
        assert response.status_code in [401, 403]
    
    def test_delete_event_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting event with authentication"""
        event = Event(
            title="Test Event",
            description="Test",
            date=datetime.utcnow(),
            location="Test"
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        response = client.delete(f"/api/events/{event.id}", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify event was deleted
        deleted_event = db_session.query(Event).filter(Event.id == event.id).first()
        assert deleted_event is None


@pytest.mark.unit
class TestEventModel:
    """Test Event model"""
    
    def test_event_creation(self, db_session: Session):
        """Test creating an event model"""
        event = Event(
            title="Community Iftar",
            description="Join us for a community iftar",
            date=datetime.utcnow() + timedelta(days=7),
            location="Masjid Al-Noor",
            image="iftar.jpg"
        )
        
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        assert event.id is not None
        assert event.title == "Community Iftar"
        assert event.description == "Join us for a community iftar"
        assert event.location == "Masjid Al-Noor"
        assert event.image == "iftar.jpg"
        assert isinstance(event.created_at, datetime)
    
    def test_event_without_image(self, db_session: Session):
        """Test creating event without an image"""
        event = Event(
            title="No Image Event",
            description="Event without image",
            date=datetime.utcnow(),
            location="Somewhere"
        )
        
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        assert event.id is not None
        assert event.image is None
