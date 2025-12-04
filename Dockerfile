# Dockerfile for Backend (Railpack/Railway deployment)
FROM node:20-alpine

# Install netcat for health checks
RUN apk add --no-cache netcat-openbsd

# Set working directory
WORKDIR /app

# Copy backend package files first for better caching
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/ ./

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD nc -z localhost 3000 || exit 1

# Start the server
CMD ["npm", "start"]

