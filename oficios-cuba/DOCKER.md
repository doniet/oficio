# Docker Deployment Guide - Oficios Cuba

## Quick Start

### Production
```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with your production values (JWT_SECRET, Stripe keys, etc.)

# 2. Build and start
docker compose up -d --build

# 3. Initialize database (first time only)
docker compose --profile init run --rm db-init

# 4. Check status
docker compose ps
```

### Development
```bash
# Start with hot reload
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# Or use the management script
.\docker-manage.ps1 dev
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80/443 | Nginx + React (production) |
| Frontend Dev | 5173 | Vite dev server (development) |
| Backend | 3000 | Express API |
| Backend Debug | 9229 | Node inspector (development) |

## Management Commands

### Using PowerShell script (Windows)
```powershell
.\docker-manage.ps1 up          # Start production
.\docker-manage.ps1 dev         # Start development
.\docker-manage.ps1 down        # Stop all
.\docker-manage.ps1 logs        # View all logs
.\docker-manage.ps1 logs backend # View backend logs
.\docker-manage.ps1 build       # Build images
.\docker-manage.ps1 rebuild     # Rebuild and restart
.\docker-manage.ps1 init-db     # Initialize database
.\docker-manage.ps1 reset-db    # Reset database (⚠️ deletes data)
.\docker-manage.ps1 status      # Show container status
.\docker-manage.ps1 shell-backend # Open backend shell
```

### Using Docker Compose directly
```bash
# Production
docker compose up -d --build
docker compose down
docker compose logs -f backend

# Development
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
docker compose -f docker-compose.yml -f docker-compose.override.yml down

# Database
docker compose --profile init run --rm db-init
```

## Environment Variables

Create `.env` file from `.env.example`:

```env
# Required
JWT_SECRET=your-super-secret-key-min-32-characters
NODE_ENV=production

# Optional - Stripe for payments
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# Optional - Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Database Persistence

Data is stored in Docker volume `backend_data`:
- SQLite database: `/app/data/oficios.db`
- Survives container restarts
- To backup: `docker run --rm -v oficios-cuba_backend_data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .`

## SSL/HTTPS Setup (Production)

1. Obtain SSL certificates (Let's Encrypt recommended)
2. Place in `./ssl/` directory:
   - `cert.pem` - Certificate
   - `key.pem` - Private key
3. Update `frontend/nginx.conf` to listen on 443 with SSL
4. Restart frontend: `docker compose restart frontend`

## Health Checks

Both services have health checks:
- Backend: `GET /api/health`
- Frontend: `GET /health`

Monitor with: `docker compose ps` (shows health status)

## Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend

# Last 100 lines
docker compose logs --tail=100 backend
```

## Troubleshooting

### Database not initialized
```bash
docker compose --profile init run --rm db-init
```

### Permission issues (Linux/macOS)
```bash
# Fix volume permissions
docker run --rm -v oficios-cuba_backend_data:/data alpine chown -R 1001:1001 /data
```

### Port conflicts
Change ports in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"    # Frontend on 8080
  - "3001:3000"  # Backend on 3001
```

### Reset everything
```bash
docker compose down -v          # Remove containers + volumes
docker system prune -f          # Clean up unused images
docker compose up -d --build    # Fresh start
```

## Production Checklist

- [ ] Strong `JWT_SECRET` (32+ random chars)
- [ ] Stripe live keys configured
- [ ] SSL certificates installed
- [ ] Domain DNS pointing to server
- [ ] Firewall: only 80/443 open (3000 internal)
- [ ] Regular database backups scheduled
- [ ] Log rotation configured
- [ ] Monitoring/alerting set up

## Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│   Frontend      │  (Nginx:80/443)
│   React + Vite  │
└────────┬────────┘
         │ /api/*
         ▼
┌─────────────────┐
│   Backend       │  (Express:3000)
│   API + SQLite  │
└─────────────────┘
```

## Resource Requirements

Minimum:
- 1 CPU core
- 1 GB RAM
- 2 GB disk space

Recommended:
- 2 CPU cores
- 2 GB RAM
- 5 GB disk space