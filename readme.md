# MyZakat Foundation - Production-Ready Application

A modern, containerized charity platform with Angular frontend and Python Flask API backend.

## Architecture

```
myzakat/
├── backend/          # Python Flask API
├── frontend/         # Angular 17 SPA
├── docker-compose.yml
└── README.md
```

## Features

- **Modern Angular Frontend**: Professional UI/UX with responsive design
- **RESTful API Backend**: Python Flask with JWT authentication
- **Docker Containerization**: Both services containerized for easy deployment
- **Database**: SQLite (upgradeable to PostgreSQL)
- **Payment Integration**: Stripe payment processing
- **Email Notifications**: Automated email system
- **Admin Dashboard**: Protected admin routes

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### Production Deployment

1. Clone the repository
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Configure your environment variables in `.env`
4. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```
5. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost:5000

### Local Development

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python app.py
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment Variables

Key environment variables to configure:

- `SECRET_KEY`: Flask secret key
- `JWT_SECRET_KEY`: JWT token secret
- `MAIL_USERNAME`: Email account for notifications
- `MAIL_PASSWORD`: Email app password
- `STRIPE_PUBLIC_KEY`: Stripe publishable key
- `STRIPE_SECRET_KEY`: Stripe secret key

## API Endpoints

### Public Endpoints
- `GET /api/v1/stories` - Get success stories
- `GET /api/v1/events` - Get events
- `GET /api/v1/testimonials/approved` - Get approved testimonials
- `POST /api/v1/donations/create` - Create donation
- `POST /api/v1/volunteers/signup` - Volunteer signup
- `POST /api/v1/contact/submit` - Submit contact form

### Protected Endpoints (Admin)
- `POST /api/v1/auth/login` - Admin login
- `GET /api/v1/admin/*` - Admin management endpoints

## Database Migration

The existing SQLite database is preserved in `backend/instance/contacts.db`. To migrate to PostgreSQL:

1. Uncomment the PostgreSQL service in `docker-compose.yml`
2. Update `DATABASE_URL` in `.env`
3. Run migrations:
   ```bash
   docker-compose exec backend flask db upgrade
   ```

## Deployment to Production

### Using Docker Swarm
```bash
docker swarm init
docker stack deploy -c docker-compose.yml myzakat
```

### Using Kubernetes
Kubernetes manifests can be generated from docker-compose.yml using Kompose.

### Cloud Deployment
- **AWS**: Use ECS or EKS
- **Azure**: Use Container Instances or AKS
- **Google Cloud**: Use Cloud Run or GKE
- **DigitalOcean**: Use App Platform or Kubernetes

## Security Considerations

1. Change all default passwords and secrets
2. Enable HTTPS with SSL certificates
3. Configure proper CORS origins
4. Set up rate limiting
5. Enable security headers
6. Regular security updates

## Monitoring

Consider adding:
- Application monitoring (Sentry, New Relic)
- Log aggregation (ELK Stack)
- Health checks and alerts
- Performance monitoring

## Support

For issues or questions, please create an issue in the repository.

## License

© 2024 MyZakat Foundation. All rights reserved.