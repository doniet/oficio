# Docker management script for Oficios Cuba (PowerShell)

param(
    [string]$Command = "help"
)

$COMPOSE_FILE = "docker-compose.yml"
$COMPOSE_CMD = "docker compose -f $COMPOSE_FILE"

function Show-Help {
    Write-Host "Usage: .\docker-manage.ps1 <command>" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  up           - Start all services"
    Write-Host "  down         - Stop all services"
    Write-Host "  restart      - Restart all services"
    Write-Host "  logs [svc]   - View logs (optionally for specific service)"
    Write-Host "  build        - Build all images"
    Write-Host "  rebuild      - Rebuild and start"
    Write-Host "  init-db      - Initialize database (run once)"
    Write-Host "  reset-db     - Reset database (deletes all data)"
    Write-Host "  shell-backend - Open shell in backend container"
    Write-Host "  shell-frontend - Open shell in frontend container"
    Write-Host "  status       - Show container status"
    Write-Host "  dev          - Start in development mode"
    Write-Host ""
}

switch ($Command) {
    "up" {
        Write-Host "🚀 Starting Oficios Cuba..." -ForegroundColor Green
        & $COMPOSE_CMD up -d
        Write-Host "✅ Services started!" -ForegroundColor Green
        Write-Host "   Frontend: http://localhost" -ForegroundColor Cyan
        Write-Host "   Backend API: http://localhost:3000" -ForegroundColor Cyan
        Write-Host "   API Health: http://localhost:3000/api/health" -ForegroundColor Cyan
    }
    "down" {
        Write-Host "🛑 Stopping Oficios Cuba..." -ForegroundColor Yellow
        & $COMPOSE_CMD down
        Write-Host "✅ Services stopped!" -ForegroundColor Green
    }
    "restart" {
        Write-Host "🔄 Restarting Oficios Cuba..." -ForegroundColor Yellow
        & $COMPOSE_CMD restart
        Write-Host "✅ Services restarted!" -ForegroundColor Green
    }
    "logs" {
        $service = if ($args.Count -gt 0) { $args[0] } else { "" }
        & $COMPOSE_CMD logs -f $service
    }
    "build" {
        Write-Host "🔨 Building images..." -ForegroundColor Cyan
        & $COMPOSE_CMD build --no-cache
        Write-Host "✅ Build complete!" -ForegroundColor Green
    }
    "rebuild" {
        Write-Host "🔨 Rebuilding and starting..." -ForegroundColor Cyan
        & $COMPOSE_CMD down
        & $COMPOSE_CMD build --no-cache
        & $COMPOSE_CMD up -d
        Write-Host "✅ Rebuild complete!" -ForegroundColor Green
    }
    "init-db" {
        Write-Host "🗄️ Initializing database..." -ForegroundColor Cyan
        & $COMPOSE_CMD --profile init run --rm db-init
        Write-Host "✅ Database initialized!" -ForegroundColor Green
    }
    "reset-db" {
        Write-Host "⚠️  Resetting database (this will delete all data)..." -ForegroundColor Red
        $confirm = Read-Host "Are you sure? (y/N)"
        if ($confirm -eq 'y' -or $confirm -eq 'Y') {
            & $COMPOSE_CMD down -v
            & $COMPOSE_CMD --profile init run --rm db-init
            Write-Host "✅ Database reset complete!" -ForegroundColor Green
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
        }
    }
    "shell-backend" {
        & $COMPOSE_CMD exec backend sh
    }
    "shell-frontend" {
        & $COMPOSE_CMD exec frontend sh
    }
    "status" {
        & $COMPOSE_CMD ps
    }
    "dev" {
        Write-Host "🚀 Starting in development mode..." -ForegroundColor Green
        docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
        Write-Host "✅ Development services started!" -ForegroundColor Green
        Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
        Write-Host "   Backend API: http://localhost:3000" -ForegroundColor Cyan
    }
    default {
        Show-Help
    }
}