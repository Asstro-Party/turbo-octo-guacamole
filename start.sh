#!/bin/bash
set -e

echo "🚀 Starting Astro Party Backend..."

# Navigate to backend directory
cd backend || exit 1

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --omit=dev

# Start the server
echo "🎮 Starting server on port ${PORT:-3000}..."
exec npm start

