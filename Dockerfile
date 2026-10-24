FROM node:22-bookworm-slim

ARG LIGHTPANDA_VERSION=nightly
ARG TARGETARCH

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LIGHTPANDA_BIN=/usr/local/bin/lightpanda \
    DG_BROWS_ALLOW_PRIVATE=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libgcc-s1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="${TARGETARCH:-amd64}"; \
    case "$arch" in \
      amd64) lp_arch="x86_64" ;; \
      arm64) lp_arch="aarch64" ;; \
      *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --retry 3 -o /usr/local/bin/lightpanda \
      "https://github.com/lightpanda-io/browser/releases/download/${LIGHTPANDA_VERSION}/lightpanda-${lp_arch}-linux"; \
    chmod 0755 /usr/local/bin/lightpanda; \
    lightpanda version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=6s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
