"use client";
import { useEffect, useMemo, useState } from "react";
import { logoData } from "./data";
import { fetchSheet, type Row } from "../lib/sheet";

/** "Master Portfolio" tab columns. Rendering is driven entirely by these. */
const P = {
  id: "Project ID", name: "Project Name", dept: "IT Department",
  domain: "Strategic Domain", priority: "Priority", status: "Status",
  rag: "RAG Health", decision: "Decision Required",
  start: "Start Date", end: "End Date", owner: "Owner", notes: "Notes",
} as const;

/** "Milestones" tab columns, joined to a project on Project ID. */
const M = {
  id: "Project ID", title: "Milestone Name", due: "Due Date", status: "Status",
} as const;

const FIELDS = [
  P.id, P.name, P.dept, P.domain, P.priority, P.status,
  P.rag, P.decision, P.start, P.end, P.owner, P.notes,
] as const;

/** Allowed values, from the sheet's "Reference Lists" tab. */
const STATUSES = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
const RAGS = ["Red", "Amber", "Green"];

/** Status -> the badge palette already in globals.css. */
const TONE: Record<string, string> = {
  "In Progress": "Blue", Completed: "Green", "On Hold": "Amber",
  "Not Started": "Grey", Cancelled: "Grey",
};

const V = (p: Row, k: string) => {
  const v = p[k];
  return v === null || v === undefined || v === "" ? "TBD" : String(v);
};
const has = (p: Row, k: string) => V(p, k) !== "TBD";
const yes = (p: Row, k: string) => /^y/i.test(V(p, k));

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

/** RAG Health and Status are columns now — the sheet is authoritative, nothing is derived. */
const Rag = ({ v }: { v: string }) => <span className={"rag " + (RAGS.includes(v) ? v : "")}><i />{v}</span>;
const Status = ({ v }: { v: string }) => <span className={"rag " + (TONE[v] ?? "")}><i />{v}</span>;

const count = (rows: Row[], k: string, v: string) => rows.filter((p) => V(p, k) === v).length;
const uniq = (rows: Row[], k: string) =>
  [...new Set(rows.map((p) => V(p, k)))].filter((v) => v !== "TBD").sort();

const Empty = ({ what }: { what: string }) => (
  <section className="empty">
    <b>No {what} yet</b>
    <p>The sheet has its headers but no rows. Add projects to the <em>Master Portfolio</em> tab and they appear here on the next refresh.</p>
  </section>
);

export default function Home() {
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState<Row | null>(null);
  const [f, setF_] = useState<Record<string, string>>({});
  const [A, setA] = useState<Row[]>([]);
  const [MSs, setMS] = useState<Row[]>([]);
  const [lastAt, setLastAt] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let stop = false;
    const load = async (url: string, murl: string) => {
      try {
        setA(await fetchSheet(url));
        setMS(murl ? await fetchSheet(murl).catch(() => []) : []);
        setLastAt(new Date().toLocaleString("en-GB"));
        setErr("");
      } catch (e) {
        console.error("[sheet]", e);
        setErr(e instanceof Error ? e.message : String(e));
      }
    };
    (async () => {
      const cfg = await fetch("/config.json", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({} as { csvProjects?: string; csvMilestones?: string; refreshSeconds?: number }));
      const env = (import.meta as any).env ?? {};
      const url = (cfg.csvProjects || env.VITE_SHEET_CSV_PROJECTS || "") as string;
      const murl = (cfg.csvMilestones || env.VITE_SHEET_CSV_MILESTONES || "") as string;
      const secs = Number(cfg.refreshSeconds) || 0;
      if (stop || !url) return;
      await load(url, murl);
      if (secs > 0) timer = setInterval(() => load(url, murl), secs * 1000);
    })();
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, []);

  const rows = useMemo(
    () =>
      A.filter(
        (p) =>
          (!f.q ||
            [V(p, P.id), V(p, P.name), V(p, P.owner), V(p, P.dept), V(p, P.domain), V(p, P.notes)]
              .join(" ")
              .toLowerCase()
              .includes(f.q.toLowerCase())) &&
          (!f.dept || V(p, P.dept) === f.dept) &&
          (!f.domain || V(p, P.domain) === f.domain) &&
          (!f.status || V(p, P.status) === f.status) &&
          (!f.priority || V(p, P.priority) === f.priority),
      ),
    [f, A],
  );

  const go = (key: string, v: string) => { setF_({ [key]: v }); setTab("Projects"); };

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
          <b>{err ? `Sheet unreachable — ${err}` : A.length ? `Live · ${A.length} projects · as of ${lastAt}` : lastAt ? `Connected · no rows · as of ${lastAt}` : "Loading data…"}</b>
        </header>
        <div className="content">
          {tab === "Overview" && <Overview rows={A} go={go} open={setSel} />}
          {tab === "Projects" && <Projects all={A} rows={rows} f={f} setF={setF_} open={setSel} />}
          {tab === "Timeline" && <Timeline rows={A} ms={MSs} open={setSel} />}
        </div>
      </main>
      {sel && (
        <div className="modal" onClick={() => setSel(null)}>
          <article onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setSel(null)}>×</button>
            <Detail p={sel} ms={MSs} />
          </article>
        </div>
      )}
    </div>
  );
}

