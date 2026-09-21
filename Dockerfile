# --- build the static bundle ---
# Build stage runs on the builder's native arch ($BUILDPLATFORM) — it only emits
# arch-independent static files, so no emulation is needed when cross-building.
FROM --platform=$BUILDPLATFORM node:22.13.0-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- serve it as static files (no Node, no Cloudflare) ---
# Runtime image arch is chosen by `docker buildx build --platform`, e.g. linux/amd64.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh
EXPOSE 8080
