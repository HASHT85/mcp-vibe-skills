FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORE_PATH=/data/store.json

RUN mkdir -p /data /workspace

# Install Node dependencies first
COPY package*.json ./
RUN npm install --omit=dev

# Install OS utilities (alpine version)
RUN apk update && apk add --no-cache git curl bash

COPY --from=build /app/dist ./dist

EXPOSE 8080

VOLUME ["/data", "/workspace"]

CMD ["node", "dist/index.js"]
