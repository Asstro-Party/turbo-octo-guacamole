# Root-level Dockerfile for Railway (if root directory cannot be changed)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy backend package files (including package-lock.json)
COPY backend/package.json backend/package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/ ./

# Expose ports
EXPOSE 3000 3001

# Start the server
CMD ["npm", "start"]
