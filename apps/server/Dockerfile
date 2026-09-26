# The OpsPilot API. Built from the repository root, since it needs the workspace lockfile and
# the runbooks:
#   docker build -f apps/server/Dockerfile -t opspilot/server .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Both workspace manifests, so npm ci finds the lockfile in step with them
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @opspilot/server && npm cache clean --force
# ONNX Runtime ships binaries for every platform and GPU, but embeddings run on Linux CPUs
# only. The browser runtime is unused too: transformers.js bundles what it needs of it. That
# leaves out about 550 MB.
RUN rm -rf node_modules/onnxruntime-web \
  && cd node_modules/onnxruntime-node/bin/napi-v6 \
  && rm -rf darwin win32 linux/*/libonnxruntime_providers_cuda.so linux/*/libonnxruntime_providers_tensorrt.so
# Fetch the embedding model now: the server then starts without network access to Hugging
# Face, and its user doesn't need write access to the cache.
COPY apps/server/src/knowledge/embedding-model.js ./
RUN node --input-type=module -e "await (await import('./embedding-model.js')).loadEmbeddingModel()"

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY runbooks runbooks
USER node
EXPOSE 4000
CMD ["node", "apps/server/src/index.js"]
