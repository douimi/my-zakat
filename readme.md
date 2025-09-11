# MyZakat - Professional Donation Platform

A modern, professional donation platform built with FastAPI and React, designed specifically for Zakat and Sadaqa donations.

## 🏗️ Architecture

This is a **monorepo** containing:

- **Backend** (`/backend`): FastAPI application with PostgreSQL
- **Frontend** (`/frontend`): React application with TypeScript and Tailwind CSS
- **Docker** setup for easy deployment and development

## ✨ Features

### 🎯 Core Features
- **Professional donation system** with Stripe integration
- **Zakat calculator** following Islamic principles
- **Admin dashboard** for managing content and donations
- **Stories and testimonials** management
- **Event management** system
- **Contact and volunteer** management
- **Newsletter subscription** system

### 🎨 Design & UX
- **Blue and white design palette** throughout the application
- **Fully responsive** design (mobile, tablet, desktop)
- **Modern UI/UX** with smooth animations
- **Accessibility compliant** (ARIA roles, semantic HTML)
- **Professional appearance** focused on donation conversion

### 🔧 Technical Features
- **FastAPI** backend with async support
- **PostgreSQL** database with SQLAlchemy ORM
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Docker containerization**
- **Stripe payment processing**
- **JWT authentication** for admin users

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd my-zakat

# Copy environment files
cp env.example .env
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
```

### 2. Configure Environment Variables

Edit `.env` file with your Stripe keys:

```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### 3. Run with Docker

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database**: localhost:5432 (postgres/password)

### 5. Create Admin User

```bash
# Access the backend container
docker-compose exec backend bash

# Create admin user (replace with your credentials)
python -c "
from database import SessionLocal
from models import Admin
from auth_utils import get_password_hash

db = SessionLocal()
admin = Admin(username='admin', password=get_password_hash('admin123'))
db.add(admin)
db.commit()
print('Admin user created: admin/admin123')
"
```

## 🛠️ Development

### Backend Development

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

## 📁 Project Structure

```
my-zakat/
├── backend/                 # FastAPI backend
│   ├── routers/            # API route handlers
│   ├── models.py           # Database models
│   ├── schemas.py          # Pydantic schemas
│   ├── database.py         # Database configuration
│   ├── auth_utils.py       # Authentication utilities
│   ├── main.py             # FastAPI application
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── utils/          # Utility functions
│   │   ├── types/          # TypeScript types
│   │   └── store/          # State management
│   ├── public/             # Static assets
│   └── package.json        # Node.js dependencies
├── docker-compose.yml      # Docker orchestration
└── README.md              # This file
```

## 🔒 Security Features

- JWT-based authentication for admin users
- Password hashing with bcrypt
- CORS configuration
- SQL injection prevention with SQLAlchemy ORM
- XSS protection headers
- Secure Stripe payment processing

## 🎨 Design System

### Color Palette
- **Primary Blue**: #3b82f6 (Tailwind blue-500)
- **Secondary Blue**: #1d4ed8 (Tailwind blue-700)
- **White**: #ffffff
- **Gray Scale**: Tailwind gray palette

### Typography
- **Headings**: Poppins font family
- **Body**: Inter font family
- **Responsive**: Mobile-first approach

## 🚀 Deployment

### Production Environment

1. **Update environment variables** for production
2. **Configure SSL/TLS** certificates
3. **Set up domain** and DNS
4. **Configure reverse proxy** (Nginx)
5. **Set up monitoring** and logging

### Docker Production

```bash
# Production build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

## 📊 Admin Features

- **Dashboard** with key metrics and statistics
- **Donation management** with filtering and export
- **Contact management** with resolution tracking
- **Event management** with image uploads
- **Story management** with featured/active controls
- **Testimonial approval** system
- **Volunteer management**
- **Newsletter management**

## 🔧 API Endpoints

### Public Endpoints
- `POST /api/donations/` - Create donation
- `POST /api/donations/calculate-zakat` - Calculate Zakat
- `POST /api/contact/` - Submit contact form
- `GET /api/events/` - Get events
- `GET /api/stories/` - Get stories
- `POST /api/testimonials/` - Submit testimonial

### Admin Endpoints (Protected)
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/donations/` - Get all donations
- `GET /api/contact/` - Get contact submissions
- Admin CRUD operations for all entities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, please contact the development team or create an issue in the repository.

## 🙏 Acknowledgments

- Built with modern web technologies
- Designed for Islamic charitable organizations
- Focused on transparency and user experience