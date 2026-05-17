FROM node:20.19.0-alpine3.21 AS build
WORKDIR /app

# Cache buster to force a rebuild on the VPS
ARG CACHE_BUSTER=2026-03-11T19:03:00

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.19.0-alpine3.21
WORKDIR /app

ENV PORT=8080
ENV STORE_PATH=/data/store.json

# Install OS utilities + Docker CLI for spawning project containers
RUN apk add --no-cache git curl bash docker-cli docker-cli-compose

# Configure git globally so agents can commit
RUN git config --global user.email "veist@auto.dev" && \
    git config --global user.name "veist"

# SEC-11: Non-root user with docker group access
RUN addgroup -g 999 docker 2>/dev/null || true && \
    adduser -D -u 1001 veist && \
    addgroup veist docker 2>/dev/null || true && \
    apk add --no-cache su-exec

RUN mkdir -p /data /workspace

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

EXPOSE 8080

VOLUME ["/data", "/workspace"]

# SEC-11: Start as root to fix volume permissions, then drop to veist user
CMD ["sh", "-c", "chown -R veist:veist /data /workspace 2>/dev/null; git config --global user.email veist@auto.dev && git config --global user.name veist && exec su-exec veist node dist/index.js"]
