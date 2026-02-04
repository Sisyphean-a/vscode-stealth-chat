FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
# Using npmmirror just in case, but much lighter now
RUN npm config set registry https://registry.npmmirror.com
RUN npm install --production

# Copy source code
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Volume for data persistence
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "src/index.js"]
