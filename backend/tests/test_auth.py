import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import User
from auth_utils import create_access_token, verify_token


@pytest.mark.auth
class TestAuthUtils:
    """Test authentication utilities"""
    
    def test_access_token_creation_and_verification(self):
        """Test JWT token creation and verification"""
        username = "testuser"
        token = create_access_token(data={"sub": username})
        
        # Token should be a string
        assert isinstance(token, str)
        assert token != ""
        
        # Token should be verifiable
        payload = verify_token(token)
        assert payload is not None
        assert payload == username
    
    def test_invalid_token_verification(self):
        """Test verification of invalid tokens"""
        # Test with invalid token
        invalid_token = "invalid.token.here"
        payload = verify_token(invalid_token)
        assert payload is None
        
        # Test with empty token
        payload = verify_token("")
        assert payload is None


@pytest.mark.auth
@pytest.mark.api
class TestAuthAPI:
    """Test authentication API endpoints"""
    
    def test_login_success(self, client: TestClient, admin_user: User):
        """Test successful login"""
        response = client.post(
            "/api/auth/login",
            json={"email": "testadmin@example.com", "password": "testpass"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_username(self, client: TestClient, admin_user: User):
        """Test login with invalid email"""
        response = client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "testpass"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert "Incorrect email or password" in data["detail"]
    
    def test_login_invalid_password(self, client: TestClient, admin_user: User):
        """Test login with invalid password"""
        response = client.post(
            "/api/auth/login",
            json={"email": "testadmin@example.com", "password": "wrongpassword"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert "Incorrect email or password" in data["detail"]
    
    def test_login_missing_credentials(self, client: TestClient):
        """Test login with missing credentials"""
        # Missing password
        response = client.post(
            "/api/auth/login",
            json={"email": "testadmin@example.com"}
        )
        assert response.status_code == 422  # Validation error
        
        # Missing email
        response = client.post(
            "/api/auth/login",
            json={"password": "testpass"}
        )
        assert response.status_code == 422  # Validation error
        
        # Empty request
        response = client.post("/api/auth/login", json={})
        assert response.status_code == 422  # Validation error
    
    def test_protected_endpoint_without_token(self, client: TestClient):
        """Test accessing protected endpoint without token"""
        response = client.get("/api/admin/dashboard")
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden
    
    def test_protected_endpoint_with_invalid_token(self, client: TestClient):
        """Test accessing protected endpoint with invalid token"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = client.get("/api/admin/dashboard", headers=headers)
        assert response.status_code == 401
    
    def test_protected_endpoint_with_valid_token(self, client: TestClient, auth_headers: dict):
        """Test accessing protected endpoint with valid token"""
        response = client.get("/api/admin/dashboard", headers=auth_headers)
        assert response.status_code == 200
    
    def test_token_expiration_simulation(self, client: TestClient, admin_user: User):
        """Test token behavior (in real scenarios, tokens would expire)"""
        # Login to get token
        response = client.post(
            "/api/auth/login",
            json={"email": "testadmin@example.com", "password": "testpass"}
        )
        token = response.json()["access_token"]
        
        # Use token immediately (should work)
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/admin/dashboard", headers=headers)
        assert response.status_code == 200
        
        # In a real scenario with shorter expiration times,
        # we would test token expiration here

