import pytest
import os

# Set testing mode BEFORE importing main to prevent database initialization
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database import Base, get_db
from models import User, Setting
from auth_utils import get_password_hash

# Test database URL - use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
    },
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override the database dependency to use test database"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Set up test database tables once for the session"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="session")
def test_app():
    """Create a test FastAPI application"""
    # Override the database dependency
    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture(scope="session")
def client(test_app):
    """Create a test client"""
    with TestClient(test_app) as test_client:
        yield test_client


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test"""
    db = TestingSessionLocal()
    try:
        yield db
        # Rollback any uncommitted changes
        db.rollback()
    finally:
        # Clean up all data after each test
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
        db.close()


@pytest.fixture(scope="function")
def admin_user(db_session):
    """Create a test admin user"""
    # Use a simple password that's short enough for bcrypt
    test_password = "testpass"
    admin = User(
        email="testadmin@example.com",
        password=get_password_hash(test_password),
        name="Test Admin",
        is_active=True,
        is_admin=True
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    # Store the plain password for testing
    admin._test_password = test_password
    return admin


@pytest.fixture(scope="function")
def auth_headers(client, admin_user):
    """Get authentication headers for admin user"""
    response = client.post(
        "/api/auth/login",
        json={"email": "testadmin@example.com", "password": "testpass"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def sample_settings(db_session):
    """Create sample settings for testing"""
    settings = [
        Setting(key="meals_provided", value="25000", description="Total meals provided"),
        Setting(key="families_supported", value="1200", description="Families supported"),
        Setting(key="total_raised", value="500000", description="Total amount raised"),
    ]
    
    for setting in settings:
        db_session.add(setting)
    db_session.commit()
    
    return settings


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Set up test environment variables"""
    monkeypatch.setenv("TESTING", "true")
    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-testing")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake_key")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_fake_key")
    monkeypatch.setenv("DATABASE_URL", SQLALCHEMY_DATABASE_URL)


# Mock external services for testing
@pytest.fixture(autouse=True)
def mock_stripe(monkeypatch):
    """Mock Stripe API calls"""
    import stripe
    
    class MockStripeSession:
        def __init__(self, **kwargs):
            self.id = "cs_test_mock_session_id"
            self.url = "https://checkout.stripe.com/pay/cs_test_mock_session_id"
            self.payment_status = "unpaid"
    
    class MockStripeCustomer:
        def __init__(self, **kwargs):
            self.id = "cus_test_mock_customer_id"
            self.email = kwargs.get('email', 'test@example.com')
    
    class MockStripeSubscription:
        def __init__(self, **kwargs):
            self.id = "sub_test_mock_subscription_id"
            self.status = "active"
            self.customer = "cus_test_mock_customer_id"
    
    def mock_session_create(**kwargs):
        return MockStripeSession(**kwargs)
    
    def mock_customer_create(**kwargs):
        return MockStripeCustomer(**kwargs)
    
    def mock_subscription_create(**kwargs):
        return MockStripeSubscription(**kwargs)
    
    def mock_subscription_retrieve(subscription_id):
        return MockStripeSubscription(id=subscription_id)
    
    def mock_subscription_delete(subscription_id):
        return {"id": subscription_id, "status": "canceled"}
    
    monkeypatch.setattr("stripe.checkout.Session.create", mock_session_create)
    monkeypatch.setattr("stripe.Customer.create", mock_customer_create)
    monkeypatch.setattr("stripe.Subscription.create", mock_subscription_create)
    monkeypatch.setattr("stripe.Subscription.retrieve", mock_subscription_retrieve)
    monkeypatch.setattr("stripe.Subscription.delete", mock_subscription_delete)