/** Mirrors the sheet's own "Dashboard" tab: four KPIs, two breakdowns, health, attention. */
function Overview({ rows, go, open }: { rows: Row[]; go: (k: string, v: string) => void; open: (p: Row) => void }) {
  const m: [string, number][] = [
    ["Total Projects", rows.length],
    ["In Progress", count(rows, P.status, "In Progress")],
    ["High Priority", count(rows, P.priority, "High")],
    ["Decision Required", rows.filter((p) => yes(p, P.decision)).length],
  ];
  const attention = rows.filter((p) => yes(p, P.decision) || V(p, P.rag) === "Red");

  return (
    <>
      <H t="Executive Portfolio Overview" c="Delivery status, strategic coverage and what needs a decision." />
      <div className="metrics four">
        {m.map((x, i) => (
          <div className={"metric " + (i ? "" : "major")} key={x[0]}>
            <small>{x[0]}</small><strong>{x[1]}</strong>
          </div>
        ))}
      </div>

      {!rows.length && <Empty what="projects" />}

      {!!rows.length && (
        <>
          <div className="breaks">
            <Breakdown title="Portfolio by IT Department" rows={rows} k={P.dept} onPick={(v) => go("dept", v)} />
            <Breakdown title="Portfolio by Strategic Domain" rows={rows} k={P.domain} onPick={(v) => go("domain", v)} />
          </div>

          <H t="Portfolio Health" c="RAG health as recorded on the Master Portfolio tab." />
          <div className="metrics three">
            {RAGS.map((r) => (
              <div className="metric" key={r}>
                <small><Rag v={r} /></small>
                <strong>{count(rows, P.rag, r)}</strong>
              </div>
            ))}
          </div>

          <H t="Executive Attention Items" c="Flagged Red, or waiting on a decision." />
          {attention.length ? (
            <div className="decisions">
              {attention.map((p, i) => (
                <button onClick={() => open(p)} key={V(p, P.id) + i}>
                  <span>
                    <h3>{V(p, P.name)}</h3>
                    <p>{V(p, P.id)} · {V(p, P.dept)}</p>
                  </span>
                  <span><small>Status</small><b>{V(p, P.status)}</b></span>
                  <span><small>RAG Health</small><b><Rag v={V(p, P.rag)} /></b></span>
                  <span><small>Decision Required</small><b>{V(p, P.decision)}</b></span>
                </button>
              ))}
            </div>
          ) : (
            <section className="empty"><b>No attention items at this time.</b></section>
          )}
        </>
      )}
    </>
  );
}

function Breakdown({ title, rows, k, onPick }: { title: string; rows: Row[]; k: string; onPick: (v: string) => void }) {
  const keys = uniq(rows, k);
  const max = Math.max(1, ...keys.map((v) => count(rows, k, v)));
  return (
    <section className="panel bars">
      <h3>{title}</h3>
      {keys.map((v) => {
        const n = count(rows, k, v);
        return (
          <button onClick={() => onPick(v)} key={v}>
            <span>{v}</span>
            <i><em style={{ width: (n / max) * 100 + "%" }} /></i>
            <b>{n}</b>
          </button>
        );
      })}
      {!keys.length && <p className="none">Nothing recorded yet.</p>}
    </section>
  );
}

function Projects({
  all, rows, f, setF, open,
}: {
  all: Row[]; rows: Row[]; f: Record<string, string>; setF: Function; open: (p: Row) => void;
}) {
  const S = ({ id, k, l }: { id: string; k: string; l: string }) => (
    <select value={f[id] || ""} onChange={(e) => setF((x: Record<string, string>) => ({ ...x, [id]: e.target.value }))}>
      <option value="">{l}</option>
      {uniq(all, k).map((x) => <option key={x}>{x}</option>)}
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
            placeholder="Search project, ID, owner, department or notes"
          />
          <S id="dept" k={P.dept} l="All departments" />
          <S id="domain" k={P.domain} l="All domains" />
          <S id="status" k={P.status} l="All statuses" />
          <S id="priority" k={P.priority} l="All priorities" />
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Project</th><th>Department</th><th>Domain</th>
                <th>Owner</th><th>Priority</th><th>Status</th><th>RAG</th><th>Start</th><th>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr onClick={() => open(p)} key={V(p, P.id) + i}>
                  <td>{V(p, P.id)}</td>
                  <td><b>{V(p, P.name)}</b></td>
                  <td>{V(p, P.dept)}</td>
                  <td>{V(p, P.domain)}</td>
                  <td>{V(p, P.owner)}</td>
                  <td>{V(p, P.priority)}</td>
                  <td><Status v={V(p, P.status)} /></td>
                  <td><Rag v={V(p, P.rag)} /></td>
                  <td>{F(V(p, P.start))}</td>
                  <td>{F(V(p, P.end))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty what={all.length ? "matching projects" : "projects"} />}
        </div>
        <footer>{rows.length} of {all.length} projects</footer>
      </section>
    </>
  );
}

