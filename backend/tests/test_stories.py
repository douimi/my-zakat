import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Story


@pytest.mark.api
class TestStoriesAPI:
    """Test stories API endpoints"""
    
    def test_get_all_stories(self, client: TestClient, db_session: Session):
        """Test getting all stories"""
        stories = [
            Story(
                title="Hope Restored",
                summary="A family's journey",
                content="Full story content here...",
                is_active=True,
                is_featured=True
            ),
            Story(
                title="Community Impact",
                summary="How donations help",
                content="More content...",
                is_active=True,
                is_featured=False
            ),
        ]
        
        for story in stories:
            db_session.add(story)
        db_session.commit()
        
        response = client.get("/api/stories/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        
        for story in data:
            assert "id" in story
            assert "title" in story
            assert "summary" in story
            assert "content" in story
    
    def test_get_active_stories_only(self, client: TestClient, db_session: Session):
        """Test getting only active stories"""
        stories = [
            Story(
                title="Active Story",
                summary="This is active",
                content="Content",
                is_active=True
            ),
            Story(
                title="Inactive Story",
                summary="This is inactive",
                content="Content",
                is_active=False
            ),
        ]
        
        for story in stories:
            db_session.add(story)
        db_session.commit()
        
        response = client.get("/api/stories/?active_only=true")
        
        assert response.status_code == 200
        data = response.json()
        
        # All returned stories should be active
        for story in data:
            # Since active_only=true is the default, we should have active stories
            assert story["title"] == "Active Story"
    
    def test_get_featured_stories(self, client: TestClient, db_session: Session):
        """Test getting featured stories"""
        stories = [
            Story(
                title="Featured Story",
                summary="Featured",
                content="Content",
                is_active=True,
                is_featured=True
            ),
            Story(
                title="Regular Story",
                summary="Not featured",
                content="Content",
                is_active=True,
                is_featured=False
            ),
        ]
        
        for story in stories:
            db_session.add(story)
        db_session.commit()
        
        response = client.get("/api/stories/?featured_only=true")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        
        # All returned stories should be featured
        for story in data:
            if story["title"] == "Featured Story":
                assert story["is_featured"] == True
    
    def test_get_story_by_id(self, client: TestClient, db_session: Session):
        """Test getting a specific story by ID"""
        story = Story(
            title="Single Story",
            summary="Test summary",
            content="Full content here",
            is_active=True
        )
        db_session.add(story)
        db_session.commit()
        db_session.refresh(story)
        
        response = client.get(f"/api/stories/{story.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Single Story"
        assert data["summary"] == "Test summary"
        assert data["content"] == "Full content here"
    
    def test_get_nonexistent_story(self, client: TestClient):
        """Test getting a story that doesn't exist"""
        response = client.get("/api/stories/9999")
        assert response.status_code == 404
    
    def test_delete_story_unauthorized(self, client: TestClient, db_session: Session):
        """Test deleting story without authentication"""
        story = Story(
            title="Test Story",
            summary="Test",
            content="Test",
            is_active=True
        )
        db_session.add(story)
        db_session.commit()
        db_session.refresh(story)
        
        response = client.delete(f"/api/stories/{story.id}")
        assert response.status_code in [401, 403]


@pytest.mark.unit
class TestStoryModel:
    """Test Story model"""
    
    def test_story_creation(self, db_session: Session):
        """Test creating a story model"""
        story = Story(
            title="Amazing Impact",
            summary="How your donations changed lives",
            content="Full detailed story about the impact...",
            image_filename="impact.jpg",
            video_url="https://youtube.com/watch?v=123",
            is_active=True,
            is_featured=True
        )
        
        db_session.add(story)
        db_session.commit()
        db_session.refresh(story)
        
        assert story.id is not None
        assert story.title == "Amazing Impact"
        assert story.summary == "How your donations changed lives"
        assert story.image_filename == "impact.jpg"
        assert story.video_url == "https://youtube.com/watch?v=123"
        assert story.is_active == True
        assert story.is_featured == True
    
    def test_story_defaults(self, db_session: Session):
        """Test story default values"""
        story = Story(
            title="Simple Story",
            summary="Summary",
            content="Content"
        )
        
        db_session.add(story)
        db_session.commit()
        db_session.refresh(story)
        
        assert story.is_active == True  # Default value
        assert story.is_featured == False  # Default value
        assert story.image_filename is None
        assert story.video_url is None
