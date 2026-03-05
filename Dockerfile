FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORE_PATH=/data/store.json

# Install OS utilities
RUN apk add --no-cache git curl bash

RUN mkdir -p /data /workspace

# Install all dependencies (including dev for compilation)
COPY package*.json ./
RUN npm install

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

EXPOSE 8080

VOLUME ["/data", "/workspace"]

CMD ["node", "dist/index.js"]
