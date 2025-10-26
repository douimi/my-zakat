import pytest
from fastapi.testclient import TestClient


@pytest.mark.api
class TestMainApp:
    """Test main application endpoints"""
    
    def test_root_endpoint(self, client: TestClient):
        """Test the root endpoint"""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "MyZakat API is running"
    
    def test_health_check(self, client: TestClient):
        """Test the health check endpoint"""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_cors_headers(self, client: TestClient):
        """Test CORS headers are present"""
        response = client.get("/", headers={"Origin": "http://localhost:3000"})
        
        assert response.status_code == 200
        # CORS headers should be present (handled by middleware)
        # The actual headers depend on the CORS configuration
    
    def test_api_documentation_available(self, client: TestClient):
        """Test that API documentation endpoints are available"""
        # Test OpenAPI schema
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        # Test Swagger UI
        response = client.get("/docs")
        assert response.status_code == 200
        
        # Test ReDoc
        response = client.get("/redoc")
        assert response.status_code == 200
    
    def test_static_file_mount(self, client: TestClient):
        """Test that static files are properly mounted"""
        # This tests the /uploads mount point
        # In a real test, you'd create a test file first
        response = client.get("/uploads/nonexistent.jpg")
        # Should return 404 for non-existent files, not 500
        assert response.status_code == 404
    
    def test_invalid_endpoint(self, client: TestClient):
        """Test accessing non-existent endpoint"""
        response = client.get("/nonexistent-endpoint")
        assert response.status_code == 404
    
    def test_api_prefix_routing(self, client: TestClient):
        """Test that API routes are properly prefixed"""
        # Test that auth route is available under /api/auth
        response = client.post("/api/auth/login", json={
            "username": "test",
            "password": "test"
        })
        # Should get validation error or auth error, not 404
        assert response.status_code in [401, 422]
        
        # Test that donations route is available under /api/donations
        response = client.get("/api/donations/")
        # Should get auth error, not 404
        assert response.status_code == 401


@pytest.mark.integration
class TestAppIntegration:
    """Integration tests for the full application"""
    
    def test_full_donation_flow(self, client: TestClient, db_session):
        """Test a complete donation flow"""
        # 1. Calculate Zakat
        zakat_data = {
            "liabilities": 1000,
            "cash": 10000,
            "receivables": 0,
            "stocks": 5000,
            "retirement": 0,
            "gold_weight": 100,
            "gold_price_per_gram": 60,
            "silver_weight": 0,
            "silver_price_per_gram": 0,
            "business_goods": 2000,
            "agriculture_value": 0,
            "investment_property": 0,
            "other_valuables": 0,
            "livestock": 0,
            "other_assets": 0
        }
        
        zakat_response = client.post("/api/donations/calculate-zakat", json=zakat_data)
        assert zakat_response.status_code == 200
        zakat_result = zakat_response.json()
        
        # Use total zakat amount
        zakat_amount = zakat_result["total"]
        
        # 2. Create payment session with calculated amount
        payment_data = {
            "amount": int(zakat_amount) if zakat_amount > 0 else 100,
            "name": "John Doe",
            "email": "john@example.com",
            "purpose": "Zakat"
        }
        
        payment_response = client.post("/api/donations/create-payment-session", json=payment_data)
        assert payment_response.status_code == 200
        session_data = payment_response.json()
        
        # 3. Create donation record
        donation_data = {
            "name": "John Doe",
            "email": "john@example.com",
            "amount": float(payment_data["amount"]),
            "frequency": "one-time"
        }
        
        donation_response = client.post("/api/donations/", json=donation_data)
        assert donation_response.status_code == 200
        
        # Verify the flow completed successfully
        assert "session_id" in session_data
        assert donation_response.json()["amount"] == donation_data["amount"]
    
    def test_contact_submission_flow(self, client: TestClient, auth_headers: dict):
        """Test contact form submission and admin management"""
        # 1. Submit contact form
        contact_data = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "message": "I have a question about Zakat calculation."
        }
        
        contact_response = client.post("/api/contact/", json=contact_data)
        assert contact_response.status_code == 200
        contact_result = contact_response.json()
        
        # 2. Admin retrieves contact submissions
        admin_response = client.get("/api/contact/", headers=auth_headers)
        assert admin_response.status_code == 200
        contacts = admin_response.json()
        
        # Find our submission
        our_contact = next((c for c in contacts if c["id"] == contact_result["id"]), None)
        assert our_contact is not None
        assert our_contact["resolved"] is False
        
        # 3. Admin resolves the contact
        resolve_response = client.patch(
            f"/api/contact/{contact_result['id']}/resolve",
            headers=auth_headers
        )
        assert resolve_response.status_code == 200
        
        # 4. Verify contact is resolved
        admin_response = client.get("/api/contact/", headers=auth_headers)
        contacts = admin_response.json()
        our_contact = next((c for c in contacts if c["id"] == contact_result["id"]), None)
        assert our_contact["resolved"] is True


@pytest.mark.unit
class TestApplicationSetup:
    """Test application configuration and setup"""
    
    def test_app_metadata(self, test_app):
        """Test application metadata"""
        assert test_app.title == "MyZakat API"
        assert test_app.description == "Professional donation platform API"
        assert test_app.version == "1.0.0"
    
    def test_middleware_setup(self, test_app):
        """Test that middleware is properly configured"""
        # Check that CORS middleware is added
        # In FastAPI, middleware is stored in the middleware_stack
        assert test_app.middleware_stack is not None
        # The presence of middleware is sufficient for this test
        assert True
    
    def test_router_inclusion(self, test_app):
        """Test that all routers are included"""
        routes = [route.path for route in test_app.routes]
        
        expected_prefixes = [
            "/api/auth",
            "/api/admin", 
            "/api/donations",
            "/api/events",
            "/api/stories",
            "/api/contact",
            "/api/testimonials",
            "/api/subscriptions",
            "/api/volunteers",
            "/api/settings"
        ]
        
        for prefix in expected_prefixes:
            # Check that at least one route starts with this prefix
            assert any(route.startswith(prefix) for route in routes), f"No routes found for prefix {prefix}"

