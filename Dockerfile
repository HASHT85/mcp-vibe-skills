FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORE_PATH=/data/store.json

RUN mkdir -p /data /workspace

# Install Node dependencies first
COPY package*.json ./
RUN npm install --omit=dev

# Install OS utilities
RUN apt-get update && apt-get install -y git curl bash && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist

EXPOSE 8080

VOLUME ["/data", "/workspace"]

CMD ["node", "dist/index.js"]
