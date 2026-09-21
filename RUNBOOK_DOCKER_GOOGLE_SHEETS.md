# Runbook — Portfolio Hub: dynamic Google Sheet + Docker (intranet), no Cloudflare

**Goal:** make the dashboard render live from a Google Sheet instead of the baked
`app/data.ts` literal, and host it as a plain static container on the intranet — **no
Cloudflare / wrangler / workerd in the middle.**

**Design in one line:** the browser fetches a *published* Google-Sheet CSV directly and
renders it; the container is just **nginx serving static files**. No backend, no server-side
fetch, no secrets in the image.

**The one assumption** (verify in §6): the machine that fetches the CSV can reach
`docs.google.com` over HTTPS, and the sheet may be *published read-only*. By default the
*browser* fetches. If your intranet blocks browser→internet, or the data can't be public,
use the **§7 nginx-proxy fallback** — then only the container needs egress and the sheet URL
never reaches the client.

> **As built (2026-09-21):** implemented and validated end-to-end. The dashboard was
> **simplified to the sheet's actual 6 columns** (see §1.1). Docker image builds, the
> container serves on `:8080`, `config.json` is injected from env, and the gviz CSV endpoint
> returns `200 text/csv` with CORS — so the browser fetches it directly, **no proxy needed**.
> The as-built code lives in `lib/sheet.ts` (fetch/parse/date-normalize) and `app/page.tsx`
> (Overview / Projects / Timeline). This is **one tab, one CSV**.

---

## 1. Publish the sheet

The admin owns the sheet; the app renders whatever is in it on the next page load.

1. Keep the project rows on the first tab (`gid=0`). The **header row must match the field
   names the UI reads, exactly** (spaces + casing) — see §1.1.
2. Make it readable one of two ways:
   - **Link sharing** (simplest, what we use): `Share → General access → Anyone with the link
     → Viewer`. Then the CSV URL is
     `https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&gid=0`.
   - **Publish to web:** `File → Share → Publish to web → <tab> → CSV`, giving a
     `.../pub?gid=0&single=true&output=csv` URL. Either works identically.
3. That URL is the only config the app needs. **This sheet's URL:**
   `https://docs.google.com/spreadsheets/d/1iXx4Y9fvqXShd4Wljqqv5Vr61elOSiuZU4w-rTI0nq0/gviz/tq?tqx=out:csv&gid=0`
   (already set in `docker-compose.yml`). Verified `200 text/csv` with CORS enabled.

### 1.1 Column + formatting contract (the only things that break rendering)

- **Headers** must equal these exactly (the as-built UI reads only these six):
  `Project Name`, `Project Impact`, `Start Date`, `End Date`, `Project Owner`, `Department`.
  Rename one and that field silently renders as `TBD`. Add more columns later and they're
  simply ignored until the UI is extended.
- **Dates** (`Start Date`, `End Date`): the parser (`lib/sheet.ts`) accepts `YYYY-MM-DD`,
  `D-Mon-YYYY` (e.g. `10-Sep-2026`), and `M/D/YYYY`, normalizing all to ISO. Empty end dates
  are fine — the project shows as undated / single-quarter on the Timeline.
- **`Department` / `Project Owner`** drive the Overview grouping and the Projects filters, so
  keep their spelling consistent (a typo becomes a separate department/owner). A
  **Data → Data validation** dropdown on those two columns prevents drift.
- **Status** (Upcoming / Active / Completed) is derived automatically from Start/End vs.
  today — there's no status column to maintain.

---

## 2. Point the app at the sheet

### 2.1 Add `lib/sheet.ts` (fetch + parse CSV + coerce) — runs in the browser, zero deps

