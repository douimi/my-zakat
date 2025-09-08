from flask import request
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app import db
from models import (
    Admin, Donation, Event, Story, Testimonial, 
    Volunteer, ContactSubmission, Subscription
)

class AdminDonations(Resource):
    @jwt_required()
    def get(self):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        donations = Donation.query.order_by(Donation.donated_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return {
            'donations': [d.to_dict() for d in donations.items],
            'total': donations.total,
            'pages': donations.pages,
            'current_page': page
        }, 200

class AdminEvents(Resource):
    @jwt_required()
    def get(self):
        events = Event.query.order_by(Event.date.desc()).all()
        return {'events': [e.to_dict() for e in events]}, 200
    
    @jwt_required()
    def post(self):
        data = request.get_json()
        
        required_fields = ['title', 'description', 'date', 'location']
        if not all(field in data for field in required_fields):
            return {'message': 'Missing required fields'}, 400
        
        try:
            event = Event(
                title=data['title'],
                description=data['description'],
                date=datetime.fromisoformat(data['date']),
                location=data['location'],
                image=data.get('image'),
                is_featured=data.get('is_featured', False),
                max_attendees=data.get('max_attendees'),
                registration_deadline=datetime.fromisoformat(data['registration_deadline']) if data.get('registration_deadline') else None
            )
            
            db.session.add(event)
            db.session.commit()
            
            return {'message': 'Event created', 'event': event.to_dict()}, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error creating event: {str(e)}'}, 500

class AdminEventDetail(Resource):
    @jwt_required()
    def get(self, event_id):
        event = Event.query.get_or_404(event_id)
        return event.to_dict(), 200
    
    @jwt_required()
    def put(self, event_id):
        event = Event.query.get_or_404(event_id)
        data = request.get_json()
        
        try:
            if 'title' in data:
                event.title = data['title']
            if 'description' in data:
                event.description = data['description']
            if 'date' in data:
                event.date = datetime.fromisoformat(data['date'])
            if 'location' in data:
                event.location = data['location']
            if 'image' in data:
                event.image = data['image']
            if 'is_featured' in data:
                event.is_featured = data['is_featured']
            if 'max_attendees' in data:
                event.max_attendees = data['max_attendees']
            if 'registration_deadline' in data:
                event.registration_deadline = datetime.fromisoformat(data['registration_deadline']) if data['registration_deadline'] else None
            
            db.session.commit()
            return {'message': 'Event updated', 'event': event.to_dict()}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error updating event: {str(e)}'}, 500
    
    @jwt_required()
    def delete(self, event_id):
        event = Event.query.get_or_404(event_id)
        
        try:
            db.session.delete(event)
            db.session.commit()
            return {'message': 'Event deleted'}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error deleting event: {str(e)}'}, 500

class AdminStories(Resource):
    @jwt_required()
    def get(self):
        stories = Story.query.order_by(Story.created_at.desc()).all()
        return {'stories': [s.to_dict() for s in stories]}, 200
    
    @jwt_required()
    def post(self):
        data = request.get_json()
        
        required_fields = ['title', 'summary', 'content']
        if not all(field in data for field in required_fields):
            return {'message': 'Missing required fields'}, 400
        
        try:
            story = Story(
                title=data['title'],
                summary=data['summary'],
                content=data['content'],
                image_filename=data.get('image_filename'),
                video_url=data.get('video_url'),
                is_active=data.get('is_active', True),
                is_featured=data.get('is_featured', False),
                category=data.get('category')
            )
            
            db.session.add(story)
            db.session.commit()
            
            return {'message': 'Story created', 'story': story.to_dict()}, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error creating story: {str(e)}'}, 500

class AdminStoryDetail(Resource):
    @jwt_required()
    def get(self, story_id):
        story = Story.query.get_or_404(story_id)
        return story.to_dict(), 200
    
    @jwt_required()
    def put(self, story_id):
        story = Story.query.get_or_404(story_id)
        data = request.get_json()
        
        try:
            if 'title' in data:
                story.title = data['title']
            if 'summary' in data:
                story.summary = data['summary']
            if 'content' in data:
                story.content = data['content']
            if 'image_filename' in data:
                story.image_filename = data['image_filename']
            if 'video_url' in data:
                story.video_url = data['video_url']
            if 'is_active' in data:
                story.is_active = data['is_active']
            if 'is_featured' in data:
                story.is_featured = data['is_featured']
            if 'category' in data:
                story.category = data['category']
            
            db.session.commit()
            return {'message': 'Story updated', 'story': story.to_dict()}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error updating story: {str(e)}'}, 500
    
    @jwt_required()
    def delete(self, story_id):
        story = Story.query.get_or_404(story_id)
        
        try:
            db.session.delete(story)
            db.session.commit()
            return {'message': 'Story deleted'}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error deleting story: {str(e)}'}, 500

class AdminTestimonials(Resource):
    @jwt_required()
    def get(self):
        testimonials = Testimonial.query.order_by(Testimonial.created_at.desc()).all()
        return {'testimonials': [t.to_dict() for t in testimonials]}, 200

class AdminTestimonialDetail(Resource):
    @jwt_required()
    def put(self, testimonial_id):
        testimonial = Testimonial.query.get_or_404(testimonial_id)
        data = request.get_json()
        
        try:
            if 'is_approved' in data:
                testimonial.is_approved = data['is_approved']
            if 'rating' in data:
                testimonial.rating = data['rating']
            if 'category' in data:
                testimonial.category = data['category']
            
            db.session.commit()
            return {'message': 'Testimonial updated', 'testimonial': testimonial.to_dict()}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error updating testimonial: {str(e)}'}, 500
    
    @jwt_required()
    def delete(self, testimonial_id):
        testimonial = Testimonial.query.get_or_404(testimonial_id)
        
        try:
            db.session.delete(testimonial)
            db.session.commit()
            return {'message': 'Testimonial deleted'}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error deleting testimonial: {str(e)}'}, 500

class AdminVolunteers(Resource):
    @jwt_required()
    def get(self):
        volunteers = Volunteer.query.order_by(Volunteer.submitted_at.desc()).all()
        return {'volunteers': [v.to_dict() for v in volunteers]}, 200

class AdminContacts(Resource):
    @jwt_required()
    def get(self):
        contacts = ContactSubmission.query.order_by(ContactSubmission.submitted_at.desc()).all()
        return {'contacts': [c.to_dict() for c in contacts]}, 200
    
    @jwt_required()
    def put(self):
        data = request.get_json()
        contact_id = data.get('id')
        
        if not contact_id:
            return {'message': 'Contact ID required'}, 400
        
        contact = ContactSubmission.query.get_or_404(contact_id)
        
        try:
            if 'resolved' in data:
                contact.resolved = data['resolved']
            
            db.session.commit()
            return {'message': 'Contact updated', 'contact': contact.to_dict()}, 200
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error updating contact: {str(e)}'}, 500

class AdminSubscriptions(Resource):
    @jwt_required()
    def get(self):
        subscriptions = Subscription.query.filter_by(is_active=True).order_by(
            Subscription.subscribed_at.desc()
        ).all()
        return {'subscriptions': [s.to_dict() for s in subscriptions]}, 200

class AdminStats(Resource):
    @jwt_required()
    def get(self):
        from sqlalchemy import func
        
        stats = {
            'donations': {
                'total': db.session.query(func.count(Donation.id)).scalar(),
                'amount': db.session.query(func.sum(Donation.amount)).scalar() or 0
            },
            'events': {
                'total': db.session.query(func.count(Event.id)).scalar(),
                'upcoming': db.session.query(func.count(Event.id)).filter(
                    Event.date >= datetime.utcnow()
                ).scalar()
            },
            'stories': {
                'total': db.session.query(func.count(Story.id)).scalar(),
                'active': db.session.query(func.count(Story.id)).filter_by(is_active=True).scalar(),
                'featured': db.session.query(func.count(Story.id)).filter_by(is_featured=True).scalar()
            },
            'testimonials': {
                'total': db.session.query(func.count(Testimonial.id)).scalar(),
                'approved': db.session.query(func.count(Testimonial.id)).filter_by(is_approved=True).scalar(),
                'pending': db.session.query(func.count(Testimonial.id)).filter_by(is_approved=False).scalar()
            },
            'volunteers': {
                'total': db.session.query(func.count(Volunteer.id)).scalar()
            },
            'contacts': {
                'total': db.session.query(func.count(ContactSubmission.id)).scalar(),
                'unresolved': db.session.query(func.count(ContactSubmission.id)).filter_by(resolved=False).scalar()
            },
            'subscriptions': {
                'active': db.session.query(func.count(Subscription.id)).filter_by(is_active=True).scalar()
            }
        }
        
        return stats, 200
