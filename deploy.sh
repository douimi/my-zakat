#!/bin/bash

# Deploy My Zakat App to VPS with Traefik
# Usage: ./deploy.sh

set -e

echo "🚀 Starting deployment of My Zakat App..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p letsencrypt
chmod 600 letsencrypt

# Create Traefik network if it doesn't exist
print_status "Creating Traefik network..."
docker network create traefik-network 2>/dev/null || print_warning "Traefik network already exists"

# Check if environment file exists
if [ ! -f "env.production" ]; then
    print_error "env.production file not found. Please create it from env.example with your actual values."
    print_status "Run: cp env.example env.production"
    print_status "Then edit env.production with your actual Stripe keys and other credentials."
    exit 1
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f docker-compose.traefik.yml down 2>/dev/null || true

# Pull latest images
print_status "Pulling latest images..."
docker-compose -f docker-compose.traefik.yml pull

# Build frontend without cache to ensure latest changes are included
print_status "Building frontend without cache..."
docker-compose -f docker-compose.traefik.yml --env-file env.production build --no-cache frontend

# Build and start services
print_status "Building and starting services..."
docker-compose -f docker-compose.traefik.yml --env-file env.production up -d --build

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 30

# Check if services are running
print_status "Checking service status..."
docker-compose -f docker-compose.traefik.yml ps

# Show logs for debugging
print_status "Showing recent logs..."
docker-compose -f docker-compose.traefik.yml logs --tail=50

print_success "Deployment completed!"
print_status "Your application should be available at:"
echo "  - Main site: https://myzakat.org"
echo "  - Traefik dashboard: https://traefik.myzakat.org"
echo ""
print_warning "Make sure to:"
echo "  1. Point your domain myzakat.org to your VPS IP (31.97.131.31)"
echo "  2. Update your DNS A records:"
echo "     - myzakat.org -> 31.97.131.31"
echo "     - traefik.myzakat.org -> 31.97.131.31"
echo "  3. Update your production environment variables in env.production"
echo "  4. Change the Traefik dashboard password in docker-compose.traefik.yml"
echo ""
print_status "To view logs: docker-compose -f docker-compose.traefik.yml logs -f [service_name]"
print_status "To restart services: docker-compose -f docker-compose.traefik.yml restart"