```ts
export type Row = Record<string, string | number | null>;

const NUMERIC = new Set(["% Complete", "Year"]);

function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function coerce(key: string, raw: string): string | number | null {
  const v = raw.trim();
  if (v === "") return null;                       // empty cell -> null, so the UI shows "TBD"
  if (NUMERIC.has(key)) {
    const n = Number(v.replace(/[%,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);   // repair locale dates defensively
  if (/date$/i.test(key) && us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return v;
}

export async function fetchSheet(url: string): Promise<Row[]> {
  const res = await fetch(url, { headers: { accept: "text/csv" } });
  if (!res.ok) throw new Error(`sheet fetch ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("got HTML not CSV — sheet not published");
  const [head = [], ...body] = parseCsv(text);
  const keys = head.map((h) => h.trim());
  return body
    .filter((r) => r.some((c) => c.trim() !== ""))         // drop blank spacer rows
    .map((r) => {
      const o: Row = {};
      keys.forEach((k, i) => { if (k) o[k] = coerce(k, r[i] ?? ""); });
      return o;
    });
}
```

### 2.2 Patch `app/page.tsx` — replace the baked import with a fetch (5 small edits)

The sub-components (`Overview`, `Portfolio`, `Roadmap`, `Decisions`) read a module-level
`const A`. Move that data into React state and hand it down through a tiny context so those
functions keep working with a one-line change each.

**a. Line 2** — swap the imports:

```ts
// before
import{useMemo,useState}from"react";import{portfolioData,logoData}from"./data";
// after
import{useMemo,useState,useEffect,createContext,useContext}from"react";
import{logoData}from"./data";
import{fetchSheet}from"../lib/sheet";
```

**b. Line 3** — delete `const A=portfolioData.projects as unknown as P[]` and add a context.
Keep `D`, `V`, `F`, `R`, `H` exactly as they are:

```ts
const DataCtx = createContext<P[]>([]);
const useA = () => useContext(DataCtx);
```

**c. In `Home`** — load the sheet on mount and provide it. Add at the top of `Home`:

```ts
const [A, setA] = useState<P[]>([]);
useEffect(() => { (async () => {
  const cfg = await fetch("/config.json").then(r => r.json()).catch(() => ({} as any));
  const url = cfg.csvProjects || (import.meta as any).env?.VITE_SHEET_CSV_PROJECTS;
  if (url) { try { setA(await fetchSheet(url) as P[]); } catch (e) { console.error("[sheet]", e); } }
})(); }, []);
```

`rows` (the existing `useMemo`) already closes over `A`, so it just works now that `A` is
state. Wrap the returned JSX in the provider — change the outer element:

```tsx
return <DataCtx.Provider value={A}><div className="portal">…</div></DataCtx.Provider>;
```

**d. First line of each of `Overview`, `Portfolio`, `Roadmap`, `Decisions`:** add

```ts
const A = useA();
```

(`Detail` doesn't use `A` — leave it.)

**e.** Delete the `SAMPLE DATA — FOR PROTOTYPE PURPOSES ONLY` banner in `Home`'s header once
real data flows.

> `app/data.ts` stays only for `logoData` (and as an offline reference). The 95 KB
> `portfolioData` literal is no longer imported — tree-shaking drops it from the bundle.
> `config.json` (§4) lets ops change the sheet URL **without rebuilding**; the
> `VITE_SHEET_CSV_PROJECTS` env var is just a build-time fallback for local `pnpm dev`.

---

## 3. Drop Cloudflare — make it a plain Vite SPA

The app is 100% client-side, so it doesn't need vinext/wrangler/workerd/D1/R2 at all.
Replace that toolchain with plain Vite. This is what removes Cloudflare "from the middle."

### 3.1 `index.html` (new, at repo root)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" />
    <title>IT Executive Portfolio Hub | 2026–2027</title>
  </head>
  <body class="antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 3.2 `src/main.tsx` (new)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import Home from "../app/page";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Home /></StrictMode>,
);
```

