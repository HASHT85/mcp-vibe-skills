# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Cache buster
ARG CACHE_BUSTER=20260311-2156

COPY package*.json ./
RUN npm install --legacy-peer-deps && echo "=== NPM INSTALL OK ===" && ls node_modules/.bin/vite

COPY . .
RUN ls -la && echo "=== FILES COPIED ==="
RUN node node_modules/.bin/vite build

# Serve Stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
