FROM node:24.21.0-bookworm-slim AS dependency
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependency AS development
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev"]

FROM development AS test
CMD ["npm", "run", "check"]

FROM development AS build
RUN npm run build

FROM nginx:1.30.5-alpine AS production
RUN mkdir -p /tmp/nginx /app && chown -R nginx:nginx /tmp/nginx /app
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx.template.conf /app/nginx.template.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]

FROM mcr.microsoft.com/playwright:v1.64.0-noble AS e2e
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "e2e"]