### 3.3 `vite.config.ts` (replace the whole Cloudflare-laden file)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  build: { outDir: "dist" },
});
```

`postcss.config.mjs` + `@tailwindcss/postcss` stay — Vite picks them up automatically, so
Tailwind in `app/globals.css` keeps working. `public/` is served as-is (favicon).

### 3.4 `package.json` — simplify scripts, drop the Cloudflare stack

```jsonc
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview --host --port 8080"
}
```

Add `@vitejs/plugin-react` to `devDependencies` (already implied by the RSC plugin, but add
it explicitly). You can now **remove** these unused deps: `vinext`, `wrangler`,
`@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `@vitejs/plugin-rsc`,
`react-server-dom-webpack`, `drizzle-orm`, `drizzle-kit`, and the `next` / `next-themes` /
`eslint-config-next` entries if nothing else imports them. Deleting them is optional but it's
the point of "no Cloudflare" — do it once the build in §5 is green. You can also delete
`db/`, `drizzle/`, `cloudflare-env.d.ts`, `next.config.ts`, and `scripts/` once the Vite
build works.

Sanity-check locally before Docker:

```sh
pnpm install
VITE_SHEET_CSV_PROJECTS='https://docs.google.com/…/pub?gid=0&single=true&output=csv' pnpm dev
# open http://localhost:5173 — dashboard should fill from the sheet
```

---

## 4. Container — nginx static + runtime config

### 4.1 `Dockerfile` (replace)

```dockerfile
# --- build the static bundle ---
FROM node:22.13.0-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build                      # -> /app/dist

# --- serve it ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh
EXPOSE 8080
```

### 4.2 `docker/nginx.conf`

```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  # never cache the runtime config or the HTML shell
  location = /config.json { add_header Cache-Control "no-store"; }
  location = /index.html  { add_header Cache-Control "no-store"; }

  # SPA fallback
  location / { try_files $uri $uri/ /index.html; }
}
```

### 4.3 `docker/40-config.sh` — write `config.json` from env at container start

The stock nginx image runs every `/docker-entrypoint.d/*.sh` before starting. This lets ops
change the sheet **without rebuilding the image** — just restart with a new env value.

```sh
#!/bin/sh
set -e
if [ -n "${SHEET_CSV_PROJECTS:-}" ]; then
  cat > /usr/share/nginx/html/config.json <<EOF
{
  "csvProjects": "${SHEET_CSV_PROJECTS}",
  "refreshSeconds": ${REFRESH_SECONDS:-300}
}
EOF
else
  echo "[40-config] SHEET_CSV_PROJECTS not set; keeping baked config.json"
fi
```

> The image bakes `public/config.json` as a working default, so it runs out of the box; set
> `SHEET_CSV_PROJECTS` to override the sheet at runtime without rebuilding.

### 4.4 `docker-compose.yml` (new)

```yaml
services:
  portfolio-hub:
    build: .
    image: it-portfolio-hub:local
    container_name: portfolio-hub
    restart: unless-stopped
    ports:
      - "8080:8080"        # use "127.0.0.1:8080:8080" if a reverse proxy fronts it
    environment:
      SHEET_CSV_PROJECTS: "https://docs.google.com/spreadsheets/d/e/2PACX-…/pub?gid=0&single=true&output=csv"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### 4.5 `.dockerignore` — keep build junk (and the local env) out of the image

```
node_modules
dist
.wrangler
.git
*.log
.env
.env.*
RUNBOOK_DOCKER_GOOGLE_SHEETS.md
```

The sheet URL is **not** a secret (the sheet is published), so it lives in compose `environment`
in the clear — that's fine. If you'd rather not commit it, move it to a git-ignored `.env`
and reference it with `${SHEET_CSV_PROJECTS}`.

---

## 5. Build & run

```sh
docker compose build --no-cache
docker compose up -d
docker compose logs -f portfolio-hub
```

Open `http://<host>:8080/`.

---

## 6. Verify

