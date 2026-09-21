"use client";
import { useEffect, useMemo, useState } from "react";
import { logoData } from "./data";
import { fetchSheet, type Row } from "../lib/sheet";

/** Columns the sheet provides. Rendering is driven entirely by these. */
const FIELDS = [
  "Project Name",
  "Project Impact",
  "Start Date",
  "End Date",
  "Project Owner",
  "Department",
] as const;

const V = (p: Row, k: string) => {
  const v = p[k];
  return v === null || v === undefined || v === "" ? "TBD" : String(v);
};

function parseDate(s: string): Date | null {
  if (!s || s === "TBD") return null;
  const d = new Date(s.includes("T") ? s : s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
const F = (s: string) => {
  const d = parseDate(s);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "TBD";
};

const H = ({ t, c }: { t: string; c: string }) => (
  <div className="head"><h2>{t}</h2><p>{c}</p></div>
);

type Status = "Upcoming" | "Active" | "Completed" | "Undated";
function statusOf(p: Row, now: number): Status {
  const s = parseDate(V(p, "Start Date"));
  const e = parseDate(V(p, "End Date"));
  if (!s && !e) return "Undated";
  if (s && now < s.getTime()) return "Upcoming";
  if (e && now > e.getTime()) return "Completed";
  return "Active";
}
const RAG: Record<Status, string> = { Active: "Blue", Upcoming: "Amber", Completed: "Green", Undated: "" };

const Badge = ({ st }: { st: Status }) => <span className={"rag " + RAG[st]}><i />{st}</span>;

export default function Home() {
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState<Row | null>(null);
  const [f, setF_] = useState<Record<string, string>>({});
  const [A, setA] = useState<Row[]>([]);
  const [lastAt, setLastAt] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let stop = false;
    const load = async (url: string) => {
      try {
        if (url) { setA(await fetchSheet(url)); setLastAt(new Date().toLocaleString("en-GB")); }
      } catch (e) { console.error("[sheet]", e); }
    };
    (async () => {
      const cfg = await fetch("/config.json", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({} as { csvProjects?: string; refreshSeconds?: number }));
      const url = (cfg.csvProjects || (import.meta as any).env?.VITE_SHEET_CSV_PROJECTS || "") as string;
      const secs = Number(cfg.refreshSeconds) || 0;
      if (stop) return;
      await load(url);
      if (secs > 0) timer = setInterval(() => load(url), secs * 1000);
    })();
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, []);

  const now = Date.now();
  const rows = useMemo(
    () =>
      A.filter(
        (p) =>
          (!f.q ||
            [V(p, "Project Name"), V(p, "Project Owner"), V(p, "Department"), V(p, "Project Impact")]
              .join(" ")
              .toLowerCase()
              .includes(f.q.toLowerCase())) &&
          (!f.dep || V(p, "Department") === f.dep) &&
          (!f.own || V(p, "Project Owner") === f.own),
      ),
    [f, A],
  );

  return (
    <div className="portal">
      <aside>
        <div className="brand">
          <img src={logoData} alt="Company logo" />
          <b>IT Executive<br />Portfolio Hub<small>2026–2027</small></b>
        </div>
        <nav>
          {["Overview", "Projects", "Timeline"].map((x) => (
            <button className={tab === x ? "active" : ""} onClick={() => setTab(x)} key={x}>{x}</button>
          ))}
        </nav>
        <p className="brand-note">Live from Google Sheets<br />Read-only source of truth</p>
      </aside>
      <main>
        <header>
          <div>
            <h1>IT Executive Portfolio Hub</h1>
            <p>Strategic portfolio view · 2026–2027</p>
          </div>
          <b>{A.length ? `Live · ${A.length} projects · as of ${lastAt}` : "Loading data…"}</b>
        </header>
        <div className="content">
          {tab === "Overview" && <Overview rows={A} now={now} go={(dep) => { setF_({ dep }); setTab("Projects"); }} />}
          {tab === "Projects" && <Projects all={A} rows={rows} f={f} setF={setF_} now={now} open={setSel} />}
          {tab === "Timeline" && <Timeline rows={A} open={setSel} />}
        </div>
      </main>
      {sel && (
        <div className="modal" onClick={() => setSel(null)}>
          <article onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setSel(null)}>×</button>
            <Detail p={sel} now={now} />
          </article>
        </div>
      )}
    </div>
  );
}

