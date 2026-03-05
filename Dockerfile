FROM node:20.19.0-alpine3.21 AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.19.0-alpine3.21
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORE_PATH=/data/store.json

# Install OS utilities
RUN apk add --no-cache git curl bash

RUN mkdir -p /data /workspace

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

EXPOSE 8080

VOLUME ["/data", "/workspace"]

CMD ["node", "dist/index.js"]
