FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

COPY tsconfig.json .
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev


FROM node:20-alpine

RUN apk add --no-cache chromium

ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .

VOLUME ["/app/data"]
ENV DB_PATH=/app/data/motorapi.db

EXPOSE 3000
CMD ["node", "dist/index.js"]
