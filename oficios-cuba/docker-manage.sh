#!/bin/bash
# Docker management script for Oficios Cuba

set -e

COMPOSE_FILE="docker-compose.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE"

case "$1" in
    up)
        echo "🚀 Starting Oficios Cuba..."
        $COMPOSE_CMD up -d
        echo "✅ Services started!"
        echo "   Frontend: http://localhost"
        echo "   Backend API: http://localhost:3000"
        echo "   API Health: http://localhost:3000/api/health"
        ;;
    down)
        echo "🛑 Stopping Oficios Cuba..."
        $COMPOSE_CMD down
        echo "✅ Services stopped!"
        ;;
    restart)
        echo "🔄 Restarting Oficios Cuba..."
        $COMPOSE_CMD restart
        echo "✅ Services restarted!"
        ;;
    logs)
        $COMPOSE_CMD logs -f "${2:-}"
        ;;
    build)
        echo "🔨 Building images..."
        $COMPOSE_CMD build --no-cache
        echo "✅ Build complete!"
        ;;
    rebuild)
        echo "🔨 Rebuilding and starting..."
        $COMPOSE_CMD down
        $COMPOSE_CMD build --no-cache
        $COMPOSE_CMD up -d
        echo "✅ Rebuild complete!"
        ;;
    init-db)
        echo "🗄️ Initializing database..."
        $COMPOSE_CMD --profile init run --rm db-init
        echo "✅ Database initialized!"
        ;;
    reset-db)
        echo "⚠️  Resetting database (this will delete all data)..."
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $COMPOSE_CMD down -v
            $COMPOSE_CMD --profile init run --rm db-init
            echo "✅ Database reset complete!"
        else
            echo "Cancelled."
        fi
        ;;
    shell-backend)
        $COMPOSE_CMD exec backend sh
        ;;
    shell-frontend)
        $COMPOSE_CMD exec frontend sh
        ;;
    status)
        $COMPOSE_CMD ps
        ;;
    *)
        echo "Usage: $0 {up|down|restart|logs|build|rebuild|init-db|reset-db|shell-backend|shell-frontend|status}"
        echo ""
        echo "Commands:"
        echo "  up           - Start all services"
        echo "  down         - Stop all services"
        echo "  restart      - Restart all services"
        echo "  logs [svc]   - View logs (optionally for specific service)"
        echo "  build        - Build all images"
        echo "  rebuild      - Rebuild and start"
        echo "  init-db      - Initialize database (run once)"
        echo "  reset-db     - Reset database (deletes all data)"
        echo "  shell-backend - Open shell in backend container"
        echo "  shell-frontend - Open shell in frontend container"
        echo "  status       - Show container status"
        exit 1
        ;;
esac