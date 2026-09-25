# Frontend Dockerfile - Optimized for offline/restricted networks
# syntax = docker/dockerfile:1.4

# ─── BASE ───
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache git

WORKDIR /app

# Verify npm is available
RUN npm --version

# ─── DEPS STAGE (with BuildKit cache mount) ───
FROM base AS deps

# Configure npm for restricted networks - use Chinese mirror which is often more accessible
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
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV VITE_API_URL=http://localhost:3000/api

# Build production assets
RUN npm run build

# ─── RUNNER STAGE (nginx) ───
FROM nginx:alpine AS runner

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create nginx cache directories
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]