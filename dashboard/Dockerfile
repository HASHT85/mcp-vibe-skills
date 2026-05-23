# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Cache buster — update this value to force a full rebuild
ARG CACHE_BUSTER=20260523-2100
RUN echo "Cache buster: $CACHE_BUSTER"

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx vite build

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
