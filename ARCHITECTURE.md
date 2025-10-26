# MyZakat - Application Architecture Guide

## 📘 Document Purpose

This document explains how the MyZakat donation platform is built and organized. It's written for non-technical stakeholders, managers, and anyone who wants to understand the system without diving into code.

---

## 🎯 What is MyZakat?

MyZakat is a professional online platform for accepting and managing Islamic charitable donations (Zakat and Sadaqa). The platform allows:

- **Donors** to make one-time or recurring donations securely
- **Visitors** to calculate their Zakat obligations using Islamic principles
- **Users** to read inspiring stories and view upcoming events
- **Administrators** to manage all content, track donations, and respond to inquiries

The platform handles real money through Stripe (a secure payment processor), stores information in a database, and provides both a public-facing website and an administrative control panel.

---

## 🏗️ System Architecture Overview

### The Three Main Parts

The application is split into three major components that work together:

```
┌─────────────────────────────────────────────────────────┐
│                    Web Browser                          │
│           (What users see and interact with)            │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                   Backend Server                        │
│        (Business logic and data processing)             │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                      Database                           │
│            (Where all information is stored)            │
└─────────────────────────────────────────────────────────┘
```

#### 1. **Frontend** (The User Interface)
- **What it is**: The visual part users see in their web browser
- **Location**: `frontend/` folder
- **What it does**: 
  - Displays the website pages (home, donation forms, calculator, etc.)
  - Collects user input (donation amounts, contact forms)
  - Sends requests to the backend server
  - Shows results back to users
- **Color Scheme**: Blue and white theme throughout (professional and trustworthy)

#### 2. **Backend** (The Business Logic)
- **What it is**: The "brain" of the application that runs on a server
- **Location**: `backend/` folder
- **What it does**:
  - Processes donation requests
  - Calculates Zakat according to Islamic rules
  - Manages admin authentication (login security)
  - Communicates with Stripe for payment processing
  - Stores and retrieves data from the database
  - Handles file uploads (images, videos)
  - Sends confirmation emails

#### 3. **Database** (Data Storage)
- **What it is**: A structured storage system for all application data
- **Technology**: PostgreSQL (a reliable, industry-standard database)
- **What it stores**:
  - Donation records (who donated, how much, when)
  - Contact form submissions
  - Event information
  - Stories and testimonials
  - Volunteer registrations
  - Newsletter subscriptions
  - Admin user credentials (encrypted)
  - Site settings and configuration

---

## 🛠️ Technologies Used (Simplified)

### Frontend Technologies

| Technology | What It Is | Why We Use It |
|------------|------------|---------------|
| **React** | A framework for building interactive websites | Makes the website fast and responsive |
| **TypeScript** | JavaScript with type checking | Prevents bugs and makes code more reliable |
| **Tailwind CSS** | A styling framework | Creates the blue/white design efficiently |
| **Stripe.js** | Payment processing library | Securely handles credit card information |
| **Axios** | HTTP client | Sends requests to the backend server |
| **React Router** | Page navigation system | Handles moving between different pages |

### Backend Technologies

| Technology | What It Is | Why We Use It |
|------------|------------|---------------|
| **FastAPI** | Python web framework | Fast, modern, and easy to maintain |
| **SQLAlchemy** | Database toolkit | Safely interacts with the database |
| **Stripe SDK** | Stripe integration library | Processes payments securely |
| **JWT** | Authentication tokens | Keeps admin login secure |
| **Bcrypt** | Password encryption | Protects admin passwords |
| **Pillow** | Image processing | Handles uploaded photos |

### Infrastructure Technologies

| Technology | What It Is | Why We Use It |
|------------|------------|---------------|
| **Docker** | Containerization platform | Packages everything in one bundle |
| **PostgreSQL** | Relational database | Stores all data reliably |
| **Nginx** | Web server | Serves the website to visitors |
| **Traefik** | Reverse proxy | Routes traffic and manages SSL certificates |

---

## 📂 Project Structure

