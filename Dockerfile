FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json .npmrc ./
COPY scripts/build-map.mjs scripts/build-map.mjs
RUN npm ci
COPY server server
COPY src/core/models.ts src/core/models.ts
COPY src/domain.ts src/domain.ts
RUN npm run server:build

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production MOTOSALT_API_PORT=3001 MOTOSALT_DATABASE_PATH=/data/motosalt.sqlite
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server-dist/server/index.js"]
