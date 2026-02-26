FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nodeapp -G nodejs
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER nodeapp
EXPOSE 5001
CMD ["node", "src/server.js"]
