from flask import request, current_app
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
import stripe
from datetime import datetime
from app import db
from models import Donation

class DonationList(Resource):
    def get(self):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        donations = Donation.query.order_by(Donation.donated_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return {
            'donations': [d.to_dict() for d in donations.items],
            'total': donations.total,
            'pages': donations.pages,
            'current_page': page
        }, 200

class CreateDonation(Resource):
    def post(self):
        data = request.get_json()
        
        required_fields = ['name', 'email', 'amount', 'frequency']
        if not all(field in data for field in required_fields):
            return {'message': 'Missing required fields'}, 400
        
        try:
            donation = Donation(
                name=data['name'],
                email=data['email'],
                amount=float(data['amount']),
                frequency=data['frequency'],
                stripe_payment_id=data.get('payment_id'),
                status='pending'
            )
            
            db.session.add(donation)
            db.session.commit()
            
            return {'message': 'Donation created', 'donation': donation.to_dict()}, 201
        except Exception as e:
            db.session.rollback()
            return {'message': f'Error creating donation: {str(e)}'}, 500

class StripeConfig(Resource):
    def get(self):
        return {
            'publishableKey': current_app.config.get('STRIPE_PUBLIC_KEY')
        }, 200

class CreatePaymentIntent(Resource):
    def post(self):
        try:
            stripe.api_key = current_app.config.get('STRIPE_SECRET_KEY')
            data = request.get_json()
            
            amount = int(float(data['amount']) * 100)  # Convert to cents
            
            intent = stripe.PaymentIntent.create(
                amount=amount,
                currency='usd',
                metadata={
                    'name': data.get('name'),
                    'email': data.get('email'),
                    'frequency': data.get('frequency')
                }
            )
            
            return {
                'clientSecret': intent.client_secret,
                'paymentIntentId': intent.id
            }, 200
        except stripe.error.StripeError as e:
            return {'message': f'Stripe error: {str(e)}'}, 400
        except Exception as e:
            return {'message': f'Error creating payment intent: {str(e)}'}, 500
