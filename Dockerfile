# Single-container deploy: builds the React app and serves it from the API.
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package*.json server/
RUN npm --prefix server ci --omit=dev
COPY server/ server/
COPY --from=client-build /app/client/dist client/dist
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "server/src/index.js"]
