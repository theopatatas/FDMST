# Single-service deploy: builds the React frontend and serves it, the API
# (/api) and Socket.IO from the Express backend on one domain.
FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# Optional: point the frontend at a different API. Empty means same-domain /api.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-alpine AS production

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5050
WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm ci --prefix backend --omit=dev && npm cache clean --force

COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node --from=frontend-build /app/frontend/dist ./frontend/dist

USER node
EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/ready || exit 1

CMD ["node", "backend/server.js"]
