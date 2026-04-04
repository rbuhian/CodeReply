# Deployment Guide

**Status**: ✅ Production Ready
**Last Updated**: April 5, 2026

## Overview

This guide covers deploying the CodeReply BYOD backend to various platforms including Railway, Render, AWS, and self-hosted environments.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Platform Deployment](#platform-deployment)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Running Migrations](#running-migrations)
6. [Health Checks](#health-checks)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- ✅ PostgreSQL 15+ database
- ✅ Redis 7+ (for Sprint 2)
- ✅ Node.js 20+ or Docker
- ✅ Environment variables configured

### Deployment Checklist

- [ ] Database created and accessible
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Health check endpoint responding
- [ ] Monitoring/logging configured
- [ ] SSL/TLS certificates configured
- [ ] DNS records updated
- [ ] Load balancer configured (if applicable)

---

## Platform Deployment

### Option 1: Railway (Recommended)

**Why Railway?**
- ✅ One-click PostgreSQL + Redis
- ✅ Automatic SSL certificates
- ✅ Zero-downtime deployments
- ✅ Built-in monitoring
- ✅ Git-based deployments

**Step-by-Step Deployment**:

1. **Create Railway Account**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli

   # Login
   railway login
   ```

2. **Initialize Project**
   ```bash
   cd src/backend
   railway init
   ```

3. **Add PostgreSQL**
   ```bash
   railway add postgresql
   ```

4. **Add Redis** (for Sprint 2)
   ```bash
   railway add redis
   ```

5. **Set Environment Variables**
   ```bash
   # Copy from .env.example and set in Railway dashboard
   railway variables set NODE_ENV=production
   railway variables set JWT_SECRET=$(openssl rand -base64 32)
   railway variables set LOG_LEVEL=info

   # Database URL is auto-set by Railway
   ```

6. **Deploy**
   ```bash
   railway up
   ```

7. **Run Migrations**
   ```bash
   railway run npm run migrate
   ```

8. **Verify Deployment**
   ```bash
   curl https://your-app.up.railway.app/health
   ```

**Railway Configuration** (`railway.json`):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

### Option 2: Render

**Why Render?**
- ✅ Free tier available
- ✅ Managed databases
- ✅ Auto-deploy from GitHub
- ✅ Preview environments for PRs

**Step-by-Step Deployment**:

1. **Create Render Account** → https://render.com

2. **Create PostgreSQL Database**
   - Go to Dashboard → New → PostgreSQL
   - Name: `codereply-db`
   - Plan: Free (or paid for production)
   - Copy the `Internal Database URL`

3. **Create Web Service**
   - Go to Dashboard → New → Web Service
   - Connect GitHub repository
   - Settings:
     - Name: `codereply-backend`
     - Environment: `Node`
     - Build Command: `npm ci && npm run build`
     - Start Command: `npm start`
     - Plan: Starter (or higher for production)

4. **Set Environment Variables**
   ```
   NODE_ENV=production
   DATABASE_URL=[Your Internal Database URL]
   JWT_SECRET=[Generate with: openssl rand -base64 32]
   LOG_LEVEL=info
   WEBHOOK_TIMEOUT=10000
   WEBHOOK_MAX_RETRIES=3
   ```

5. **Deploy**
   - Render auto-deploys on git push to main
   - Or click "Manual Deploy" in dashboard

6. **Run Migrations**
   - Go to Shell tab in Render dashboard
   - Run: `npm run migrate`

7. **Custom Domain** (optional)
   - Go to Settings → Custom Domain
   - Add your domain and configure DNS

**Render Configuration** (`render.yaml`):
```yaml
services:
  - type: web
    name: codereply-backend
    env: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: codereply-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: LOG_LEVEL
        value: info

databases:
  - name: codereply-db
    databaseName: codereply
    user: codereply
```

---

### Option 3: AWS (ECS + RDS)

**Why AWS?**
- ✅ Full control and scalability
- ✅ VPC isolation
- ✅ Advanced monitoring
- ✅ Enterprise-grade reliability

**Architecture**:
```
Internet → ALB → ECS Fargate → RDS PostgreSQL
                     ↓
              ElastiCache Redis
```

**Step-by-Step Deployment**:

1. **Create RDS PostgreSQL Database**
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier codereply-db \
     --db-instance-class db.t3.micro \
     --engine postgres \
     --engine-version 15.4 \
     --master-username codereply \
     --master-user-password [SECURE_PASSWORD] \
     --allocated-storage 20 \
     --vpc-security-group-ids sg-xxxxx \
     --db-subnet-group-name my-subnet-group \
     --backup-retention-period 7 \
     --publicly-accessible false
   ```

2. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name codereply-backend
   ```

3. **Build and Push Docker Image**
   ```bash
   # Build image
   docker build -t codereply-backend .

   # Tag image
   docker tag codereply-backend:latest \
     123456789012.dkr.ecr.us-east-1.amazonaws.com/codereply-backend:latest

   # Login to ECR
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin \
     123456789012.dkr.ecr.us-east-1.amazonaws.com

   # Push image
   docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/codereply-backend:latest
   ```

4. **Create ECS Task Definition** (`task-definition.json`):
   ```json
   {
     "family": "codereply-backend",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "containerDefinitions": [
       {
         "name": "backend",
         "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/codereply-backend:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           { "name": "NODE_ENV", "value": "production" },
           { "name": "LOG_LEVEL", "value": "info" }
         ],
         "secrets": [
           {
             "name": "DATABASE_URL",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:codereply/db-url"
           },
           {
             "name": "JWT_SECRET",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:codereply/jwt-secret"
           }
         ],
         "healthCheck": {
           "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
           "interval": 30,
           "timeout": 5,
           "retries": 3
         },
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/codereply-backend",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

5. **Create ECS Service**
   ```bash
   aws ecs create-service \
     --cluster codereply-cluster \
     --service-name codereply-backend-service \
     --task-definition codereply-backend \
     --desired-count 2 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
     --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=backend,containerPort=3000
   ```

6. **Run Database Migrations**
   ```bash
   # Create one-off task to run migrations
   aws ecs run-task \
     --cluster codereply-cluster \
     --task-definition codereply-backend \
     --launch-type FARGATE \
     --overrides '{"containerOverrides":[{"name":"backend","command":["npm","run","migrate"]}]}'
   ```

---

### Option 4: Docker (Self-Hosted)

**Prerequisites**:
- Docker 24+
- Docker Compose 2.x
- PostgreSQL (external or container)

**Create Docker Image** (`Dockerfile`):
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built app and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Run application
CMD ["node", "dist/index.js"]
```

**Docker Compose** (`docker-compose.yml`):
```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://codereply:password@db:5432/codereply
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - LOG_LEVEL=info
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=codereply
      - POSTGRES_USER=codereply
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U codereply"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

**Deploy with Docker Compose**:
```bash
# Set environment variables
export JWT_SECRET=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 24)

# Build and start
docker-compose up -d

# Run migrations
docker-compose exec backend npm run migrate

# Check logs
docker-compose logs -f backend

# Check health
curl http://localhost:3000/health
```

---

## Database Setup

### PostgreSQL Configuration

**Required PostgreSQL Extensions**:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search
```

**Create Database**:
```sql
CREATE DATABASE codereply;
CREATE USER codereply WITH PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE codereply TO codereply;
```

**Connection Pooling** (PgBouncer recommended for production):
```ini
[databases]
codereply = host=localhost port=5432 dbname=codereply

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

---

## Environment Configuration

### Required Environment Variables

**Production `.env`**:
```env
# Core
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Security
JWT_SECRET=[32+ character random string]

# Webhooks
WEBHOOK_TIMEOUT=10000
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAYS=1000,2000,4000

# Message Retry
MESSAGE_MAX_RETRIES=3
MESSAGE_RETRY_DELAYS=30000,60000,120000
MESSAGE_TTL_SECONDS=3600

# Monitoring (optional)
SENTRY_DSN=https://...
DD_AGENT_HOST=datadog-agent
```

### Generating Secrets

```bash
# JWT Secret (256-bit)
openssl rand -base64 32

# Database Password
openssl rand -base64 24

# API Key
openssl rand -hex 32
```

---

## Running Migrations

### Development
```bash
npm run migrate
```

### Production (Railway/Render)
```bash
# Railway
railway run npm run migrate

# Render (via shell)
# Go to Shell tab and run:
npm run migrate
```

### Production (Docker)
```bash
docker-compose exec backend npm run migrate
```

### Production (AWS ECS)
```bash
# Run one-off task
aws ecs run-task \
  --cluster codereply-cluster \
  --task-definition codereply-backend \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npm","run","migrate"]}]}'
```

---

## Health Checks

**Endpoints**:
- `/health` - Overall health status
- `/ready` - Readiness check (Kubernetes)
- `/live` - Liveness check (Kubernetes)

**Expected Response** (`/health`):
```json
{
  "status": "healthy",
  "timestamp": "2026-04-05T10:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

**Monitoring**:
```bash
# Continuous health check
watch -n 5 curl -s https://api.codereply.app/health | jq
```

---

## Rollback Procedures

### Railway
```bash
# View deployments
railway logs

# Rollback to previous deployment
railway rollback
```

### Render
1. Go to Dashboard → Service
2. Click on "Deploys" tab
3. Click "Rollback" on previous successful deploy

### AWS ECS
```bash
# Update service to previous task definition
aws ecs update-service \
  --cluster codereply-cluster \
  --service codereply-backend-service \
  --task-definition codereply-backend:3  # Previous version
```

### Docker
```bash
# Pull previous image
docker pull codereply-backend:previous-tag

# Update docker-compose.yml with previous tag
# Then:
docker-compose up -d
```

---

## Troubleshooting

### Common Issues

**Database connection errors**:
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check network connectivity
nc -zv db-host 5432
```

**Health check failures**:
```bash
# Check logs
docker logs backend-container
railway logs
kubectl logs pod-name

# Test health endpoint locally
curl http://localhost:3000/health

# Check database connectivity
psql $DATABASE_URL -c "SELECT 1"
```

**Migration failures**:
```bash
# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status

# Re-run migrations
npm run migrate
```

**Out of memory**:
```bash
# Increase container memory (Docker)
# Update docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 1G

# Increase ECS task memory
# Update task definition CPU/Memory
```

---

## Production Checklist

Before going live:

**Infrastructure**:
- [ ] Database backups configured (automated)
- [ ] SSL/TLS certificates configured
- [ ] Load balancer configured (if multi-instance)
- [ ] CDN configured (for static assets)
- [ ] DNS records updated

**Security**:
- [ ] Environment variables secured (Secrets Manager)
- [ ] Database credentials rotated
- [ ] API rate limiting enabled
- [ ] CORS configured properly
- [ ] Security headers configured

**Monitoring**:
- [ ] Error tracking (Sentry) configured
- [ ] APM (Datadog) configured
- [ ] Log aggregation setup
- [ ] Health checks configured
- [ ] Alerts configured

**Performance**:
- [ ] Database indexes created
- [ ] Connection pooling configured
- [ ] Caching configured (Redis)
- [ ] Compression enabled

**Compliance**:
- [ ] Data retention policies configured
- [ ] Audit logging enabled
- [ ] GDPR compliance verified
- [ ] Terms of Service updated

---

## Related Documentation

- **Monitoring**: `docs/MONITORING_AND_OBSERVABILITY.md`
- **Environment Config**: `src/backend/.env.example`
- **Testing**: `src/backend/tests/integration/README.md`
- **Security**: `src/backend/tests/SECURITY_TESTING.md`

---

**Last Updated**: April 5, 2026
**Status**: ✅ Production Ready
**Maintained by**: @howard, @sheldon
