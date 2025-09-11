#!/bin/bash

# MyZakat Platform Quick Start Script

echo "🚀 Starting MyZakat Platform..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Create environment files if they don't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env with your Stripe keys before continuing!"
fi

if [ ! -f backend/.env ]; then
    echo "📝 Creating backend/.env file from template..."
    cp backend/env.example backend/.env
fi

if [ ! -f frontend/.env ]; then
    echo "📝 Creating frontend/.env file from template..."
    cp frontend/env.example frontend/.env
fi

echo "🐳 Building and starting Docker containers..."
docker-compose up --build -d

echo "⏳ Waiting for services to be ready..."
sleep 10

echo "👤 Creating default admin user..."
docker-compose exec -T backend python -c "
from database import SessionLocal
from models import Admin
from auth_utils import get_password_hash

try:
    db = SessionLocal()
    admin = Admin(username='admin', password=get_password_hash('admin123'))
    db.add(admin)
    db.commit()
    print('✅ Admin user created: admin/admin123')
except Exception as e:
    print('ℹ️  Admin user may already exist')
finally:
    db.close()
"

echo ""
echo "🎉 MyZakat Platform is ready!"
echo ""
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo "👨‍💼 Admin Login: http://localhost:3000/admin/login (admin/admin123)"
echo ""
echo "⚠️  Remember to:"
echo "   1. Update your .env file with real Stripe keys"
echo "   2. Change the default admin password"
echo "   3. Configure email settings for production"
echo ""
echo "🛑 To stop: docker-compose down"
