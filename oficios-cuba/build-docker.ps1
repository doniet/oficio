<# 
.SYNOPSIS
    Build Oficios Cuba Docker images with BuildKit optimizations
.DESCRIPTION
    Uses BuildKit cache mounts, npm mirror registry, and network optimizations
    for building in restricted network environments.
#>

param(
    [switch]$NoCache,
    [switch]$Dev,
    [switch]$Pull,
    [string]$Target = "runner"
)

# Enable BuildKit
$env:DOCKER_BUILDKIT = "1"
$env:COMPOSE_DOCKER_CLI_BUILD = "1"

# Build arguments
$buildArgs = @()
if ($NoCache) { $buildArgs += "--no-cache" }
if ($Pull) { $buildArgs += "--pull" }

Write-Host "🔧 Building Oficios Cuba Docker images..." -ForegroundColor Cyan
Write-Host "   BuildKit: ENABLED" -ForegroundColor Green
Write-Host "   npm registry: registry.npmmirror.com (Chinese mirror)" -ForegroundColor Green
Write-Host "   Cache mounts: ENABLED" -ForegroundColor Green
Write-Host "   DNS: 8.8.8.8, 1.1.1.1, 223.5.5.5" -ForegroundColor Green

# Build backend
Write-Host "`n📦 Building backend..." -ForegroundColor Yellow
docker build `
    --file backend/Dockerfile `
    --target $Target `
    --network host `
    --build-arg BUILDKIT_INLINE_CACHE=1 `
    $buildArgs `
    --tag oficios-cuba-backend:latest `
    ./backend

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Backend build failed"
    exit 1
}

# Build frontend
Write-Host "`n📦 Building frontend..." -ForegroundColor Yellow
docker build `
    --file frontend/Dockerfile `
    --target $Target `
    --network host `
    --build-arg BUILDKIT_INLINE_CACHE=1 `
    $buildArgs `
    --tag oficios-cuba-frontend:latest `
    ./frontend

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Frontend build failed"
    exit 1
}

Write-Host "`n✅ Build complete!" -ForegroundColor Green
Write-Host "   Images: oficios-cuba-backend:latest, oficios-cuba-frontend:latest" -ForegroundColor Cyan

if ($Dev) {
    Write-Host "`n🚀 Starting development environment..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
    Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "   Backend:  http://localhost:3000" -ForegroundColor Cyan
}