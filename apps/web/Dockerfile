# The OpsPilot console: the Vite build, served by an nginx that runs as a non-root user.
# Built from the repository root:
#   docker build -f apps/web/Dockerfile -t opspilot/web .

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @opspilot/web
COPY apps/web apps/web
RUN npm run build --workspace @opspilot/web

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY apps/web/nginx/ /etc/nginx/conf.d/
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
