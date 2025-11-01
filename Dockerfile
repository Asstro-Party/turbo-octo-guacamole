# Root-level Dockerfile for Railway (if root directory cannot be changed)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./

# Expose ports
EXPOSE 3000 3001

# Start the server
CMD ["npm", "start"]
