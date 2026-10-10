FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S kart && adduser -S kart -G kart
COPY --chown=kart:kart --from=builder /app/package*.json ./
COPY --chown=kart:kart --from=builder /app/node_modules ./node_modules
COPY --chown=kart:kart --from=builder /app/.next ./.next
USER kart
EXPOSE 3000
CMD ["npm", "start"]
