# Build Stage
FROM node:20-alpine as build

WORKDIR /app

# Cache buster to force a rebuild on the VPS
ARG CACHE_BUSTER=2026-03-11T20:18:00

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

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
