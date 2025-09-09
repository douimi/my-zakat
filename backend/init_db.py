#!/usr/bin/env python3
"""
Fixed database initialization script for MyZakat Foundation
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
                password=generate_password_hash('admin'),
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
            import traceback
            traceback.print_exc()
            db.session.rollback()
            sys.exit(1)

def add_comprehensive_data():
    """Add comprehensive dummy data for all models"""
    
    # Success Stories (matching Story model fields)
    stories = [
        Story(
            title="Transforming Lives Through Education",
            summary="Empowering children through educational scholarships",
            content="Meet Amina, a bright 16-year-old from a low-income family who dreamed of becoming a doctor. Through our scholarship program, she's now excelling in her studies and is one step closer to her dream. Her story represents hope for hundreds of other children in similar situations.",
            image_filename="education.jpg",
            is_featured=True,
            is_active=True,
            category="Education"
        ),
        Story(
            title="Emergency Relief During Crisis",
            summary="Providing immediate relief during natural disasters",
            content="When the floods hit our community last year, the Zakat funds helped provide immediate relief to over 150 families. We distributed food packages, temporary shelter, and medical aid to those who needed it most. The community's response was overwhelming.",
            image_filename="relief.jpg",
            video_url="https://example.com/relief-video",
            is_featured=True,
            is_active=True,
            category="Emergency"
        ),
        Story(
            title="Supporting Single Mothers",
            summary="Empowering single mothers through job training",
            content="Fatima, a single mother of three, lost her job during the pandemic. Our foundation provided her with financial assistance, job training, and childcare support. Today, she runs her own small business and supports her family independently.",
            image_filename="mothers.jpg",
            is_featured=False,
            is_active=True,
            category="Women"
        ),
        Story(
            title="Healthcare for the Elderly",
            summary="Ensuring healthcare access for elderly community members",
            content="Our medical assistance program has helped over 200 elderly community members access essential healthcare services. From regular check-ups to emergency treatments, we ensure no one is left behind.",
            image_filename="healthcare.jpg",
            is_featured=False,
            is_active=True,
            category="Healthcare"
        ),
        Story(
            title="Feeding the Hungry",
            summary="Monthly food distribution reaching 500+ families",
            content="Every month, our food distribution program reaches 500+ families. During Ramadan, we increased our efforts and provided Iftar meals to 1,000 people daily. The joy on faces of families receiving these meals is priceless.",
            image_filename="food.jpg",
            is_featured=True,
            is_active=True,
            category="Food"
        )
    ]
    
    for story in stories:
        db.session.add(story)
    print("✅ Success stories added")
    
    # Events (matching Event model fields)
    events = [
        Event(
            title="Annual Charity Gala 2024",
            description="Join us for an elegant evening of giving back to the community. Featuring keynote speakers, cultural performances, and a silent auction. All proceeds support our education and healthcare initiatives.",
            date=datetime.utcnow() + timedelta(days=45),
            location="Grand Ballroom, Fairmont Hotel",
            image="gala.jpg",
            is_featured=True,
            max_attendees=200,
            registration_deadline=datetime.utcnow() + timedelta(days=40)
        ),
        Event(
            title="Community Iftar Gathering",
            description="Breaking fast together as one community. Join us for a traditional Iftar meal followed by evening prayers and community discussions about our upcoming projects.",
            date=datetime.utcnow() + timedelta(days=20),
            location="Islamic Community Center",
            image="iftar.jpg",
            is_featured=True,
            max_attendees=300
        ),
        Event(
            title="Winter Clothing Drive",
            description="Help us collect winter clothing for families in need. We're looking for coats, boots, gloves, and warm clothing for all ages. Drop-off locations available throughout the city.",
            date=datetime.utcnow() + timedelta(days=10),
            location="Multiple Drop-off Locations",
            image="clothing-drive.jpg",
            is_featured=False
        ),
        Event(
            title="Youth Leadership Workshop",
            description="Empowering the next generation of community leaders. A full-day workshop covering leadership skills, community service, and Islamic values for youth aged 16-25.",
            date=datetime.utcnow() + timedelta(days=30),
            location="Community Center - Conference Room",
            image="workshop.jpg",
            is_featured=False,
            max_attendees=50,
            registration_deadline=datetime.utcnow() + timedelta(days=25)
        ),
        Event(
            title="Health & Wellness Fair",
            description="Free health screenings, wellness workshops, and consultations with healthcare professionals. Open to all community members and their families.",
            date=datetime.utcnow() + timedelta(days=60),
            location="City Park Recreation Center",
            image="health-fair.jpg",
            is_featured=False,
            max_attendees=500
        )
    ]
    
    for event in events:
        db.session.add(event)
    print("✅ Events added")
    
    # Testimonials (matching Testimonial model fields)
    testimonials = [
        Testimonial(
            name="Ahmed Hassan",
            country="Canada",
            image="ahmed.jpg",
            text="The support I received from MyZakat Foundation changed my family's life completely. When I lost my job during the pandemic, they didn't just provide financial assistance - they gave us hope and helped me get back on my feet.",
            rating=5,
            category="Financial Aid",
            is_approved=True
        ),
        Testimonial(
            name="Fatima Al-Zahra",
            country="Canada",
            image="fatima.jpg",
            text="As a single mother, I was struggling to provide for my children. The foundation's support program helped me start my own business. Today, I'm financially independent and even help other women in similar situations.",
            rating=5,
            category="Women Empowerment",
            is_approved=True
        ),
        Testimonial(
            name="Omar Abdullah",
            country="Canada",
            image="omar.jpg",
            text="The scholarship program allowed me to complete my engineering degree. I'm now working at a tech company and regularly donate back to the foundation. They truly invest in people's futures.",
            rating=5,
            category="Education",
            is_approved=True
        ),
        Testimonial(
            name="Aisha Mohamed",
            country="Canada",
            image="aisha.jpg",
            text="When my elderly father needed medical treatment we couldn't afford, the foundation stepped in immediately. Their healthcare assistance program saved his life. We are forever grateful.",
            rating=5,
            category="Healthcare",
            is_approved=True
        ),
        Testimonial(
            name="Yusuf Ibrahim",
            country="Canada",
            text="The food distribution program has been a blessing for our large family. The volunteers are always respectful and kind, making the experience dignified for everyone involved.",
            rating=5,
            category="Food Aid",
            is_approved=True
        ),
        Testimonial(
            name="Khadija Ali",
            country="Canada",
            text="I volunteer with the foundation regularly and I'm amazed by their transparency and efficiency. Every dollar is used wisely to help those who need it most.",
            rating=5,
            video_url="https://example.com/testimonial-video",
            category="Volunteer",
            is_approved=False
        )
    ]
    
    for testimonial in testimonials:
        db.session.add(testimonial)
    print("✅ Testimonials added")
    
    # Volunteers (matching Volunteer model fields)
    volunteers = [
        Volunteer(
            name="Sarah Johnson",
            email="sarah.johnson@email.com",
            phone="+1 (555) 123-4567",
            interest="Event Planning",
            skills="Event Planning, Social Media Management, Photography",
            availability="Weekends and evenings",
            status="pending"
        ),
        Volunteer(
            name="Mohammad Rahman",
            email="m.rahman@email.com",
            phone="+1 (555) 234-5678",
            interest="Education",
            skills="Teaching, Mentoring, Arabic/English Translation",
            availability="Flexible schedule",
            status="approved"
        ),
        Volunteer(
            name="Jennifer Smith",
            email="jen.smith@email.com",
            phone="+1 (555) 345-6789",
            interest="Healthcare",
            skills="Nursing, Healthcare, First Aid",
            availability="Weekends",
            status="approved"
        ),
        Volunteer(
            name="Ali Hassan",
            email="ali.hassan@email.com",
            interest="Fundraising",
            skills="Fundraising, Business Development, Marketing",
            availability="Evenings and weekends",
            status="pending"
        ),
        Volunteer(
            name="Maria Garcia",
            email="maria.garcia@email.com",
            phone="+1 (555) 456-7890",
            interest="Food Service",
            skills="Cooking, Food Service, Organization",
            availability="Weekends only",
            status="rejected"
        )
    ]
    
    for volunteer in volunteers:
        db.session.add(volunteer)
    print("✅ Volunteer applications added")
    
    # Donations (matching Donation model fields)
    donations = [
        Donation(
            name="Ahmed Hassan",
            email="ahmed.hassan@email.com",
            amount=500.00,
            frequency="monthly",
            status="completed",
            donated_at=datetime.utcnow() - timedelta(days=5)
        ),
        Donation(
            name="Sarah Khan",
            email="sarah.khan@email.com",
            amount=250.00,
            frequency="one-time",
            status="completed",
            donated_at=datetime.utcnow() - timedelta(days=10)
        ),
        Donation(
            name="Omar Ali",
            email="omar.ali@email.com",
            amount=100.00,
            frequency="monthly",
            status="pending",
            donated_at=datetime.utcnow() - timedelta(days=15)
        ),
        Donation(
            name="Fatima Mohamed",
            email="fatima.mohamed@email.com",
            amount=1000.00,
            frequency="yearly",
            status="completed",
            donated_at=datetime.utcnow() - timedelta(days=20)
        ),
        Donation(
            name="Yusuf Ibrahim",
            email="yusuf.ibrahim@email.com",
            amount=75.00,
            frequency="one-time",
            status="failed",
            donated_at=datetime.utcnow() - timedelta(days=25)
        ),
        Donation(
            name="Aisha Abdullah",
            email="aisha.abdullah@email.com",
            amount=300.00,
            frequency="quarterly",
            status="completed",
            donated_at=datetime.utcnow() - timedelta(days=30)
        )
    ]
    
    for donation in donations:
        db.session.add(donation)
    print("✅ Donations added")
    
    # Contact Submissions (matching ContactSubmission model fields)
    contacts = [
        ContactSubmission(
            name="John Smith",
            email="john.smith@email.com",
            message="I'm trying to calculate my Zakat for this year and have some questions about what assets to include. Could someone help me understand the process better?",
            resolved=False,
            submitted_at=datetime.utcnow() - timedelta(days=2)
        ),
        ContactSubmission(
            name="Lisa Chen",
            email="lisa.chen@email.com",
            message="I'm interested in volunteering for your upcoming food drive event. What are the requirements and how can I sign up to help?",
            resolved=True,
            submitted_at=datetime.utcnow() - timedelta(days=5)
        ),
        ContactSubmission(
            name="David Wilson",
            email="david.wilson@email.com",
            message="I made a donation last month but haven't received my tax receipt yet. Could you please send it to my email address?",
            resolved=False,
            submitted_at=datetime.utcnow() - timedelta(days=8)
        ),
        ContactSubmission(
            name="Amina Hassan",
            email="amina.hassan@email.com",
            message="I wanted to thank you for the help my family received during our difficult time. Your organization truly makes a difference in our community. May Allah bless your work.",
            resolved=True,
            submitted_at=datetime.utcnow() - timedelta(days=12)
        ),
        ContactSubmission(
            name="Robert Brown",
            email="robert.brown@email.com",
            message="I represent a local business that would like to partner with your foundation for our corporate social responsibility initiatives. Could we schedule a meeting?",
            resolved=False,
            submitted_at=datetime.utcnow() - timedelta(days=15)
        )
    ]
    
    for contact in contacts:
        db.session.add(contact)
    print("✅ Contact submissions added")
    
    # Newsletter Subscriptions (matching Subscription model fields)
    subscriptions = [
        Subscription(
            email="subscriber1@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=30)
        ),
        Subscription(
            email="subscriber2@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=45)
        ),
        Subscription(
            email="newsletter.fan@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=60)
        ),
        Subscription(
            email="community.member@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=75)
        ),
        Subscription(
            email="regular.donor@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=90)
        ),
        Subscription(
            email="unsubscribed@email.com",
            is_active=False,
            subscribed_at=datetime.utcnow() - timedelta(days=120),
            unsubscribed_at=datetime.utcnow() - timedelta(days=30)
        ),
        Subscription(
            email="active.supporter@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=150)
        ),
        Subscription(
            email="monthly.giver@email.com",
            is_active=True,
            subscribed_at=datetime.utcnow() - timedelta(days=180)
        )
    ]
    
    for subscription in subscriptions:
        db.session.add(subscription)
    print("✅ Newsletter subscriptions added")

if __name__ == '__main__':
    print("🚀 Initializing MyZakat Foundation database with comprehensive data...")
    init_database()
