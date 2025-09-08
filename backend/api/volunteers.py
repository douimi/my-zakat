from flask import request
from flask_restful import Resource
from flask_mail import Message
from app import db, mail
from models import Volunteer

class VolunteerSignup(Resource):
    def post(self):
        data = request.get_json()
        
        required_fields = ['name', 'email', 'interest']
        if not all(field in data for field in required_fields):
            return {'message': 'Name, email, and interest are required'}, 400
        
        try:
            volunteer = Volunteer(
                name=data['name'],
                email=data['email'],
                phone=data.get('phone'),
                interest=data['interest'],
                skills=data.get('skills'),
                availability=data.get('availability')
            )
            
            db.session.add(volunteer)
            db.session.commit()
            
            # Send confirmation email
            try:
                msg = Message(
                    'Thank you for volunteering!',
                    recipients=[volunteer.email],
                    body=f"""Dear {volunteer.name},

Thank you for your interest in volunteering with MyZakat Foundation. We are grateful for your willingness to help make a difference in our community.

We have received your application and will review it shortly. Our volunteer coordinator will contact you within 2-3 business days to discuss opportunities that match your interests and availability.

Interest Area: {volunteer.interest}
Skills: {volunteer.skills or 'Not specified'}
Availability: {volunteer.availability or 'Not specified'}

If you have any questions in the meantime, please don't hesitate to contact us.

Best regards,
MyZakat Foundation Team"""
                )
                mail.send(msg)
            except Exception as e:
                # Log email error but don't fail the signup
                print(f"Failed to send volunteer confirmation email: {str(e)}")
            
            return {
                'message': 'Thank you for signing up! We will contact you soon.',
                'volunteer': volunteer.to_dict()
            }, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error processing volunteer signup: {str(e)}'}, 500
