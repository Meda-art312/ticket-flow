FROM node:24.21.0-bookworm-slim AS dependency
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependency AS development
COPY . .
CMD ["npm", "run", "dev"]

FROM development AS build
RUN npm run build

FROM development AS test
CMD ["npm", "run", "check"]

FROM dependency AS runtime-dependency
RUN npm prune --omit=dev

FROM node:24.21.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=runtime-dependency --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/docs/openapi.json ./docs/openapi.json
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
