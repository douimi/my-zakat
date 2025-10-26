import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Setting


@pytest.mark.api
class TestSettingsAPI:
    """Test settings API endpoints"""
    
    def test_get_all_settings_unauthorized(self, client: TestClient):
        """Test getting settings without authentication"""
        response = client.get("/api/settings/")
        # Settings might be public or require auth depending on implementation
        # Adjust based on actual requirements
        assert response.status_code in [200, 401, 403]
    
    def test_get_all_settings_authorized(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting all settings with authentication"""
        settings = [
            Setting(key="site_name", value="MyZakat", description="Site name"),
            Setting(key="contact_email", value="info@myzakat.org", description="Contact email"),
        ]
        
        for setting in settings:
            db_session.add(setting)
        db_session.commit()
        
        response = client.get("/api/settings/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        
        for setting in data:
            assert "key" in setting
            assert "value" in setting
    
    def test_get_setting_by_key(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test getting a specific setting by key"""
        setting = Setting(
            key="test_setting",
            value="test_value",
            description="Test description"
        )
        db_session.add(setting)
        db_session.commit()
        
        response = client.get("/api/settings/test_setting", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "test_setting"
        assert data["value"] == "test_value"
    
    def test_get_nonexistent_setting(self, client: TestClient, auth_headers: dict):
        """Test getting a setting that doesn't exist"""
        response = client.get("/api/settings/nonexistent_key", headers=auth_headers)
        assert response.status_code == 404
    
    def test_create_setting(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test creating a new setting"""
        setting_data = {
            "key": "new_setting",
            "value": "new_value",
            "description": "A new setting"
        }
        
        response = client.post("/api/settings/", json=setting_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "new_setting"
        assert data["value"] == "new_value"
    
    def test_create_setting_unauthorized(self, client: TestClient):
        """Test creating setting without authentication"""
        setting_data = {
            "key": "test",
            "value": "test"
        }
        
        response = client.post("/api/settings/", json=setting_data)
        assert response.status_code in [401, 403]
    
    def test_update_setting(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test updating an existing setting"""
        setting = Setting(
            key="update_test",
            value="old_value",
            description="Test"
        )
        db_session.add(setting)
        db_session.commit()
        
        update_data = {
            "value": "new_value",
            "description": "Updated description"
        }
        
        response = client.put(
            f"/api/settings/{setting.key}",
            json=update_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["value"] == "new_value"
        assert data["description"] == "Updated description"
    
    def test_update_nonexistent_setting(self, client: TestClient, auth_headers: dict):
        """Test updating a setting that doesn't exist"""
        update_data = {
            "value": "new_value"
        }
        
        response = client.put(
            "/api/settings/nonexistent",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_setting(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting a setting"""
        setting = Setting(
            key="delete_test",
            value="test",
            description="Test"
        )
        db_session.add(setting)
        db_session.commit()
        
        response = client.delete(f"/api/settings/{setting.key}", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify deletion
        deleted_setting = db_session.query(Setting).filter(
            Setting.key == "delete_test"
        ).first()
        assert deleted_setting is None


@pytest.mark.unit
class TestSettingModel:
    """Test Setting model"""
    
    def test_setting_creation(self, db_session: Session):
        """Test creating a setting model"""
        setting = Setting(
            key="theme_color",
            value="#3B82F6",
            description="Primary theme color"
        )
        
        db_session.add(setting)
        db_session.commit()
        db_session.refresh(setting)
        
        assert setting.key == "theme_color"
        assert setting.value == "#3B82F6"
        assert setting.description == "Primary theme color"
    
    def test_setting_without_description(self, db_session: Session):
        """Test creating setting without description"""
        setting = Setting(
            key="simple_key",
            value="simple_value"
        )
        
        db_session.add(setting)
        db_session.commit()
        db_session.refresh(setting)
        
        assert setting.key == "simple_key"
        assert setting.value == "simple_value"
        assert setting.description is None
    
    def test_setting_unique_key(self, db_session: Session):
        """Test that setting keys are unique"""
        setting1 = Setting(key="unique_test", value="value1")
        db_session.add(setting1)
        db_session.commit()
        
        # Try to create another setting with same key
        setting2 = Setting(key="unique_test", value="value2")
        db_session.add(setting2)
        
        with pytest.raises(Exception):  # Should raise integrity error
            db_session.commit()
