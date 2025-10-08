# Deployment Guide - Garderobe Digital Platform

Complete guide to deploying your own Garderobe Digital instance.

## Quick Start (5 Minutes)

```bash
# 1. Clone
git clone https://github.com/your-repo/garderobe-digital.git
cd garderobe-digital

# 2. Configure
cp .env.example .env
# Generate random secret
openssl rand -base64 32
# Edit .env and paste the secret as SESSION_SECRET

# 3. Start
docker-compose up -d

# 4. Test
open http://localhost:3000
```

Done! Your platform is running.

## Production Deployment

### Prerequisites

- Server with 1GB RAM minimum (2GB recommended)
- Domain name pointed to your server
- Docker and Docker Compose installed
- SSL certificate (automatic with Caddy)

### Step-by-Step

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Logout and login to apply group changes
exit
```

#### 2. Get the Code

```bash
# Clone repository
git clone https://github.com/your-repo/garderobe-digital.git
cd garderobe-digital
```

#### 3. Configure Environment

```bash
# Copy example
cp .env.example .env

# Generate session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Edit configuration
nano .env
```

**Minimum required `.env`:**

```bash
# Domain (without https://)
DOMAIN=garderobe.yourdomain.com

# Base URL (with https://)
BASE_URL=https://garderobe.yourdomain.com

# Session secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your_generated_secret_here

# Environment
NODE_ENV=production
PORT=3000

# Rate limits
MAX_EVENTS_PER_IP_PER_HOUR=10
MAX_TICKETS_PER_EVENT=1000
```

#### 4. Deploy

```bash
# Build and start
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify health
curl https://garderobe.yourdomain.com/health
```

#### 7. Verify

1. Open `https://garderobe.yourdomain.com`
2. Click "Create New Event"
3. Create a test event
4. Verify URLs work
5. Test ticket creation
6. Test staff interface

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | Yes | - | Random secret for session encryption |
| `DOMAIN` | Yes (prod) | - | Your domain name (without https://) |
| `BASE_URL` | Yes (prod) | - | Full URL with https:// |
| `PORT` | No | `3000` | Internal app port |
| `NODE_ENV` | No | `production` | `production` or `development` |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection string |
| `MAX_EVENTS_PER_IP_PER_HOUR` | No | `10` | Rate limit for event creation |
| `MAX_TICKETS_PER_EVENT` | No | `1000` | Maximum tickets per event |

### Generating Secrets

**Session Secret (required):**
```bash
openssl rand -base64 32
```

**Or use Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Server Requirements

### Minimum Specs

- **CPU**: 1 core
- **RAM**: 1GB
- **Disk**: 10GB SSD
- **Bandwidth**: 100GB/month

**Can handle:**
- 50+ simultaneous events
- 10,000+ tickets per day
- 100+ concurrent users

### Recommended Specs

- **CPU**: 2 cores
- **RAM**: 2GB
- **Disk**: 20GB SSD
- **Bandwidth**: 500GB/month

**Can handle:**
- 100+ simultaneous events
- 50,000+ tickets per day
- 500+ concurrent users

### Scaling

**Horizontal scaling:**
```yaml
# docker-compose.yml
services:
  app:
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine
```

**Add load balancer** (Caddy handles this):
```
garderobe.yourdomain.com {
    reverse_proxy app:3000 app2:3000 app3:3000 {
        lb_policy round_robin
    }
}
```

## Monitoring

### Health Checks

```bash
# API health
curl https://garderobe.yourdomain.com/health

# Docker health
docker-compose ps

# Redis health
docker-compose exec redis redis-cli ping
```

### Logs

```bash
# All logs
docker-compose logs -f

# App only
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app

# Since 1 hour ago
docker-compose logs --since 1h app
```

### Metrics

```bash
# Events created today
docker-compose logs app | grep "EVENT CREATED" | grep $(date +%Y-%m-%d) | wc -l

# Tickets issued today
docker-compose logs app | grep "NEW TICKET" | grep $(date +%Y-%m-%d) | wc -l

# Check-ins today
docker-compose logs app | grep "CHECK-IN" | grep $(date +%Y-%m-%d) | wc -l
```

## Maintenance

### Updates

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose build

# Restart with zero downtime
docker-compose up -d --no-deps --build app

# Check logs
docker-compose logs -f app
```

### Backups

**Not needed!** Data is ephemeral by design. However, for logging:

```bash
# Backup logs
docker-compose logs app > logs-$(date +%Y%m%d).txt

# Compress
gzip logs-$(date +%Y%m%d).txt
```

### Redis Management

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Get info
INFO

# Check memory
INFO memory

# List all events
KEYS event:*:meta

# Get active events
SMEMBERS active_events

# Exit
exit
```

## Security Hardening

### Firewall

```bash
# Allow HTTP/HTTPS only
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Fail2ban

```bash
# Install
sudo apt install fail2ban -y

# Configure for Docker
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/lib/docker/containers/*/*.log
maxretry = 3
bantime = 3600
```

### Auto-updates

```bash
# Install unattended-upgrades
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Or change PORT in .env
PORT=8080
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Restart Redis
docker-compose restart redis
```

### Can't Access Website

```bash
# Check all containers running
docker-compose ps

# Check app logs
docker-compose logs app

# Check Caddy logs
docker-compose logs caddy

# Verify DNS points to server
nslookup garderobe.yourdomain.com
```

### SSL Certificate Issues

```bash
# Check Caddy logs
docker-compose logs caddy

# Verify domain DNS
dig garderobe.yourdomain.com

# Test Let's Encrypt
curl -I http://garderobe.yourdomain.com
```

### High Memory Usage

```bash
# Check Redis memory
docker-compose exec redis redis-cli INFO memory

# Configure max memory in docker-compose.yml
command: redis-server --maxmemory 1gb --maxmemory-policy allkeys-lru
```

## Cost Estimation

### Hosting Providers

**DigitalOcean:**
- Basic Droplet: $6/month (1GB RAM)
- Recommended: $12/month (2GB RAM)

**Hetzner:**
- CX11: €4.15/month (2GB RAM)
- Recommended: €6.40/month (4GB RAM)

**Linode:**
- Nanode: $5/month (1GB RAM)
- Recommended: $10/month (2GB RAM)

### Domain

- Namecheap: ~$10/year
- Cloudflare: ~$10/year
- Google Domains: ~$12/year

### Total Cost

**Minimum:** ~$60-80/year
**Recommended:** ~$100-150/year

## Community Instances

Want to contribute a public instance?

1. Deploy your instance
2. Add to community list: `instances.json`
3. Submit PR to main repository

Example:
```json
{
  "url": "https://garderobe.yourdomain.com",
  "region": "Europe",
  "maintained_by": "Your Name",
  "contact": "admin@yourdomain.com"
}
```

## Support

**Issues:** GitHub Issues
**Docs:** This file + README.md
**Community:** GitHub Discussions

---

**Last Updated:** October 8, 2025
**Version:** 4.0.0