- **Config reached the container:** `curl -s http://localhost:8080/config.json` shows your URL.
- **The CSV is reachable + public:** from the box that will fetch it,
  `curl -sS -o /dev/null -w '%{http_code}\n' '<the csv url>'` → `200`, and the body starts
  with the header row, **not** `<`. (`<` = HTML = the sheet isn't published → redo §1.2.)
- **In the browser** (`http://<host>:8080/`): Overview → **Total Projects** equals the row
  count in the sheet; dates render like `18 Sep 2026` (not `Invalid Date`); `% Complete`
  shows numbers (not `NaN`); the Roadmap bars appear.
- **CORS check** (only matters for the default browser-fetch path): open DevTools → Network.
  If the CSV request is blocked by CORS, switch to the **§7 proxy fallback**.
- **Dynamic:** edit a cell in the sheet, reload the page → the value changes. (Google caches
  published CSVs briefly — a change can take up to ~1–2 min to appear. No app cache is
  involved; every page load fetches fresh.)

---

## 7. Fallback — nginx reverse-proxy (browser can't reach Google, or CORS blocks it)

Keeps everything Cloudflare-free; makes the **container** fetch Google and serves the CSV
same-origin, so the client needs no internet access and CORS disappears.

Add to `docker/nginx.conf` inside the `server {}` block:

```nginx
location /sheet/ {
  proxy_pass https://docs.google.com/;
  proxy_set_header Host docs.google.com;
  proxy_ssl_server_name on;
}
```

Point the app at the proxy path instead of the Google URL. In `docker/40-config.sh`:

```sh
cat > /usr/share/nginx/html/config.json <<EOF
{ "csvProjects": "/sheet/spreadsheets/d/e/2PACX-…/pub?gid=0&single=true&output=csv" }
EOF
```

Now only the container needs egress to `docs.google.com:443`, and the browser only ever talks
to your intranet host. (If your intranet needs an outbound HTTP proxy, set nginx
`resolver` + `proxy_pass` through it, or run this leg behind your existing egress proxy.)

---

## 8. Operations

| Task | How |
|---|---|
| Change the sheet URL | edit `SHEET_CSV_PROJECTS`, then `docker compose up -d` (recreates; rewrites `config.json`) |
| Deploy a code change | `docker compose build && docker compose up -d` |
| Force-refresh data | nothing to do — each page load re-fetches; just reload the browser |
| Logs | `docker compose logs --since 1h portfolio-hub` |
| Rollback | `docker compose down`, run the previous image tag — so **tag every build** |
| TLS / intranet SSO | front it with your existing reverse proxy; bind container to `127.0.0.1:8080` |

**Optional hardening** (do before wide rollout):
- **Schema guard:** in `fetchSheet`, assert the required headers from §1.1 are present and
  `console.warn` the missing ones — turns a silent wall of `TBD` into one loud line.
- **Staleness / error banner:** if `fetchSheet` throws, show a small "couldn't load live data"
  notice instead of an empty dashboard.

---

## 9. Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Every field shows `TBD` | header renamed / extra blank header row | §1.1 |
| `Invalid Date` | sheet exporting locale dates | format `*Date` as plain-text ISO (§1.1) |
| `NaN%` | `% Complete` stored as text / with `%` | plain-number formatting (§1.1) |
| Empty dashboard, console `got HTML not CSV` | sheet not published | redo §1.2 |
| Empty dashboard, console CORS error | browser can't cross-origin to Google | §7 proxy fallback |
| `config.json` 404 or empty | env var unset / entrypoint script not executable | check §4.3, `chmod +x` |
| Data won't update | Google's short CSV cache | wait ~1–2 min; hard-reload |

---

## 10. Checklist

- [ ] Sheet has a `Projects` tab, exact headers, plain-text ISO dates, data validation (§1)
- [ ] `File → Publish to web → Projects → CSV`, URL recorded (§1.2)
- [ ] `lib/sheet.ts` added; `app/page.tsx` patched to fetch + context (§2)
- [ ] `SAMPLE DATA` banner removed (§2.2e)
- [ ] `index.html`, `src/main.tsx`, plain `vite.config.ts`, simplified `package.json` (§3)
- [ ] `pnpm dev` renders live data locally (§3.4)
- [ ] `Dockerfile` (nginx multi-stage), `nginx.conf`, `40-config.sh`, `docker-compose.yml`,
      `.dockerignore` (§4)
- [ ] `docker compose up -d`; §6 verifications pass
- [ ] Cloudflare/vinext/drizzle deps + `db/`, `drizzle/`, `cloudflare-env.d.ts` removed (§3.4)
- [ ] Image tagged for rollback
```