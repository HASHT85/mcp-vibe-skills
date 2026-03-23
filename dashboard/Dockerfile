# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Cache buster
ARG CACHE_BUSTER=20260311-2200

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx vite build

# Serve Stage
FROM nginx:alpine

LABEL org.opencontainers.image.source="https://github.com/HASHT85/mcp-vibe-skills"
LABEL org.opencontainers.image.description="VEIST Dashboard"
LABEL org.opencontainers.image.licenses="MIT"

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
