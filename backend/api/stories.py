from flask import request
from flask_restful import Resource
from app import db
from models import Story

class StoryList(Resource):
    def get(self):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 12, type=int)
        category = request.args.get('category', None)
        
        query = Story.query.filter_by(is_active=True)
        
        if category:
            query = query.filter_by(category=category)
        
        stories = query.order_by(Story.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return {
            'stories': [s.to_dict() for s in stories.items],
            'total': stories.total,
            'pages': stories.pages,
            'current_page': page
        }, 200

class StoryDetail(Resource):
    def get(self, story_id):
        story = Story.query.get_or_404(story_id)
        
        # Increment view count
        story.view_count = (story.view_count or 0) + 1
        db.session.commit()
        
        return story.to_dict(), 200

class FeaturedStories(Resource):
    def get(self):
        limit = request.args.get('limit', 5, type=int)
        
        stories = Story.query.filter_by(
            is_active=True,
            is_featured=True
        ).order_by(Story.created_at.desc()).limit(limit).all()
        
        # If no featured stories, get recent ones
        if not stories:
            stories = Story.query.filter_by(
                is_active=True
            ).order_by(Story.created_at.desc()).limit(limit).all()
        
        return {
            'stories': [s.to_dict() for s in stories],
            'count': len(stories)
        }, 200
