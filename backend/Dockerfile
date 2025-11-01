# Dockerfile for Backend (Railway)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose ports
EXPOSE 3000 3001

# Start the server
CMD ["npm", "start"]
