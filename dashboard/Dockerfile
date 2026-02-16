# Build Stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Serve Stage
FROM nginx:alpine

# Install apache2-utils for htpasswd
RUN apk add --no-cache apache2-utils

# Create .htpasswd from env vars (default: admin/vibe123)
ARG DASHBOARD_USER=admin
ARG DASHBOARD_PASS=vibe123
RUN htpasswd -cb /etc/nginx/.htpasswd ${DASHBOARD_USER} ${DASHBOARD_PASS}

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
