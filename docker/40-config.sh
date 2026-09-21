#!/bin/sh
# Runs automatically before nginx starts (stock nginx image sources
# /docker-entrypoint.d/*.sh). Writes the runtime config the SPA fetches, so the
# sheet URLs / refresh cadence can change with a container restart — no rebuild.
# If SHEET_CSV_PROJECTS is not provided, the config.json baked into the image
# (from public/config.json) is kept, so the image still works out of the box.
#
# SHEET_CSV_PROJECTS   -> the "Master Portfolio" tab (gid=1001) as CSV
# SHEET_CSV_MILESTONES -> the "Milestones" tab (gid=1002) as CSV; optional,
#                         the Timeline simply shows no markers without it.
set -e
if [ -n "${SHEET_CSV_PROJECTS:-}" ]; then
  cat > /usr/share/nginx/html/config.json <<JSON
{
  "csvProjects": "${SHEET_CSV_PROJECTS}",
  "csvMilestones": "${SHEET_CSV_MILESTONES:-}",
  "refreshSeconds": ${REFRESH_SECONDS:-300}
}
JSON
  echo "[40-config] wrote config.json from env (refreshSeconds=${REFRESH_SECONDS:-300}, milestones=$([ -n "${SHEET_CSV_MILESTONES:-}" ] && echo yes || echo no))"
else
  echo "[40-config] SHEET_CSV_PROJECTS not set; keeping baked config.json"
fi
