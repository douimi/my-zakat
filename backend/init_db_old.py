#!/usr/bin/env python3
"""
Database initialization script for MyZakat Foundation
Creates all database tables and populates with comprehensive dummy data
"""

import os
import sys
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (Admin, ContactSubmission, Donation, Story, Event, 
                   Testimonial, Volunteer, Subscription)

def init_database():
    """Initialize the database with tables and comprehensive dummy data"""
    
    app = create_app()
    
    with app.app_context():
        try:
            # Drop all tables and recreate (for fresh start)
            print("Dropping existing tables...")
            db.drop_all()
            
            # Create all database tables
            print("Creating database tables...")
            db.create_all()
            print("✅ Database tables created successfully!")
            
            # Create default admin user
            admin_user = Admin(
                username='admin',
                email='admin@myzakat.org',
                password_hash=generate_password_hash('admin'),
                is_active=True
            )
            db.session.add(admin_user)
            print("✅ Default admin user created (admin/admin)")
            
            # Add comprehensive dummy data
            add_comprehensive_data()
            
            db.session.commit()
            
            print("\n🎉 Database initialization completed successfully!")
            print("\n📊 Data Summary:")
            print(f"   📖 Stories: {Story.query.count()}")
            print(f"   📅 Events: {Event.query.count()}")
            print(f"   ⭐ Testimonials: {Testimonial.query.count()}")
            print(f"   👥 Volunteers: {Volunteer.query.count()}")
            print(f"   💰 Donations: {Donation.query.count()}")
            print(f"   📧 Contacts: {ContactSubmission.query.count()}")
            print(f"   📬 Subscribers: {Subscription.query.count()}")
            
            print("\n🔐 Admin Access:")
            print("   URL: http://localhost/admin/login")
            print("   Username: admin")
            print("   Password: admin")
            
        except Exception as e:
            print(f"❌ Error initializing database: {str(e)}")
            db.session.rollback()
            sys.exit(1)

