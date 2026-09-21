# Portfolio Hub — spreadsheet edition

A fallback: the same three views as the React app, but built from formulas inside
a spreadsheet. **The app is the product** — this exists for offline use, or for
someone who only has the sheet. See `../INFRA_HANDOFF.md` for the real deployment.

Two independent editions:

| | Runs in | Follows the live sheet |
| --- | --- | --- |
| `PortfolioDashboard.gs` | Google Sheets (Apps Script) | Yes — builds tabs inside the source sheet |
| `build_xlsx.py` → `.xlsx` | Excel 2021 / 365 / web | No — snapshot at build time |

---

## Google Sheets edition

`PortfolioDashboard.gs` rebuilds the app's views as tabs inside the existing sheet,
so the sheet is both the data source and the dashboard.

1. Open the portfolio spreadsheet → **Extensions ▸ Apps Script**.
2. Delete the placeholder `myFunction`, paste the whole of `PortfolioDashboard.gs`, **Save**.
3. Pick `buildDashboard` in the function dropdown → **Run**, and approve the
   permission prompt (it only touches this spreadsheet).
4. Reload the spreadsheet — a **Portfolio Hub ▸ Rebuild dashboard** menu appears.

### What it creates

| Tab | Mirrors | Notes |
| --- | --- | --- |
| `Calc` | `statusOf()` in `app/page.tsx` | Hidden. Normalises the text dates (`10-Sep-2026`) into real dates, derives Active / Upcoming / Completed / Undated, and feeds the dropdown lists. |
| `Overview` | `<Overview/>` | Five KPI tiles, then one row per department: projects, owners, active, share of portfolio, bar, earliest start. |
| `Projects` | `<Projects/>` | Search box (B1) + department (D1) and owner (F1) dropdowns driving one `FILTER`. Status column coloured like the RAG badges. |
| `Timeline` | `<Timeline/>` | Eight quarters starting from the earliest start date; a cell is filled when the project overlaps that quarter, coloured by status. |

The raw data tab is never written to. It is found by matching row 1 against
`Project Name | Project Impact | Start Date | End Date | Project Owner | Department`,
so the tab can be called anything — but if those headers change, update `HEADERS`
in the script.

Knobs at the top of the script: `MAXROWS` (rows of data covered, default 1000),
`DEPT_ROWS`, `QUARTERS`, and the `C` colour map.

---

## Excel edition

```sh
python3 sheets/build_xlsx.py                      # reseeds Data from the live sheet
python3 sheets/build_xlsx.py --csv URL --out PATH
```

Needs `openpyxl`. Tab order is `Overview | Projects | Timeline | Data`
(`Calc` is hidden).

**Requires Excel 2021, Microsoft 365, or Excel on the web.** The views use the
dynamic-array functions `FILTER`, `UNIQUE`, `SORT` and `LET`; Excel 2019 and
earlier will show `#NAME?`.

### Keeping it current

The `Data` tab is a **snapshot** taken when the file was built — unlike the
Google Sheets edition, it does not follow the live source. Three ways to refresh:

1. Re-run `build_xlsx.py` (rebuilds the whole file).
2. Paste new rows over `Data!A2:F…` — everything else recalculates.
3. Wire it up once in Excel: **Data ▸ Get Data ▸ From Other Sources ▸ From Web**,
   paste the gviz CSV URL from `../RUNBOOK_DOCKER_GOOGLE_SHEETS.md`, load it into
   the `Data` sheet, then **Data ▸ Refresh All** whenever you want. Make sure
   Power Query types `Start Date` / `End Date` as Date.

> The committed `.xlsx` has an **empty Data tab**: the sheet was unreachable when
> it was last built (see the note below). The formulas are intact — run
> `build_xlsx.py` or paste rows in, and every view fills itself.

### Differences from the Google Sheets edition

- Distinct owner counts use `LET`+`UNIQUE`; earliest start uses `MINIFS`.
- The department bar is a `REPT("|",…)` text bar in both editions — swap in a data
  bar via Home ▸ Conditional Formatting if you prefer.
- No sheet protection is applied; add it with Review ▸ Protect Sheet, leaving
  `Projects!B1`, `D1` and `F1` unlocked so the filters still work.

---

## Known limits (both editions)

- **Read-only viewers cannot use the search box or dropdowns** — typing into a cell
  needs edit access. Options: give executives edit rights and rely on the
  (warning-only) protection, give each their own copy, or publish through Looker
  Studio, where filter state is per-viewer. This is the main reason the app won.
- There is no equivalent of the click-a-row detail modal.
- The Apps Script edition deletes and recreates its four tabs on every run. Don't
  hand-edit them — change the script and rebuild.
