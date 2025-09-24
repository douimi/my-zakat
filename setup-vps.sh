#!/bin/bash

# VPS Setup Script for My Zakat App
# Run this on your Ubuntu VPS (31.97.131.31)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

echo "🚀 Setting up VPS for My Zakat App deployment..."

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    htop \
    vim \
    ufw

# Install Docker
print_status "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    print_success "Docker installed successfully"
else
    print_warning "Docker is already installed"
fi

# Install Docker Compose
print_status "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed successfully"
else
    print_warning "Docker Compose is already installed"
fi

# Configure firewall
print_status "Configuring firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
print_success "Firewall configured"

# Create application directory
print_status "Creating application directory..."
sudo mkdir -p /opt/myzakat
sudo chown $USER:$USER /opt/myzakat
print_success "Application directory created at /opt/myzakat"

# Generate secure passwords
print_status "Generating secure passwords..."
DB_PASSWORD=$(openssl rand -base64 32)
SECRET_KEY=$(openssl rand -base64 64)

echo ""
print_success "VPS setup completed!"
echo ""
print_warning "IMPORTANT: Save these generated passwords:"
echo "Database Password: $DB_PASSWORD"
echo "Secret Key: $SECRET_KEY"
echo ""
print_status "Next steps:"
echo "1. Clone your repository to /opt/myzakat"
echo "2. Update env.production with the generated passwords"
echo "3. Configure your domain DNS to point to this server"
echo "4. Run the deployment script"
echo ""
print_warning "You may need to log out and log back in for Docker permissions to take effect"
