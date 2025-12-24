FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY --chown=node:node src/ ./src/

# Run as non-privileged user
USER node

CMD ["node", "src/index.js"]
