import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Subscription


@pytest.mark.api
class TestSubscriptionsAPI:
    """Test subscriptions API endpoints"""
    
    def test_create_subscription(self, client: TestClient, db_session: Session):
        """Test creating a newsletter subscription"""
        subscription_data = {
            "email": "subscriber@example.com",
            "name": "Test Subscriber"
        }
        
        response = client.post("/api/subscriptions/", json=subscription_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "subscriber@example.com"
        assert "id" in data
        assert "subscribed_at" in data
    
    def test_create_subscription_email_only(self, client: TestClient):
        """Test creating subscription with email only"""
        subscription_data = {
            "email": "minimal@example.com"
        }
        
        response = client.post("/api/subscriptions/", json=subscription_data)
        assert response.status_code in [200, 422]  # May require name
    
    def test_create_subscription_invalid_email(self, client: TestClient):
        """Test creating subscription with invalid email"""
        subscription_data = {
            "email": "invalid-email",
            "name": "Test"
        }
        
        response = client.post("/api/subscriptions/", json=subscription_data)
        assert response.status_code == 422
    
    def test_create_duplicate_subscription(self, client: TestClient, db_session: Session):
        """Test creating duplicate subscription"""
        email = "duplicate@example.com"
        
        # Create first subscription
        sub_data = {"email": email, "name": "User 1"}
        response1 = client.post("/api/subscriptions/", json=sub_data)
        assert response1.status_code == 200
        
        # Try to create duplicate
        sub_data2 = {"email": email, "name": "User 2"}
        response2 = client.post("/api/subscriptions/", json=sub_data2)
        # Should either succeed (idempotent) or return error
        assert response2.status_code in [200, 400, 409]
    
    def test_get_all_subscriptions_unauthorized(self, client: TestClient):
        """Test getting subscriptions without authentication"""
        response = client.get("/api/subscriptions/")
        assert response.status_code in [401, 403]
    
    def test_get_all_subscriptions_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting all subscriptions with authentication"""
        subscriptions = [
            Subscription(email="sub1@example.com", name="Sub 1"),
            Subscription(email="sub2@example.com", name="Sub 2"),
            Subscription(email="sub3@example.com", name="Sub 3"),
        ]
        
        for subscription in subscriptions:
            db_session.add(subscription)
        db_session.commit()
        
        response = client.get("/api/subscriptions/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 3
        
        for subscription in data:
            assert "id" in subscription
            assert "email" in subscription
            assert "subscribed_at" in subscription
    
    def test_delete_subscription(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting a subscription"""
        subscription = Subscription(email="delete@example.com", name="Delete Me")
        db_session.add(subscription)
        db_session.commit()
        db_session.refresh(subscription)
        
        response = client.delete(f"/api/subscriptions/{subscription.id}", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify deletion
        deleted_sub = db_session.query(Subscription).filter(
            Subscription.id == subscription.id
        ).first()
        assert deleted_sub is None
    
    def test_delete_nonexistent_subscription(self, client: TestClient, auth_headers: dict):
        """Test deleting a subscription that doesn't exist"""
        response = client.delete("/api/subscriptions/9999", headers=auth_headers)
        assert response.status_code == 404


@pytest.mark.unit
class TestSubscriptionModel:
    """Test Subscription model"""
    
    def test_subscription_creation(self, db_session: Session):
        """Test creating a subscription model"""
        subscription = Subscription(
            email="newsletter@example.com",
            name="Newsletter User",
            phone="+1234567890",
            wants_email=True,
            wants_sms=True
        )
        
        db_session.add(subscription)
        db_session.commit()
        db_session.refresh(subscription)
        
        assert subscription.id is not None
        assert subscription.email == "newsletter@example.com"
        assert subscription.name == "Newsletter User"
        assert subscription.wants_email == True
        assert subscription.wants_sms == True
        assert subscription.subscribed_at is not None
    
    def test_subscription_defaults(self, db_session: Session):
        """Test subscription default values"""
        subscription = Subscription(
            email="defaults@example.com"
        )
        
        db_session.add(subscription)
        db_session.commit()
        db_session.refresh(subscription)
        
        assert subscription.wants_email == True  # Default
        assert subscription.wants_sms == False  # Default
    
    def test_multiple_subscriptions(self, db_session: Session):
        """Test creating multiple subscriptions"""
        emails = ["user1@example.com", "user2@example.com", "user3@example.com"]
        
        for email in emails:
            subscription = Subscription(email=email)
            db_session.add(subscription)
        
        db_session.commit()
        
        # Verify all were created
        all_subs = db_session.query(Subscription).all()
        assert len([s for s in all_subs if s.email in emails]) == 3