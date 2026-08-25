# Baileys WhatsApp bridge — no browser, pure WebSocket
FROM node:22-bookworm-slim

WORKDIR /bridge

COPY baileys-bridge/package*.json ./
RUN npm ci --no-audit --no-fund

COPY baileys-bridge/bridge.js ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "bridge.js"]