```
my-zakat/
├── backend/                    # Backend server code
│   ├── routers/               # API endpoints (organized by feature)
│   │   ├── admin.py          # Admin dashboard endpoints
│   │   ├── auth.py           # Login/logout endpoints
│   │   ├── donations.py      # Donation processing
│   │   ├── events.py         # Event management
│   │   ├── stories.py        # Story management
│   │   ├── contact.py        # Contact form handling
│   │   ├── testimonials.py   # Testimonial submissions
│   │   ├── volunteers.py     # Volunteer registrations
│   │   ├── subscriptions.py  # Newsletter subscriptions
│   │   └── settings.py       # Site configuration
│   ├── models.py             # Database table definitions
│   ├── schemas.py            # Data validation rules
│   ├── database.py           # Database connection setup
│   ├── auth_utils.py         # Login security functions
│   ├── main.py               # Main application entry point
│   ├── requirements.txt      # Python dependencies
│   └── uploads/              # Uploaded files storage
│
├── frontend/                  # Frontend website code
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Header.tsx   # Top navigation bar
│   │   │   ├── Footer.tsx   # Bottom footer
│   │   │   ├── Layout.tsx   # Page wrapper
│   │   │   ├── AdminLayout.tsx     # Admin panel wrapper
│   │   │   └── AdminRoute.tsx      # Admin access control
│   │   ├── pages/           # Website pages
│   │   │   ├── Home.tsx     # Homepage
│   │   │   ├── Donate.tsx   # Donation page
│   │   │   ├── ZakatCalculator.tsx  # Calculator tool
│   │   │   ├── Events.tsx   # Events listing
│   │   │   ├── Stories.tsx  # Impact stories
│   │   │   ├── Contact.tsx  # Contact form
│   │   │   └── admin/       # Admin dashboard pages
│   │   ├── store/           # Global state management
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Helper functions
│   ├── public/              # Static files (images, icons)
│   └── package.json         # JavaScript dependencies
│
├── docker-compose.yml        # Local development setup
├── docker-compose.prod.yml   # Production deployment setup
├── docker-compose.traefik.yml # Production with SSL/proxy
├── init.sql                  # Initial database structure
├── .env                      # Environment variables (secrets)
└── readme.md                 # Developer documentation
```

---

## 🔄 How Data Flows Through the System

### Example: Making a Donation

1. **User Action**: Donor fills out donation form and clicks "Donate Now"
2. **Frontend**: Validates the form data and sends it to the backend
3. **Backend**: 
   - Creates a Stripe payment session
   - Stores donation details in database (temporarily pending)
   - Returns Stripe checkout URL to frontend
4. **Frontend**: Redirects user to Stripe's secure payment page
5. **Stripe**: Processes the payment securely
6. **Stripe Webhook**: Sends payment confirmation to backend
7. **Backend**: 
   - Updates donation status to "completed"
   - Sends thank-you email to donor
8. **Frontend**: Shows success page to donor

### Example: Admin Viewing Dashboard

1. **Admin Action**: Admin logs in with username/password
2. **Backend**: 
   - Verifies credentials against database
   - Creates a secure JWT token
   - Sends token to frontend
3. **Frontend**: Stores token and displays admin dashboard
4. **Admin Action**: Clicks "View Donations"
5. **Frontend**: Sends request to backend with authentication token
6. **Backend**: 
   - Verifies token is valid
   - Retrieves donation data from database
   - Returns data to frontend
7. **Frontend**: Displays donations in a table format

---

## 📊 Database Structure

The database contains 11 main tables:

| Table Name | Purpose | Key Information Stored |
|------------|---------|------------------------|
| **donations** | Donation records | Name, email, amount, date, Stripe ID |
| **donation_subscriptions** | Recurring donations | Subscription ID, payment schedule, status |
| **contact_submissions** | Contact form messages | Name, email, message, resolved status |
| **events** | Upcoming events | Title, date, location, description, image |
| **stories** | Impact stories | Title, content, images, featured status |
| **testimonials** | User testimonials | Name, text, rating, approval status |
| **volunteers** | Volunteer applications | Name, email, area of interest |
| **subscriptions** | Newsletter subscribers | Email, name, phone, preferences |
| **admins** | Admin users | Username, encrypted password |
| **settings** | Site configuration | Key-value pairs for site settings |
| **press_releases** | Media announcements | Title, content, date, image |

---

## 🚀 How to Run the Application

