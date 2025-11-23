# Stage 1: build
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build || echo "no build step"

# Stage 2: production
FROM node:18-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --only=production

# Adjust this path if your build output is not in dist/
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
