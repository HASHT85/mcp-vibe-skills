# Build Stage
FROM node:20-alpine as build

WORKDIR /app

# Cache buster to force a rebuild on the VPS
ARG CACHE_BUSTER=20260311-2140

ENV NODE_OPTIONS="--max-old-space-size=512"

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
# Capture build output for debugging
RUN npx vite build > /tmp/build.log 2>&1 || (echo "=== BUILD FAILED ===" && cat /tmp/build.log && exit 1)

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