### Prerequisites (What You Need Installed)

1. **Docker Desktop** - Packages and runs the entire application
   - Download from: https://www.docker.com/products/docker-desktop
2. **Stripe Account** - For processing payments
   - Sign up at: https://stripe.com
3. **Text Editor** (optional) - To edit configuration files
   - Example: VS Code, Notepad++

### Step-by-Step Setup

#### 1. Prepare Configuration Files

```bash
# Copy the example environment files
cp env.example .env
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
```

#### 2. Add Your Stripe Keys

Edit the `.env` file and add your Stripe credentials:

```
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

#### 3. Start the Application

**On Windows:**
```bash
start.bat
```

**On Mac/Linux:**
```bash
./start.sh
```

Or manually with Docker:
```bash
docker-compose up --build
```

#### 4. Access the Application

After a few minutes, open your web browser:

- **Public Website**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
- **API Documentation**: http://localhost:8000/docs
- **Database**: localhost:5432 (requires database client)

#### 5. Create Admin Account

Default admin credentials are created automatically:
- **Username**: admin
- **Password**: admin

⚠️ **Important**: Change this password immediately after first login!

---

## 🔒 Security Features

### How We Keep Data Safe

1. **Password Encryption**
   - Admin passwords are encrypted using bcrypt
   - Passwords are never stored in plain text

2. **Secure Authentication**
   - JWT tokens expire after 7 days
   - Each request is verified for authenticity

3. **Payment Security**
   - Credit card data never touches our servers
   - All payments processed by Stripe (PCI compliant)

4. **Data Protection**
   - Database access is restricted and password-protected
   - API endpoints validate all input data

5. **HTTPS Encryption** (Production)
   - All traffic encrypted with SSL certificates
   - Managed automatically by Traefik

6. **Input Validation**
   - All user input is validated before processing
   - Prevents malicious data injection

---

## 🌐 Deployment (Going Live)

### Development vs. Production

| Aspect | Development | Production |
|--------|-------------|------------|
| **URL** | localhost:3000 | myzakat.org |
| **Database** | Local PostgreSQL | Remote PostgreSQL |
| **Payments** | Stripe Test Mode | Stripe Live Mode |
| **SSL** | Not required | Required (HTTPS) |
| **Email** | Console logging | Real email sending |
| **Error Messages** | Detailed | User-friendly |

### Production Deployment Process

1. **Setup VPS (Virtual Private Server)**
   - Ubuntu server recommended
   - Minimum: 2GB RAM, 2 CPU cores, 50GB storage

2. **Configure DNS**
   - Point domain to server IP address
   - Wait for DNS propagation (up to 24 hours)

3. **Run Setup Script**
   ```bash
   bash setup-vps.sh
   ```

4. **Configure Production Environment**
   - Edit `env.production` with real values
   - Use production Stripe keys
   - Set strong passwords

5. **Deploy Application**
   ```bash
   ./deploy.sh
   ```

6. **Verify Deployment**
   - Test website functionality
   - Complete a test donation
   - Check admin dashboard access

---

## 📱 Key Features Explained

### For Public Users

1. **Donation Page**
   - One-time or recurring donations
   - Multiple payment options via Stripe
   - Instant confirmation emails

2. **Zakat Calculator**
   - Calculates Zakat on various asset types
   - Gold, silver, cash, investments, debts
   - Follows Islamic guidelines

3. **Stories Section**
   - Read about charity impact
   - Featured stories highlighted
   - Video testimonials

4. **Events Calendar**
   - Upcoming community events
   - Event details and locations
   - Registration options

5. **Contact Form**
   - Direct communication channel
   - Inquiry submission
   - Email notifications to admins

6. **Volunteer Registration**
   - Express interest in helping
   - Select areas of interest
   - Easy sign-up process

### For Administrators

1. **Dashboard**
   - Key statistics at a glance
   - Recent donations overview
   - Quick action buttons

2. **Donation Management**
   - View all donations
   - Filter by date, amount, type
   - Export to Excel/CSV

3. **Content Management**
   - Create/edit/delete stories
   - Manage events with images
   - Approve testimonials

4. **Contact Management**
   - View all messages
   - Mark as resolved
   - Track response status

5. **Settings Management**
   - Update site statistics
   - Manage media files
   - Configure homepage content

6. **Subscription Management**
   - View recurring donors
   - Cancel subscriptions if needed
   - Track payment schedules

---

## 🔧 Maintenance and Updates

### Regular Maintenance Tasks

1. **Database Backups**
   - Recommended: Daily automated backups
   - Store backups securely off-site
   - Test restore process periodically

2. **Security Updates**
   - Update dependencies monthly
   - Review security advisories
   - Apply patches promptly

3. **Performance Monitoring**
   - Check server resources (CPU, RAM, disk)
   - Monitor response times
   - Review error logs

4. **Content Updates**
   - Keep stories and events current
   - Archive old content
   - Update statistics regularly

### Troubleshooting Common Issues

| Problem | Possible Cause | Solution |
|---------|----------------|----------|
| Website not loading | Service not running | Run `docker-compose up` |
| Cannot login to admin | Wrong credentials | Reset password in database |
| Donations not processing | Stripe misconfigured | Check Stripe API keys |
| Images not uploading | Storage full | Clear old uploads or add storage |
| Emails not sending | Email config wrong | Verify SMTP settings |

---

## 📈 Scalability Considerations

### Current Capacity

- **Concurrent Users**: ~1,000 simultaneous visitors
- **Donations per Day**: Unlimited (Stripe handles load)
- **Database Size**: Can grow to hundreds of gigabytes
- **File Storage**: Limited by server disk space

### Growth Planning

When you need to scale up:

1. **More Traffic**
   - Upgrade VPS to more CPU/RAM
   - Add Redis caching
   - Use CDN for images

2. **More Data**
   - Upgrade database server
   - Implement database partitioning
   - Archive old records

3. **More Features**
   - Modular architecture allows easy additions
   - Add new routers for new endpoints
   - Create new pages in frontend

---

## 💰 Cost Breakdown

### Development Costs (One-Time)

- Initial development: Varies by region/team
- Design and branding: Varies
- Testing and QA: Varies

### Operating Costs (Monthly)

| Service | Estimated Cost | Purpose |
|---------|---------------|---------|
| **VPS Hosting** | $10-50/month | Server infrastructure |
| **Domain Name** | $10-15/year | Website address |
| **Stripe Fees** | 2.9% + $0.30 per transaction | Payment processing |
| **Email Service** | $0-20/month | Transactional emails |
| **SSL Certificate** | Free (Let's Encrypt) | HTTPS encryption |
| **Backups** | $5-20/month | Data backup storage |

**Total Monthly**: Approximately $20-100/month (excluding transaction fees)

---

## 🤝 Support and Resources

### Getting Help

1. **Technical Issues**
   - Check error logs: `docker-compose logs`
   - Review API documentation: http://localhost:8000/docs

2. **Documentation**
   - `readme.md` - Developer guide
   - `DEPLOYMENT.md` - Deployment instructions
   - This file - Architecture overview

3. **External Resources**
   - FastAPI Documentation: https://fastapi.tiangolo.com
   - React Documentation: https://react.dev
   - Stripe Documentation: https://stripe.com/docs
   - Docker Documentation: https://docs.docker.com

### Best Practices

1. **Always test in development first** before deploying to production
2. **Keep backups** of database and configuration files
3. **Monitor logs** regularly for errors or suspicious activity
4. **Update regularly** to get security patches and new features
5. **Document changes** when modifying the system

---

## 📝 Summary

MyZakat is a modern, secure, and scalable donation platform built with industry-standard technologies. The three-tier architecture (Frontend, Backend, Database) provides separation of concerns and makes the system maintainable and extensible.

**Key Strengths:**
- ✅ Professional blue/white design
- ✅ Secure payment processing via Stripe
- ✅ Comprehensive admin dashboard
- ✅ Mobile-responsive design
- ✅ Docker-based deployment
- ✅ Scalable architecture
- ✅ Open for future enhancements

**Ideal For:**
- Islamic charitable organizations
- Non-profits accepting Zakat
- Community mosques and centers
- Relief organizations

---

*Document Version: 1.0*  
*Last Updated: October 2025*  
*For questions or clarifications, please contact your development team.*

