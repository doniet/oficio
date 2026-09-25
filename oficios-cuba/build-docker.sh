#!/bin/bash
# Build Oficios Cuba Docker images with BuildKit optimizations

set -e

# Enable BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

NO_CACHE=false
DEV=false
PULL=false
TARGET="runner"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache) NO_CACHE=true ;;
        --dev) DEV=true ;;
        --pull) PULL=true ;;
        --target) TARGET="$2"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

BUILD_ARGS=()
if $NO_CACHE; then BUILD_ARGS+=("--no-cache"); fi
if $PULL; then BUILD_ARGS+=("--pull"); fi

echo "🔧 Building Oficios Cuba Docker images..."
echo "   BuildKit: ENABLED"
echo "   npm registry: registry.npmmirror.com (Chinese mirror)"
echo "   Cache mounts: ENABLED"
echo "   DNS: 8.8.8.8, 1.1.1.1, 223.5.5.5"

# Build backend
echo ""
echo "📦 Building backend..."
docker build \
    --file backend/Dockerfile \
    --target "$TARGET" \
    --network host \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    "${BUILD_ARGS[@]}" \
    --tag oficios-cuba-backend:latest \
    ./backend

# Build frontend
echo ""
echo "📦 Building frontend..."
docker build \
    --file frontend/Dockerfile \
    --target "$TARGET" \
    --network host \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    "${BUILD_ARGS[@]}" \
    --tag oficios-cuba-frontend:latest \
    ./frontend

echo ""
echo "✅ Build complete!"
echo "   Images: oficios-cuba-backend:latest, oficios-cuba-frontend:latest"

if $DEV; then
    echo ""
    echo "🚀 Starting development environment..."
    docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
    echo "   Frontend: http://localhost:5173"
    echo "   Backend:  http://localhost:3000"
fi