function Timeline({ rows, ms, open }: { rows: Row[]; ms: Row[]; open: (p: Row) => void }) {
  const years = rows
    .map((p) => parseDate(V(p, P.start)))
    .filter((d): d is Date => !!d)
    .map((d) => d.getFullYear());
  const base = years.length ? Math.min(...years) : new Date().getFullYear();
  const Q = Array.from({ length: 8 }, (_, i) => `${String(base + Math.floor(i / 4)).slice(2)} Q${(i % 4) + 1}`);
  const qi = (d: Date) => (d.getFullYear() - base) * 4 + Math.floor(d.getMonth() / 3);
  const clamp = (n: number) => Math.max(0, Math.min(7, n));

  if (!rows.length) return (<><H t="Timeline" c="Planned start through end date." /><Empty what="projects" /></>);

  return (
    <>
      <H t={`Timeline ${base}–${base + 1}`} c="Planned start through end date, coloured by RAG health. Diamonds are milestones." />
      <div className="road">
        <div className="roadheads"><b>Project</b>{Q.map((q) => <b key={q}>{q}</b>)}</div>
        {rows.map((p, idx) => {
          const s = parseDate(V(p, P.start));
          const e = parseDate(V(p, P.end));
          const rag = V(p, P.rag);
          const tone = RAGS.includes(rag) ? rag : TONE[V(p, P.status)] ?? "";
          const mine = ms
            .filter((m) => has(p, P.id) && V(m, M.id) === V(p, P.id))
            .map((m) => ({ m, d: parseDate(V(m, M.due)) }))
            .filter((x): x is { m: Row; d: Date } => !!x.d);
          const a = s ? clamp(qi(s)) : -1;
          const b = s ? clamp(qi(e ?? s)) : -1;
          return (
            <div className="roadrow" key={V(p, P.id) + idx}>
              <button onClick={() => open(p)}>{V(p, P.name)}<small>{V(p, P.dept)}</small></button>
              <div>
                {Q.map((q, i) => (
                  <span key={q}>
                    {i === a && (
                      <i className={tone} style={{ width: `calc(${b - a + 1}00% + ${(b - a) * 6}px)` }}>
                        {V(p, P.owner)}
                      </i>
                    )}
                    {mine.filter((x) => clamp(qi(x.d)) === i).map((x, j) => (
                      <em key={j} className={V(x.m, M.status) === "Completed" ? "done" : ""}
                          title={`${V(x.m, M.title)} · ${F(V(x.m, M.due))} · ${V(x.m, M.status)}`} />
                    ))}
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

function Detail({ p, ms }: { p: Row; ms: Row[] }) {
  const s = parseDate(V(p, P.start));
  const e = parseDate(V(p, P.end));
  const months = s && e ? Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30))) : null;
  const mine = ms.filter((m) => has(p, P.id) && V(m, M.id) === V(p, P.id));
  return (
    <>
      <small>{V(p, P.dept)}</small>
      <h2>{V(p, P.name)}</h2>
      <p>{V(p, P.notes)}</p>
      <div className="tags">
        <Status v={V(p, P.status)} />
        <Rag v={V(p, P.rag)} />
        <span>{V(p, P.domain)}</span>
        <span>{V(p, P.priority)} priority</span>
        <span>{V(p, P.owner)}</span>
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
      <h3 className="mshead">Milestones</h3>
      {mine.length ? (
        <ul className="mslist">
          {mine
            .slice()
            .sort((x, y) => (parseDate(V(x, M.due))?.getTime() ?? 0) - (parseDate(V(y, M.due))?.getTime() ?? 0))
            .map((m, i) => (
              <li key={i}>
                <b>{V(m, M.title)}</b>
                <span>{F(V(m, M.due))}</span>
                <Status v={V(m, M.status)} />
              </li>
            ))}
        </ul>
      ) : (
        <p className="none">No milestones recorded for this project.</p>
      )}
    </>
  );
}
