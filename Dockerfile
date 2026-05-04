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

RUN mkdir -p /data /workspace

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

EXPOSE 8080

VOLUME ["/data", "/workspace"]

CMD ["sh", "-c", "git config --global user.email veist@auto.dev && git config --global user.name veist && exec node dist/index.js"]
