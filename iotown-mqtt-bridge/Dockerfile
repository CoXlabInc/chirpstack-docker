# Web UI
FROM node:22-alpine AS ui

WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
# Only sources, so a local ui/node_modules never replaces the Linux one
COPY ui/index.html ui/vite.config.ts ui/tsconfig.json ./
COPY ui/src ./src
RUN npm run build

# Bridge
FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies (package.json is also read at runtime for the version)
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy source code and the built web UI
COPY --chown=node:node src/ ./src/
COPY --from=ui --chown=node:node /ui/dist ./ui/dist

# Run as non-privileged user
USER node

# Web UI
EXPOSE 8081

CMD ["node", "src/index.js"]
