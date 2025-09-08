from flask import request
from flask_restful import Resource
from datetime import datetime
from app import db
from models import Event

class EventList(Resource):
    def get(self):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        events = Event.query.order_by(Event.date.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return {
            'events': [e.to_dict() for e in events.items],
            'total': events.total,
            'pages': events.pages,
            'current_page': page
        }, 200

class EventDetail(Resource):
    def get(self, event_id):
        event = Event.query.get_or_404(event_id)
        return event.to_dict(), 200

class UpcomingEvents(Resource):
    def get(self):
        limit = request.args.get('limit', 6, type=int)
        
        events = Event.query.filter(
            Event.date >= datetime.utcnow()
        ).order_by(Event.date.asc()).limit(limit).all()
        
        return {
            'events': [e.to_dict() for e in events],
            'count': len(events)
        }, 200
