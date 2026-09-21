# IT Executive Portfolio Hub

A lightweight executive dashboard that renders a **live Google Sheet** as a portfolio view.
It's a plain **client-side React (Vite) single-page app** served as static files by **nginx**
in Docker — intended for **intranet hosting**. No backend, no database, no Cloudflare, no
secrets: the browser fetches a published read-only CSV and renders it on every page load.

## How it works

```
Admin edits the Google Sheet  ──▶  Browser loads the page  ──▶  fetch(/config.json) → CSV URL
                                                            └─▶  fetch(CSV) → parse → render
```

- The sheet is the single source of truth. Edit it, reload the page, the data updates.
- The sheet URL is a **runtime config value** (`/config.json`), injected into the container
  from the `SHEET_CSV_PROJECTS` env var at start — so you can point at a different sheet
  **without rebuilding**.
- There is no app-side cache; every load fetches fresh (Google caches published CSVs ~1–2 min).

## Data source

- **Sheet columns rendered:** `Project Name`, `Project Impact`, `Start Date`, `End Date`,
  `Project Owner`, `Department`. Keep the header row exactly as-is. Extra columns are ignored
  until the UI is extended.
- **Access:** share the sheet as *Anyone with the link → Viewer* (or *Publish to web → CSV*).
- **CSV URL** (gviz form): `https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&gid=0`
- Dates accept `YYYY-MM-DD`, `D-Mon-YYYY` (e.g. `10-Sep-2026`), or `M/D/YYYY`; status
  (Upcoming / Active / Completed) is derived from the dates automatically.

## Project structure

| Path | Purpose |
|---|---|
| `index.html`, `src/main.tsx` | Vite entry — mounts the React app |
| `app/page.tsx` | The dashboard: **Overview**, **Projects**, **Timeline** |
| `app/globals.css` | All styling |
| `app/data.ts` | `logoData` only (the brand logo as a data URI) |
| `lib/sheet.ts` | Fetch + parse CSV, normalize dates |
| `public/config.json` | Dev-time config (sheet URL); overwritten in the container at runtime |
| `Dockerfile`, `docker/`, `docker-compose.yml` | Multi-stage build → nginx static serving |
| `RUNBOOK_DOCKER_GOOGLE_SHEETS.md` | Full setup / operations / troubleshooting guide |
| `INFRA_HANDOFF.md` | Build, push and run the container — hand this to the infra team |
| `DEPLOYMENT_GUIDE_AR.md` | Arabic deployment guide |

## Prerequisites

- Node.js `>=22.13.0` and pnpm `11.x` (for local development)
- Docker (for building and running the container)

## Local development

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

The dev server reads the sheet URL from `public/config.json`. To point at a different sheet
temporarily, either edit that file or set an env var:

```sh
VITE_SHEET_CSV_PROJECTS='https://docs.google.com/.../gviz/tq?tqx=out:csv&gid=0' pnpm dev
```

## Build & run in Docker (intranet)

Set your sheet URL in `docker-compose.yml` (`SHEET_CSV_PROJECTS`), then:

```sh
docker compose up -d --build      # serves on http://<host>:8080
```

To change the sheet or refresh cadence later, edit `SHEET_CSV_PROJECTS` / `REFRESH_SECONDS`
in `docker-compose.yml` and run `docker compose up -d` again — **no rebuild needed**.

> `REFRESH_SECONDS` (default 300) makes open tabs re-fetch automatically; set `0` to fetch
> only on load.

## Requirement & fallback

The **browser** fetches the sheet directly, so viewers' browsers must reach
`docs.google.com` over HTTPS. If your intranet blocks that, enable the nginx reverse-proxy in
`docker/nginx.conf` (the commented `/sheet/` block) so only the **container** needs egress —
see §7 of the runbook.

## Scripts

- `pnpm dev` — Vite dev server (HMR) on port 5173
- `pnpm build` — production build to `dist/`
- `pnpm preview` — preview the built bundle on port 8080

For anything beyond the basics (sheet setup, operations, failure modes, hardening) see
**`RUNBOOK_DOCKER_GOOGLE_SHEETS.md`**.
