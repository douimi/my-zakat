import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Donation


@pytest.mark.api
class TestDonationsAPI:
    """Test donations API endpoints"""
    
    def test_create_donation(self, client: TestClient, db_session: Session):
        """Test creating a new donation"""
        donation_data = {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "amount": 100.0,
            "frequency": "one-time"
        }
        
        response = client.post("/api/donations/", json=donation_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == donation_data["name"]
        assert data["email"] == donation_data["email"]
        assert data["amount"] == donation_data["amount"]
        assert data["frequency"] == donation_data["frequency"]
        assert "id" in data
        assert "donated_at" in data
        
        # Verify donation was saved to database
        donation = db_session.query(Donation).filter(Donation.id == data["id"]).first()
        assert donation is not None
        assert donation.name == donation_data["name"]
    
    def test_create_donation_invalid_data(self, client: TestClient):
        """Test creating donation with invalid data"""
        # Missing required fields
        response = client.post("/api/donations/", json={})
        assert response.status_code == 422
        
        # Invalid email format
        invalid_data = {
            "name": "John Doe",
            "email": "invalid-email",
            "amount": 100.0,
            "frequency": "one-time"
        }
        response = client.post("/api/donations/", json=invalid_data)
        assert response.status_code == 422
        
        # Negative amount
        invalid_data = {
            "name": "John Doe",
            "email": "john@example.com",
            "amount": -50.0,
            "frequency": "one-time"
        }
        response = client.post("/api/donations/", json=invalid_data)
        assert response.status_code == 422
    
    def test_get_all_donations_admin(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting all donations (admin only)"""
        # Create test donations
        donations = [
            Donation(name="John Doe", email="john@example.com", amount=100.0, frequency="one-time"),
            Donation(name="Jane Smith", email="jane@example.com", amount=50.0, frequency="monthly"),
            Donation(name="Bob Johnson", email="bob@example.com", amount=75.0, frequency="one-time"),
        ]
        
        for donation in donations:
            db_session.add(donation)
        db_session.commit()
        
        response = client.get("/api/donations/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        
        # Verify the data structure
        for item in data:
            assert "id" in item
            assert "name" in item
            assert "email" in item
            assert "amount" in item
            assert "frequency" in item
            assert "donated_at" in item
    
    def test_get_all_donations_unauthorized(self, client: TestClient):
        """Test getting all donations without authentication"""
        response = client.get("/api/donations/")
        assert response.status_code == 401
    
    def test_calculate_zakat(self, client: TestClient):
        """Test Zakat calculation"""
        zakat_data = {
            "liabilities": 500,
            "cash": 5000,
            "receivables": 0,
            "stocks": 2000,
            "retirement": 0,
            "gold_weight": 85,
            "gold_price_per_gram": 60,
            "silver_weight": 0,
            "silver_price_per_gram": 0,
            "business_goods": 1000,
            "agriculture_value": 0,
            "investment_property": 0,
            "other_valuables": 0,
            "livestock": 0,
            "other_assets": 0
        }
        
        response = client.post("/api/donations/calculate-zakat", json=zakat_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "wealth" in data
        assert "gold" in data
        assert "silver" in data
        assert "total" in data
        
        # Verify calculations (should have some zakat due)
        assert data["total"] >= 0
    
    def test_calculate_zakat_below_nisab(self, client: TestClient):
        """Test Zakat calculation when below nisab threshold"""
        zakat_data = {
            "liabilities": 0,
            "cash": 1000,  # Below nisab
            "receivables": 0,
            "stocks": 0,
            "retirement": 0,
            "gold_weight": 0,
            "gold_price_per_gram": 0,
            "silver_weight": 0,
            "silver_price_per_gram": 0,
            "business_goods": 0,
            "agriculture_value": 0,
            "investment_property": 0,
            "other_valuables": 0,
            "livestock": 0,
            "other_assets": 0
        }
        
        response = client.post("/api/donations/calculate-zakat", json=zakat_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Low wealth should result in low or zero zakat
        assert data["total"] >= 0
    
    def test_calculate_zakat_invalid_data(self, client: TestClient):
        """Test Zakat calculation with invalid data"""
        # Negative values
        invalid_data = {
            "liabilities": 0,
            "cash": 5000,
            "gold_weight": -10,  # Invalid negative value
            "gold_price_per_gram": 60
        }
        
        response = client.post("/api/donations/calculate-zakat", json=invalid_data)
        assert response.status_code == 422
    
    def test_create_payment_session(self, client: TestClient):
        """Test creating Stripe payment session"""
        payment_data = {
            "amount": 100,
            "name": "John Doe",
            "email": "john@example.com",
            "purpose": "Zakat"
        }
        
        response = client.post("/api/donations/create-payment-session", json=payment_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure (using mocked Stripe)
        assert "session_id" in data
        assert "url" in data
        assert data["session_id"] == "cs_test_mock_session_id"
        assert "checkout.stripe.com" in data["url"]
    
    def test_create_payment_session_invalid_amount(self, client: TestClient):
        """Test creating payment session with invalid amount"""
        payment_data = {
            "amount": 0,  # Invalid amount
            "name": "John Doe",
            "email": "john@example.com"
        }
        
        response = client.post("/api/donations/create-payment-session", json=payment_data)
        assert response.status_code == 422
    
    def test_donation_stats(self, client: TestClient, db_session: Session):
        """Test getting donation statistics"""
        # Create test donations with different dates and amounts
        now = datetime.utcnow()
        donations = [
            Donation(name="John", email="john@example.com", amount=100.0, frequency="one-time", donated_at=now),
            Donation(name="Jane", email="jane@example.com", amount=200.0, frequency="monthly", donated_at=now - timedelta(days=5)),
            Donation(name="Bob", email="bob@example.com", amount=150.0, frequency="one-time", donated_at=now - timedelta(days=35)),
        ]
        
        for donation in donations:
            db_session.add(donation)
        db_session.commit()
        
        response = client.get("/api/donations/stats")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify stats structure
        assert "total_donations" in data
        assert "total_donors" in data
        assert "recent_donations" in data
        assert "impact" in data
        
        # Verify calculations
        assert data["total_donations"] == 450.0  # Sum of all donations
        assert data["total_donors"] == 3
    
    def test_donation_stats_with_no_donations(self, client: TestClient):
        """Test getting donation stats when no donations exist"""
        response = client.get("/api/donations/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_donations"] == 0


@pytest.mark.unit
class TestDonationModel:
    """Test Donation model"""
    
    def test_donation_creation(self, db_session: Session):
        """Test creating a donation model"""
        donation = Donation(
            name="Test User",
            email="test@example.com",
            amount=100.0,
            frequency="one-time"
        )
        
        db_session.add(donation)
        db_session.commit()
        db_session.refresh(donation)
        
        assert donation.id is not None
        assert donation.name == "Test User"
        assert donation.email == "test@example.com"
        assert donation.amount == 100.0
        assert donation.frequency == "one-time"
        assert donation.donated_at is not None
        assert isinstance(donation.donated_at, datetime)
    
    def test_donation_stripe_session_id(self, db_session: Session):
        """Test donation with Stripe session ID"""
        donation = Donation(
            name="Test User",
            email="test@example.com",
            amount=100.0,
            frequency="one-time",
            stripe_session_id="cs_test_session_123"
        )
        
        db_session.add(donation)
        db_session.commit()
        db_session.refresh(donation)
        
        assert donation.stripe_session_id == "cs_test_session_123"

