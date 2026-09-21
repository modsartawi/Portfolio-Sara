#!/bin/sh
# Runs automatically before nginx starts (stock nginx image sources
# /docker-entrypoint.d/*.sh). Writes the runtime config the SPA fetches, so the
# sheet URL / refresh cadence can change with a container restart — no rebuild.
# If SHEET_CSV_PROJECTS is not provided, the config.json baked into the image
# (from public/config.json) is kept, so the image still works out of the box.
set -e
if [ -n "${SHEET_CSV_PROJECTS:-}" ]; then
  cat > /usr/share/nginx/html/config.json <<EOF
{
  "csvProjects": "${SHEET_CSV_PROJECTS}",
  "refreshSeconds": ${REFRESH_SECONDS:-300}
}
EOF
  echo "[40-config] wrote config.json from env (refreshSeconds=${REFRESH_SECONDS:-300})"
else
  echo "[40-config] SHEET_CSV_PROJECTS not set; keeping baked config.json"
fi
