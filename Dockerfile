FROM node:20-alpine

WORKDIR /app

# Install deps first (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy app
COPY server.js ./
COPY public/ ./public/
COPY data/ ./data/

# Port
EXPOSE 8080
ENV PORT=8080

CMD ["node", "server.js"]
