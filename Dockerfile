FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV STORE_PATH=/data/store.json

# Create data directory for persistence
RUN mkdir -p /data

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built application
COPY --from=build /app/dist ./dist

# Expose the configured port
EXPOSE 8080

# Health check for Dokploy/orchestrators
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
