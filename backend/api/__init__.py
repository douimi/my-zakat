from flask import Blueprint
from flask_restful import Api

api_bp = Blueprint('api', __name__)
api = Api(api_bp)

# Import resources after api is created to avoid circular imports
from . import auth, donations, events, stories, testimonials, volunteers, contact, stats, admin

# Auth endpoints
api.add_resource(auth.Login, '/auth/login')
api.add_resource(auth.Register, '/auth/register')
api.add_resource(auth.Refresh, '/auth/refresh')
api.add_resource(auth.Logout, '/auth/logout')
api.add_resource(auth.Profile, '/auth/profile')

# Public endpoints
api.add_resource(donations.DonationList, '/donations')
api.add_resource(donations.CreateDonation, '/donations/create')
api.add_resource(donations.StripeConfig, '/donations/stripe-config')
api.add_resource(donations.CreatePaymentIntent, '/donations/create-payment-intent')

api.add_resource(events.EventList, '/events')
api.add_resource(events.EventDetail, '/events/<int:event_id>')
api.add_resource(events.UpcomingEvents, '/events/upcoming')

api.add_resource(stories.StoryList, '/stories')
api.add_resource(stories.StoryDetail, '/stories/<int:story_id>')
api.add_resource(stories.FeaturedStories, '/stories/featured')

api.add_resource(testimonials.TestimonialList, '/testimonials')
api.add_resource(testimonials.TestimonialDetail, '/testimonials/<int:testimonial_id>')
api.add_resource(testimonials.ApprovedTestimonials, '/testimonials/approved')
api.add_resource(testimonials.SubmitTestimonial, '/testimonials/submit')

api.add_resource(volunteers.VolunteerSignup, '/volunteers/signup')
api.add_resource(contact.ContactSubmit, '/contact/submit')
api.add_resource(contact.NewsletterSubscribe, '/newsletter/subscribe')

api.add_resource(stats.DonationStats, '/stats/donations')
api.add_resource(stats.ImpactStats, '/stats/impact')

# Admin endpoints (protected)
api.add_resource(admin.AdminDonations, '/admin/donations')
api.add_resource(admin.AdminEvents, '/admin/events')
api.add_resource(admin.AdminEventDetail, '/admin/events/<int:event_id>')
api.add_resource(admin.AdminStories, '/admin/stories')
api.add_resource(admin.AdminStoryDetail, '/admin/stories/<int:story_id>')
api.add_resource(admin.AdminTestimonials, '/admin/testimonials')
api.add_resource(admin.AdminTestimonialDetail, '/admin/testimonials/<int:testimonial_id>')
api.add_resource(admin.AdminVolunteers, '/admin/volunteers')
api.add_resource(admin.AdminContacts, '/admin/contacts')
api.add_resource(admin.AdminSubscriptions, '/admin/subscriptions')
api.add_resource(admin.AdminStats, '/admin/stats')
