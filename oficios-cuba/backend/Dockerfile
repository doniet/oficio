# Backend Dockerfile - Optimized for offline/restricted networks
# syntax = docker/dockerfile:1.4

# ─── DEPS STAGE (independent, uses node:20-alpine directly) ───
FROM node:20-alpine AS deps

# Install build dependencies for native modules (better-sqlite3, bcryptjs)
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# Configure npm for restricted networks
RUN npm config set registry https://registry.npmmirror.com \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 10000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set prefer-offline true \
    && npm config set audit false \
    && npm config set fund false \
    && npm config set loglevel warn

# Copy package files
COPY package.json package-lock.json* ./

# Install with BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-audit --no-fund --legacy-peer-deps 2>&1 | tail -20

# ─── BUILDER STAGE ───
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# ─── RUNNER STAGE (Production) ───
FROM node:20-alpine AS runner

ENV NODE_ENV=production

# Install only runtime dependencies
RUN apk add --no-cache \
    sqlite-libs \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

WORKDIR /app

# Copy built assets
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Create data directory (DB will be created at runtime)
RUN mkdir -p /app/data && chown nestjs:nodejs /app/data

# .env should be mounted at runtime via docker-compose

USER nestjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "dist/index.js"]