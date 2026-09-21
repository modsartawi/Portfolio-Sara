# IT Executive Portfolio Hub — Container Handoff

**Artifact:** `it-portfolio-hub-1.0.0.tar.gz` (Docker image, ~20 MB compressed / ~50 MB loaded)
**Checksum:** see `it-portfolio-hub-1.0.0.tar.gz.sha256`
**Base image:** `nginx:1.27-alpine` · serves on container port **8080** · no root services, no DB, no secrets.

## What it is
A static single-page dashboard (nginx) that reads a **read-only Google Sheet** in the user's
browser and renders it. No backend, no state, no persistent storage.

## 1. Verify integrity
```sh
shasum -a 256 -c it-portfolio-hub-1.0.0.tar.gz.sha256   # expect: OK
```

## 2. Load the image
```sh
docker load -i it-portfolio-hub-1.0.0.tar.gz            # loads it-portfolio-hub:1.0.0
```

## 3. Run
```sh
docker run -d --name portfolio-hub -p 8080:8080 --restart unless-stopped \
  -e SHEET_CSV_PROJECTS="https://docs.google.com/spreadsheets/d/1iXx4Y9fvqXShd4Wljqqv5Vr61elOSiuZU4w-rTI0nq0/gviz/tq?tqx=out:csv&gid=0" \
  -e REFRESH_SECONDS="300" \
  it-portfolio-hub:1.0.0
```
- `SHEET_CSV_PROJECTS` — the data source URL. **Optional:** the image ships with the above
  URL baked in as default; pass this env only to point at a different sheet (no rebuild needed).
- `REFRESH_SECONDS` — auto re-fetch interval for open tabs (default 300; `0` = on load only).

Then browse `http://<host>:8080/`.

## 4. Verify it's up
```sh
docker ps --filter name=portfolio-hub
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/      # 200
curl -s http://localhost:8080/config.json                            # shows the active sheet URL
```

## Network requirement (important)
The **end-user's browser** fetches the Google Sheet CSV directly over HTTPS, so client
machines need outbound access to `docs.google.com:443`. The container itself needs **no**
internet access in this mode.

> If client browsers cannot reach the internet, the image supports a reverse-proxy mode where
> the **container** fetches the sheet instead (only the host needs egress). That requires a
> one-line nginx change and a rebuild — ask the app owner; see §7 of
> `RUNBOOK_DOCKER_GOOGLE_SHEETS.md`.

## Recommended hosting
- Front with the internal reverse proxy (IIS / Nginx) for TLS + internal DNS
  (e.g. `it-portfolio.company.local`); bind the container to `127.0.0.1:8080` behind it.
- Do **not** expose port 8080 to the internet. Restrict to corporate LAN / VPN.

## Operations
```sh
docker stop portfolio-hub          # stop
docker start portfolio-hub         # start
docker logs -f portfolio-hub       # logs
docker rm -f portfolio-hub && docker run ...   # change env / redeploy (re-run step 3)
```
Data changes need **no** container action — the admin edits the sheet, users reload the page.