def add_comprehensive_data():
    """Add comprehensive dummy data for all models"""
    
    # Success Stories
    stories_data = [
        {
            "title": "Transforming Lives Through Education",
            "content": "Meet Amina, a bright 16-year-old from a low-income family who dreamed of becoming a doctor. Through our scholarship program, she's now excelling in her studies and is one step closer to her dream. Her story represents hope for hundreds of other children in similar situations.",
            "image_url": "assets/images/stories/education.jpg",
            "is_featured": True,
            "is_active": True
        },
        {
            "title": "Emergency Relief During Crisis",
            "content": "When the floods hit our community last year, the Zakat funds helped provide immediate relief to over 150 families. We distributed food packages, temporary shelter, and medical aid to those who needed it most. The community's response was overwhelming.",
            "image_url": "assets/images/stories/relief.jpg",
            "video_url": "assets/videos/relief-story.mp4",
            "is_featured": True,
            "is_active": True
        },
        {
            "title": "Supporting Single Mothers",
            "content": "Fatima, a single mother of three, lost her job during the pandemic. Our foundation provided her with financial assistance, job training, and childcare support. Today, she runs her own small business and supports her family independently.",
            "image_url": "assets/images/stories/mothers.jpg",
            "is_featured": False,
            "is_active": True
        },
        {
            "title": "Healthcare for the Elderly",
            "content": "Our medical assistance program has helped over 200 elderly community members access essential healthcare services. From regular check-ups to emergency treatments, we ensure no one is left behind.",
            "image_url": "assets/images/stories/healthcare.jpg",
            "is_featured": False,
            "is_active": True
        },
        {
            "title": "Feeding the Hungry",
            "content": "Every month, our food distribution program reaches 500+ families. During Ramadan, we increased our efforts and provided Iftar meals to 1,000 people daily. The joy on faces of families receiving these meals is priceless.",
            "image_url": "assets/images/stories/food.jpg",
            "is_featured": True,
            "is_active": True
        }
    ]
    
    for story_data in stories_data:
        story = Story(**story_data)
        db.session.add(story)
    
    print("✅ Success stories added")
    
    # Events
    events_data = [
        {
            "title": "Annual Charity Gala 2024",
            "description": "Join us for an elegant evening of giving back to the community. Featuring keynote speakers, cultural performances, and a silent auction. All proceeds support our education and healthcare initiatives.",
            "event_date": datetime.utcnow() + timedelta(days=45),
            "location": "Grand Ballroom, Fairmont Hotel",
            "image_url": "assets/images/events/gala.jpg",
            "registration_link": "https://myzakat.org/register-gala",
            "is_featured": True,
            "is_active": True
        },
        {
            "title": "Community Iftar Gathering",
            "description": "Breaking fast together as one community. Join us for a traditional Iftar meal followed by evening prayers and community discussions about our upcoming projects.",
            "event_date": datetime.utcnow() + timedelta(days=20),
            "location": "Islamic Community Center",
            "image_url": "assets/images/events/iftar.jpg",
            "is_featured": True,
            "is_active": True
        },
        {
            "title": "Winter Clothing Drive",
            "description": "Help us collect winter clothing for families in need. We're looking for coats, boots, gloves, and warm clothing for all ages. Drop-off locations available throughout the city.",
            "event_date": datetime.utcnow() + timedelta(days=10),
            "location": "Multiple Drop-off Locations",
            "image_url": "assets/images/events/clothing-drive.jpg",
            "is_featured": False,
            "is_active": True
        },
        {
            "title": "Youth Leadership Workshop",
            "description": "Empowering the next generation of community leaders. A full-day workshop covering leadership skills, community service, and Islamic values for youth aged 16-25.",
            "event_date": datetime.utcnow() + timedelta(days=30),
            "location": "Community Center - Conference Room",
            "image_url": "assets/images/events/workshop.jpg",
            "registration_link": "https://myzakat.org/youth-workshop",
            "is_featured": False,
            "is_active": True
        },
        {
            "title": "Health & Wellness Fair",
            "description": "Free health screenings, wellness workshops, and consultations with healthcare professionals. Open to all community members and their families.",
            "event_date": datetime.utcnow() + timedelta(days=60),
            "location": "City Park Recreation Center",
            "image_url": "assets/images/events/health-fair.jpg",
            "is_featured": False,
            "is_active": True
        }
    ]
    
    for event_data in events_data:
        event = Event(**event_data)
        db.session.add(event)
    
    print("✅ Events added")
    
    # Testimonials
    testimonials_data = [
        {
            "name": "Ahmed Hassan",
            "message": "The support I received from MyZakat Foundation changed my family's life completely. When I lost my job during the pandemic, they didn't just provide financial assistance - they gave us hope and helped me get back on my feet.",
            "rating": 5,
            "image_url": "assets/images/testimonials/ahmed.jpg",
            "location": "Toronto, Canada",
            "is_approved": True,
            "is_featured": True
        },
        {
            "name": "Fatima Al-Zahra",
            "message": "As a single mother, I was struggling to provide for my children. The foundation's support program helped me start my own business. Today, I'm financially independent and even help other women in similar situations.",
            "rating": 5,
            "image_url": "assets/images/testimonials/fatima.jpg",
            "location": "Vancouver, BC",
            "is_approved": True,
            "is_featured": True
        },
        {
            "name": "Omar Abdullah",
            "message": "The scholarship program allowed me to complete my engineering degree. I'm now working at a tech company and regularly donate back to the foundation. They truly invest in people's futures.",
            "rating": 5,
            "image_url": "assets/images/testimonials/omar.jpg",
            "location": "Calgary, AB",
            "is_approved": True,
            "is_featured": False
        },
        {
            "name": "Aisha Mohamed",
            "message": "When my elderly father needed medical treatment we couldn't afford, the foundation stepped in immediately. Their healthcare assistance program saved his life. We are forever grateful.",
            "rating": 5,
            "image_url": "assets/images/testimonials/aisha.jpg",
            "location": "Montreal, QC",
            "is_approved": True,
            "is_featured": False
        },
        {
            "name": "Yusuf Ibrahim",
            "message": "The food distribution program has been a blessing for our large family. The volunteers are always respectful and kind, making the experience dignified for everyone involved.",
            "rating": 5,
            "location": "Ottawa, ON",
            "is_approved": True,
            "is_featured": False
        },
        {
            "name": "Khadija Ali",
            "message": "I volunteer with the foundation regularly and I'm amazed by their transparency and efficiency. Every dollar is used wisely to help those who need it most.",
            "rating": 5,
            "video_url": "assets/videos/testimonial-khadija.mp4",
            "location": "Edmonton, AB",
            "is_approved": False,
            "is_featured": False
        }
    ]
    
    for testimonial_data in testimonials_data:
        testimonial = Testimonial(**testimonial_data)
        db.session.add(testimonial)
    
    print("✅ Testimonials added")
    
    # Volunteer Applications
    volunteers_data = [
        {
            "full_name": "Sarah Johnson",
            "email": "sarah.johnson@email.com",
            "phone": "+1 (555) 123-4567",
            "skills": "Event Planning, Social Media Management, Photography",
            "availability": "Weekends and evenings",
            "message": "I'm passionate about community service and have experience organizing charity events. I'd love to help with your upcoming initiatives.",
            "status": "pending"
        },
        {
            "full_name": "Mohammad Rahman",
            "email": "m.rahman@email.com",
            "phone": "+1 (555) 234-5678",
            "skills": "Teaching, Mentoring, Arabic/English Translation",
            "availability": "Flexible schedule",
            "message": "As a retired teacher, I'd like to contribute to your educational programs and help with language barriers in the community.",
            "status": "approved"
        },
        {
            "full_name": "Jennifer Smith",
            "email": "jen.smith@email.com",
            "phone": "+1 (555) 345-6789",
            "skills": "Nursing, Healthcare, First Aid",
            "availability": "Weekends",
            "message": "I'm a registered nurse interested in volunteering for your health and wellness programs.",
            "status": "approved"
        },
        {
            "full_name": "Ali Hassan",
            "email": "ali.hassan@email.com",
            "skills": "Fundraising, Business Development, Marketing",
            "availability": "Evenings and weekends",
            "message": "I work in corporate fundraising and would like to help expand your donor network and improve outreach strategies.",
            "status": "pending"
        },
        {
            "full_name": "Maria Garcia",
            "email": "maria.garcia@email.com",
            "phone": "+1 (555) 456-7890",
            "skills": "Cooking, Food Service, Organization",
            "availability": "Weekends only",
            "message": "I love cooking and would be happy to help with food preparation for community events and distributions.",
            "status": "rejected"
        }
    ]
    
    for volunteer_data in volunteers_data:
        volunteer = Volunteer(**volunteer_data)
        db.session.add(volunteer)
    
    print("✅ Volunteer applications added")
    
    # Donations
    donations_data = [
        {
            "name": "Ahmed Hassan",
            "email": "ahmed.hassan@email.com",
            "amount": 500.00,
            "frequency": "monthly",
            "status": "completed"
        },
        {
            "name": "Sarah Khan",
            "email": "sarah.khan@email.com",
            "amount": 250.00,
            "frequency": "one-time",
            "status": "completed"
        },
        {
            "name": "Omar Ali",
            "email": "omar.ali@email.com",
            "amount": 100.00,
            "frequency": "monthly",
            "status": "pending"
        },
        {
            "name": "Fatima Mohamed",
            "email": "fatima.mohamed@email.com",
            "amount": 1000.00,
            "frequency": "yearly",
            "status": "completed"
        },
        {
            "name": "Yusuf Ibrahim",
            "email": "yusuf.ibrahim@email.com",
            "amount": 75.00,
            "frequency": "one-time",
            "status": "failed"
        },
        {
            "name": "Aisha Abdullah",
            "email": "aisha.abdullah@email.com",
            "amount": 300.00,
            "frequency": "quarterly",
            "status": "completed"
        }
    ]
    
    for donation_data in donations_data:
        # Randomize donation dates over the past 3 months
        import random
        days_ago = random.randint(1, 90)
        donation_data['donated_at'] = datetime.utcnow() - timedelta(days=days_ago)
        
        donation = Donation(**donation_data)
        db.session.add(donation)
    
    print("✅ Donations added")
    
    # Contact Submissions
    contacts_data = [
        {
            "name": "John Smith",
            "email": "john.smith@email.com",
            "subject": "Question about Zakat calculation",
            "message": "I'm trying to calculate my Zakat for this year and have some questions about what assets to include. Could someone help me understand the process better?",
            "resolved": False
        },
        {
            "name": "Lisa Chen",
            "email": "lisa.chen@email.com",
            "subject": "Volunteer opportunity inquiry",
            "message": "I'm interested in volunteering for your upcoming food drive event. What are the requirements and how can I sign up to help?",
            "resolved": True
        },
        {
            "name": "David Wilson",
            "email": "david.wilson@email.com",
            "subject": "Donation receipt request",
            "message": "I made a donation last month but haven't received my tax receipt yet. Could you please send it to my email address?",
            "resolved": False
        },
        {
            "name": "Amina Hassan",
            "email": "amina.hassan@email.com",
            "subject": "Thank you message",
            "message": "I wanted to thank you for the help my family received during our difficult time. Your organization truly makes a difference in our community. May Allah bless your work.",
            "resolved": True
        },
        {
            "name": "Robert Brown",
            "email": "robert.brown@email.com",
            "subject": "Partnership proposal",
            "message": "I represent a local business that would like to partner with your foundation for our corporate social responsibility initiatives. Could we schedule a meeting?",
            "resolved": False
        }
    ]
    
    for contact_data in contacts_data:
        # Randomize submission dates
        import random
        days_ago = random.randint(1, 30)
        contact_data['submitted_at'] = datetime.utcnow() - timedelta(days=days_ago)
        
        contact = ContactSubmission(**contact_data)
        db.session.add(contact)
    
    print("✅ Contact submissions added")
    
    # Newsletter Subscriptions
    newsletter_emails = [
        "subscriber1@email.com",
        "subscriber2@email.com",
        "newsletter.fan@email.com",
        "community.member@email.com",
        "regular.donor@email.com",
        "unsubscribed@email.com",
        "active.supporter@email.com",
        "monthly.giver@email.com"
    ]
    
    for email in newsletter_emails:
        # Some subscribers are inactive
        is_active = email != "unsubscribed@email.com"
        
        import random
        days_ago = random.randint(1, 365)
        subscribed_at = datetime.utcnow() - timedelta(days=days_ago)
        
        subscription = NewsletterSubscription(
            email=email,
            is_active=is_active,
            subscribed_at=subscribed_at
        )
        db.session.add(subscription)
    
    print("✅ Newsletter subscriptions added")

if __name__ == '__main__':
    print("🚀 Initializing MyZakat Foundation database with comprehensive data...")
    init_database()