function Overview({ rows, now, go }: { rows: Row[]; now: number; go: (dep: string) => void }) {
  const deps = [...new Set(rows.map((p) => V(p, "Department")))].filter((d) => d !== "TBD");
  const owners = new Set(rows.map((p) => V(p, "Project Owner")).filter((o) => o !== "TBD"));
  const by = (st: Status) => rows.filter((p) => statusOf(p, now) === st).length;
  const m: [string, number][] = [
    ["Total Projects", rows.length],
    ["Departments", deps.length],
    ["Owners", owners.size],
    ["Active", by("Active")],
    ["Upcoming", by("Upcoming")],
  ];
  return (
    <>
      <H t="Portfolio Overview" c="Projects, owners and delivery status across departments." />
      <div className="metrics">
        {m.map((x, i) => (
          <div className={"metric " + (i ? "" : "major")} key={x[0]}>
            <small>{x[0]}</small><strong>{x[1]}</strong>
          </div>
        ))}
      </div>
      <H t="Departments" c="Portfolio grouped by owning department." />
      <div className="domains">
        {deps.map((dep) => {
          const a = rows.filter((p) => V(p, "Department") === dep);
          const os = new Set(a.map((p) => V(p, "Project Owner")).filter((o) => o !== "TBD"));
          const next = [...a]
            .map((p) => parseDate(V(p, "Start Date")))
            .filter((d): d is Date => !!d)
            .sort((x, y) => x.getTime() - y.getTime())[0];
          const share = Math.round((a.length / rows.length) * 100);
          return (
            <button onClick={() => go(dep)} key={dep}>
              <h3>{dep}</h3>
              <div className="stats">
                <span><b>{a.length}</b><small>Projects</small></span>
                <span><b>{os.size}</b><small>Owners</small></span>
                <span><b>{a.filter((p) => statusOf(p, now) === "Active").length}</b><small>Active</small></span>
                <span><b>{share}%</b><small>Of portfolio</small></span>
              </div>
              <div className="progress"><i style={{ width: share + "%" }} /></div>
              <p><em /> <b>Earliest start</b><br />{next ? next.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "TBD"}</p>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Projects({
  all, rows, f, setF, now, open,
}: {
  all: Row[]; rows: Row[]; f: Record<string, string>; setF: Function; now: number; open: Function;
}) {
  const S = ({ id, k, l }: { id: string; k: string; l: string }) => (
    <select value={f[id] || ""} onChange={(e) => setF((x: Record<string, string>) => ({ ...x, [id]: e.target.value }))}>
      <option value="">{l}</option>
      {[...new Set(all.map((p) => V(p, k)))].filter((v) => v !== "TBD").sort().map((x) => <option key={x}>{x}</option>)}
    </select>
  );
  return (
    <>
      <H t="Projects" c="Search and filter the complete portfolio." />
      <section className="panel">
        <div className="filters">
          <input
            value={f.q || ""}
            onChange={(e) => setF((x: Record<string, string>) => ({ ...x, q: e.target.value }))}
            placeholder="Search project, owner, department or impact"
          />
          <S id="dep" k="Department" l="All departments" />
          <S id="own" k="Project Owner" l="All owners" />
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Project</th><th>Impact</th><th>Owner</th><th>Department</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr onClick={() => open(p)} key={V(p, "Project Name") + i}>
                  <td><b>{V(p, "Project Name")}</b></td>
                  <td>{V(p, "Project Impact")}</td>
                  <td>{V(p, "Project Owner")}</td>
                  <td>{V(p, "Department")}</td>
                  <td>{F(V(p, "Start Date"))}</td>
                  <td>{F(V(p, "End Date"))}</td>
                  <td><Badge st={statusOf(p, now)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer>{rows.length} of {all.length} projects</footer>
      </section>
    </>
  );
}

function Timeline({ rows, open }: { rows: Row[]; open: Function }) {
  const years = rows
    .map((p) => parseDate(V(p, "Start Date")))
    .filter((d): d is Date => !!d)
    .map((d) => d.getFullYear());
  const base = years.length ? Math.min(...years) : new Date().getFullYear();
  const Q = Array.from({ length: 8 }, (_, i) => `${String(base + Math.floor(i / 4)).slice(2)} Q${(i % 4) + 1}`);
  const qi = (d: Date) => (d.getFullYear() - base) * 4 + Math.floor(d.getMonth() / 3);
  const clamp = (n: number) => Math.max(0, Math.min(7, n));
  return (
    <>
      <H t={`Timeline ${base}–${base + 1}`} c="Planned start through end date." />
      <div className="road">
        <div className="roadheads"><b>Project</b>{Q.map((q) => <b key={q}>{q}</b>)}</div>
        {rows.map((p, idx) => {
          const s = parseDate(V(p, "Start Date"));
          const e = parseDate(V(p, "End Date"));
          if (!s) {
            return (
              <div className="roadrow" key={V(p, "Project Name") + idx}>
                <button onClick={() => open(p)}>{V(p, "Project Name")}<small>{V(p, "Department")}</small></button>
                <div>{Q.map((q) => <span key={q} />)}</div>
              </div>
            );
          }
          const a = clamp(qi(s));
          const b = clamp(qi(e ?? s));
          const st = statusOf(p, Date.now());
          return (
            <div className="roadrow" key={V(p, "Project Name") + idx}>
              <button onClick={() => open(p)}>{V(p, "Project Name")}<small>{V(p, "Department")}</small></button>
              <div>
                {Q.map((q, i) => (
                  <span key={q}>
                    {i === a && (
                      <i className={RAG[st]} style={{ width: `calc(${b - a + 1}00% + ${(b - a) * 6}px)` }}>
                        {V(p, "Project Owner")}
                      </i>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Detail({ p, now }: { p: Row; now: number }) {
  const s = parseDate(V(p, "Start Date"));
  const e = parseDate(V(p, "End Date"));
  const months = s && e ? Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30))) : null;
  return (
    <>
      <small>{V(p, "Department")}</small>
      <h2>{V(p, "Project Name")}</h2>
      <p>{V(p, "Project Impact")}</p>
      <div className="tags">
        <Badge st={statusOf(p, now)} />
        <span>{V(p, "Department")}</span>
        <span>{V(p, "Project Owner")}</span>
      </div>
      <div className="detail">
        {FIELDS.map((k) => (
          <div key={k}>
            <small>{k}</small>
            <p>{/date$/i.test(k) ? F(V(p, k)) : V(p, k)}</p>
          </div>
        ))}
        <div>
          <small>Duration</small>
          <p>{months === null ? "TBD" : `${months} months`}</p>
        </div>
      </div>
    </>
  );
}
