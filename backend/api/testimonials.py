from flask import request
from flask_restful import Resource
from app import db
from models import Testimonial

class TestimonialList(Resource):
    def get(self):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        testimonials = Testimonial.query.order_by(
            Testimonial.created_at.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)
        
        return {
            'testimonials': [t.to_dict() for t in testimonials.items],
            'total': testimonials.total,
            'pages': testimonials.pages,
            'current_page': page
        }, 200

class TestimonialDetail(Resource):
    def get(self, testimonial_id):
        testimonial = Testimonial.query.get_or_404(testimonial_id)
        return testimonial.to_dict(), 200

class ApprovedTestimonials(Resource):
    def get(self):
        limit = request.args.get('limit', 10, type=int)
        category = request.args.get('category', None)
        
        query = Testimonial.query.filter_by(is_approved=True)
        
        if category:
            query = query.filter_by(category=category)
        
        testimonials = query.order_by(
            Testimonial.created_at.desc()
        ).limit(limit).all()
        
        return {
            'testimonials': [t.to_dict() for t in testimonials],
            'count': len(testimonials)
        }, 200

class SubmitTestimonial(Resource):
    def post(self):
        data = request.get_json()
        
        required_fields = ['name', 'text']
        if not all(field in data for field in required_fields):
            return {'message': 'Name and text are required'}, 400
        
        try:
            testimonial = Testimonial(
                name=data['name'],
                country=data.get('country'),
                text=data['text'],
                rating=data.get('rating'),
                category=data.get('category', 'general'),
                is_approved=False  # Requires admin approval
            )
            
            db.session.add(testimonial)
            db.session.commit()
            
            return {
                'message': 'Thank you for your testimonial! It will be reviewed shortly.',
                'testimonial': testimonial.to_dict()
            }, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error submitting testimonial: {str(e)}'}, 500
