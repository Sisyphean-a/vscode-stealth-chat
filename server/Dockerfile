FROM node:18-alpine

WORKDIR /app

# Copy package manifests first for layer cache
COPY server/package*.json ./server/

# Install dependencies
# Using npmmirror just in case, but much lighter now
RUN npm config set registry https://registry.npmmirror.com
RUN cd server && npm install --production

# Copy source code and shared packages
COPY server ./server
COPY packages ./packages

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Volume for data persistence
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server/src/index.js"]
