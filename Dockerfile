# Host-family image. Build the family first:
#   node scripts/package-host-family.js ... --output dist/host-family
#   docker build --build-arg HOST_FAMILY=dist/host-family -t ghcr.io/cinyuverse/cinyuverse-server .
ARG HOST_FAMILY=dist/host-family
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git libsqlite3-0 nodejs npm bubblewrap curl \
    && rm -rf /var/lib/apt/lists/*
ARG HOST_FAMILY
COPY ${HOST_FAMILY}/cinyuverse-server /usr/local/bin/cinyuverse-server
COPY ${HOST_FAMILY}/cinyuverse-mcp /usr/local/bin/cinyuverse-mcp
COPY ${HOST_FAMILY}/cinyuverse-workflow-mcp /usr/local/bin/cinyuverse-workflow-mcp
COPY ${HOST_FAMILY}/web /app/web
COPY ${HOST_FAMILY}/plugins/bundled /app/plugins/bundled
RUN chmod 755 /usr/local/bin/cinyuverse-server /usr/local/bin/cinyuverse-mcp /usr/local/bin/cinyuverse-workflow-mcp
ENV CINYUVERSE_STATIC_ROOT=/app/web
ENV CINYUVERSE_DATA_DIR=/data
ENV CINYUVERSE_SERVER_LISTEN=0.0.0.0:17891
ENV CINYUVERSE_SERVER_ALLOW_LAN=1
EXPOSE 17891
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://127.0.0.1:17891/health >/dev/null || exit 1
CMD ["cinyuverse-server"]
