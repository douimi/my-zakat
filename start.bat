@echo off
REM MyZakat Platform Quick Start Script for Windows

echo 🚀 Starting MyZakat Platform...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Create environment files if they don't exist
if not exist .env (
    echo 📝 Creating .env file from template...
    copy env.example .env
    echo ⚠️  Please edit .env with your Stripe keys before continuing!
)

if not exist backend\.env (
    echo 📝 Creating backend\.env file from template...
    copy backend\env.example backend\.env
)

if not exist frontend\.env (
    echo 📝 Creating frontend\.env file from template...
    copy frontend\env.example frontend\.env
)

echo 🐳 Building and starting Docker containers...
docker-compose up --build -d

echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo 👤 Creating default admin user...
docker-compose exec -T backend python -c "from database import SessionLocal; from models import Admin; from auth_utils import get_password_hash; db = SessionLocal(); admin = Admin(username='admin', password=get_password_hash('admin123')); db.add(admin); db.commit(); print('✅ Admin user created: admin/admin123')" 2>nul

echo.
echo 🎉 MyZakat Platform is ready!
echo.
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend API: http://localhost:8000
echo 📚 API Docs: http://localhost:8000/docs
echo 👨‍💼 Admin Login: http://localhost:3000/admin/login (admin/admin123)
echo.
echo ⚠️  Remember to:
echo    1. Update your .env file with real Stripe keys
echo    2. Change the default admin password
echo    3. Configure email settings for production
echo.
echo 🛑 To stop: docker-compose down
pause
