from flask import request, current_app
from flask_restful import Resource
from sqlalchemy import func
from datetime import datetime, timedelta
from app import db
from models import Donation, Volunteer, Story, Event

class DonationStats(Resource):
    def get(self):
        # Total donations
        total_amount = db.session.query(func.sum(Donation.amount)).scalar() or 0
        total_count = db.session.query(func.count(Donation.id)).scalar() or 0
        
        # Monthly donations
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        monthly_amount = db.session.query(func.sum(Donation.amount)).filter(
            Donation.donated_at >= thirty_days_ago
        ).scalar() or 0
        monthly_count = db.session.query(func.count(Donation.id)).filter(
            Donation.donated_at >= thirty_days_ago
        ).scalar() or 0
        
        # Donation by frequency
        frequency_stats = db.session.query(
            Donation.frequency,
            func.count(Donation.id),
            func.sum(Donation.amount)
        ).group_by(Donation.frequency).all()
        
        frequency_breakdown = {
            freq: {'count': count, 'amount': float(amount or 0)}
            for freq, count, amount in frequency_stats
        }
        
        # Recent donations
        recent_donations = Donation.query.order_by(
            Donation.donated_at.desc()
        ).limit(10).all()
        
        return {
            'total': {
                'amount': float(total_amount),
                'count': total_count
            },
            'monthly': {
                'amount': float(monthly_amount),
                'count': monthly_count
            },
            'frequency_breakdown': frequency_breakdown,
            'recent_donations': [d.to_dict() for d in recent_donations]
        }, 200

class ImpactStats(Resource):
    def get(self):
        total_donations = db.session.query(func.sum(Donation.amount)).scalar() or 0
        
        # Calculate impact based on allocation percentages
        meals_budget = total_donations * 0.20
        families_budget = total_donations * 0.50
        orphans_budget = total_donations * 0.30
        
        # Get costs from config
        meal_cost = current_app.config.get('MEAL_COST', 5)
        family_cost = current_app.config.get('FAMILY_COST', 100)
        orphan_cost = current_app.config.get('ORPHAN_COST', 100)
        
        # Calculate quantities
        meals_provided = int(meals_budget // meal_cost)
        families_helped = int(families_budget // family_cost)
        orphans_sponsored = int(orphans_budget // orphan_cost)
        
        # Get other stats
        total_volunteers = db.session.query(func.count(Volunteer.id)).scalar() or 0
        total_stories = db.session.query(func.count(Story.id)).filter_by(is_active=True).scalar() or 0
        upcoming_events = db.session.query(func.count(Event.id)).filter(
            Event.date >= datetime.utcnow()
        ).scalar() or 0
        
        # Calculate Ramadan specific stats
        ramadan_donations = db.session.query(func.sum(Donation.amount)).filter(
            Donation.frequency == 'Ramadan'
        ).scalar() or 0
        
        return {
            'impact': {
                'meals_provided': meals_provided,
                'families_helped': families_helped,
                'orphans_sponsored': orphans_sponsored,
                'total_beneficiaries': meals_provided + (families_helped * 4) + orphans_sponsored
            },
            'financial': {
                'total_raised': float(total_donations),
                'ramadan_raised': float(ramadan_donations),
                'allocation': {
                    'meals': float(meals_budget),
                    'families': float(families_budget),
                    'orphans': float(orphans_budget)
                }
            },
            'community': {
                'volunteers': total_volunteers,
                'success_stories': total_stories,
                'upcoming_events': upcoming_events
            },
            'unit_costs': {
                'meal': meal_cost,
                'family': family_cost,
                'orphan': orphan_cost
            }
        }, 200
