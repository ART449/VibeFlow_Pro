FROM node:18-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for Docker cache)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy app code
COPY . .

# Create data directory
RUN mkdir -p data data/backups

EXPOSE 8080

CMD ["node", "server.js"]
