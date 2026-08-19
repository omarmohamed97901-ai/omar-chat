# Zero native-build dependencies (uses Node's built-in SQLite), so this
# image builds identically on any platform: Railway, Render, Fly.io, etc.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV DATABASE_PATH=/data/chat.db

# /data is where you should mount a persistent volume on your host,
# so the chat database survives restarts and redeploys.
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "src/server.js"]
