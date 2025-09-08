from flask import request
from flask_restful import Resource
from flask_mail import Message
from app import db, mail
from models import ContactSubmission, Subscription

class ContactSubmit(Resource):
    def post(self):
        data = request.get_json()
        
        required_fields = ['name', 'email', 'message']
        if not all(field in data for field in required_fields):
            return {'message': 'Name, email, and message are required'}, 400
        
        try:
            contact = ContactSubmission(
                name=data['name'],
                email=data['email'],
                message=data['message']
            )
            
            db.session.add(contact)
            db.session.commit()
            
            # Send notification email to admin
            try:
                msg = Message(
                    f'New Contact Form Submission from {contact.name}',
                    recipients=['admin@myzakat.org'],  # Replace with actual admin email
                    body=f"""New contact form submission:

Name: {contact.name}
Email: {contact.email}
Message:
{contact.message}

Submitted at: {contact.submitted_at}

Please respond to this inquiry promptly."""
                )
                mail.send(msg)
            except Exception as e:
                print(f"Failed to send contact notification email: {str(e)}")
            
            return {
                'message': 'Thank you for contacting us. We will respond within 24-48 hours.',
                'contact': contact.to_dict()
            }, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error submitting contact form: {str(e)}'}, 500

class NewsletterSubscribe(Resource):
    def post(self):
        data = request.get_json()
        
        email = data.get('email')
        if not email:
            return {'message': 'Email is required'}, 400
        
        # Check if already subscribed
        existing = Subscription.query.filter_by(email=email).first()
        if existing:
            if existing.is_active:
                return {'message': 'This email is already subscribed'}, 409
            else:
                # Reactivate subscription
                existing.is_active = True
                existing.unsubscribed_at = None
                db.session.commit()
                return {'message': 'Welcome back! Your subscription has been reactivated.'}, 200
        
        try:
            subscription = Subscription(
                name=data.get('name'),
                email=email,
                phone=data.get('phone'),
                wants_email=data.get('wants_email', True),
                wants_sms=data.get('wants_sms', False)
            )
            
            db.session.add(subscription)
            db.session.commit()
            
            # Send welcome email
            try:
                msg = Message(
                    'Welcome to MyZakat Newsletter',
                    recipients=[email],
                    body=f"""Welcome to the MyZakat Foundation newsletter!

Thank you for subscribing to our updates. You'll receive regular news about our programs, success stories, and ways you can make a difference in the community.

You can unsubscribe at any time by clicking the link at the bottom of our emails.

Best regards,
MyZakat Foundation Team"""
                )
                mail.send(msg)
            except Exception as e:
                print(f"Failed to send welcome email: {str(e)}")
            
            return {
                'message': 'Successfully subscribed to newsletter!',
                'subscription': subscription.to_dict()
            }, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error subscribing to newsletter: {str(e)}'}, 500
