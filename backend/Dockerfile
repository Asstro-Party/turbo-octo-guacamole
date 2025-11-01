# Dockerfile for Backend (Railway)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files (including package-lock.json)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose ports
EXPOSE 3000 3001

# Start the server
CMD ["npm", "start"]
