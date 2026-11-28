FROM node:22-alpine

# Install lightweight system utilities for SSH, Docker CLI control, and Ping diagnostics
RUN apk add --no-cache openssh-client docker-cli iputils bash

WORKDIR /app

# Copy package manifests and install runtime dependencies only
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy pre-compiled frontend (dist/), backend (dist-server/), and CLI entrypoint
COPY bin ./bin
COPY dist ./dist
COPY dist-server ./dist-server
COPY public ./public

# Persistent data directory for cluster nodes, security PIN, and VPS configs
RUN mkdir -p /app/data

ENV PORT=4000
ENV HOST=0.0.0.0
ENV SMARTMAC_DATA_DIR=/app/data

EXPOSE 4000

CMD ["node", "./dist-server/index.js"]
