FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Every service and release is built from this one file (see scripts/cluster.mjs).
# The build args come last so all images share the dependency layer above.
ARG SERVICE
ARG APP_VERSION
ARG RELEASE_DEFECT=""
ENV SERVICE=$SERVICE \
    APP_VERSION=$APP_VERSION \
    RELEASE_DEFECT=$RELEASE_DEFECT

USER node
EXPOSE 8080
CMD ["node", "src/main.js"]
