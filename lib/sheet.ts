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

const MON: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Normalize any date column to ISO YYYY-MM-DD; leave non-dates untouched. */
function normalizeDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;                 // already ISO
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);        // Google locale M/D/YYYY
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const dm = /^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/.exec(v);     // 10-Sep-2026
  if (dm) { const m = MON[dm[2].slice(0, 3).toLowerCase()]; if (m) return `${dm[3]}-${m}-${dm[1].padStart(2, "0")}`; }
  return v;                                                    // unknown format: leave as-is
}

function coerce(key: string, raw: string): string | number | null {
  const v = raw.trim();
  if (v === "") return null;                       // empty cell -> null, so the UI shows "TBD"
  if (NUMERIC.has(key)) {
    const n = Number(v.replace(/[%,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (/date$/i.test(key)) return normalizeDate(v);
  return v;
}

/** Fetch a published Google-Sheet CSV and return typed rows keyed by header. */
export async function fetchSheet(url: string): Promise<Row[]> {
  const res = await fetch(url, { headers: { accept: "text/csv" }, cache: "no-store" });
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
