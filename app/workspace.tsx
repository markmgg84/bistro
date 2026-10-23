"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  LayoutDashboard,
  Users,
  ArrowDownToLine,
  ChartNoAxesCombined,
  Target,
  ChevronRight,
  ArrowUpRight,
  Clock,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { today, ZONE } from "../lib/time";
import { metrics, validateSales } from "../lib/domain";
import type { WorkspaceData, UserView, Venue } from "../lib/contracts";
const sections = ["Dashboard", "Personale", "Incassi", "Vendite", "Obiettivi"];
const icons = [
  LayoutDashboard,
  Users,
  ArrowDownToLine,
  ChartNoAxesCombined,
  Target,
];
const euro = (n = 0) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    n,
  );
const number = (n = 0) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n);
const time = (s: string) => formatInTimeZone(new Date(s), ZONE, "dd/MM HH:mm");
const dateTimeLocal = (s: string) =>
  formatInTimeZone(new Date(s), ZONE, "yyyy-MM-dd'T'HH:mm");
function toInstant(s: string) {
  const date = fromZonedTime(s, ZONE);
  if (formatInTimeZone(date, ZONE, "yyyy-MM-dd'T'HH:mm") !== s)
    throw Error("Ora inesistente per il cambio dell’ora legale");
  for (const offset of [-3600000, 3600000])
    if (
      formatInTimeZone(
        new Date(date.getTime() + offset),
        ZONE,
        "yyyy-MM-dd'T'HH:mm",
      ) === s
    )
      throw Error(
        "Ora ambigua per il cambio dell’ora legale: usa un orario non ambiguo",
      );
  return date.toISOString();
}
export default function Workspace({
  user,
  venues,
}: {
  user: UserView;
  venues: Venue[];
}) {
  const finance = user.role !== "EMPLOYEE",
    admin = user.role === "ADMIN";
  const [tab, setTab] = useState(finance ? 0 : 1),
    [venueId, setVenueId] = useState(venues[0]?.id ?? ""),
    [period, setPeriod] = useState("day"),
    [date, setDate] = useState(today),
    [refresh, setRefresh] = useState(0),
    [loaded, setLoaded] = useState<{ key: string; data: WorkspaceData } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false);
  const key = `${venueId}:${date}:${period}`;
  const data = loaded?.key === key ? loaded.data : null;
  const venue = venues.find((v) => v.id === venueId);
  useEffect(() => {
    if (!venueId) return;
    const controller = new AbortController();
    setError("");
    fetch(
      `/api/data?venueId=${encodeURIComponent(venueId)}&date=${date}&period=${period}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        if (r.status === 401) {
          location.assign("/login");
          return;
        }
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        setLoaded({ key, data: result });
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setLoaded(null);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [venueId, date, period, key, refresh]);
  async function mutate(path: string, input: Record<string, unknown>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, ...input }),
      });
      const result = await r.json();
      if (r.status === 401) {
        location.assign("/login");
        return false;
      }
      if (!r.ok) throw Error(result.error);
      if (path === "auth/logout") {
        location.assign("/login");
        return true;
      }
      setNotice("Modifica salvata nel database.");
      setRefresh((v) => v + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function submit(
    e: FormEvent<HTMLFormElement>,
    path: string,
    transform: (f: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      if (await mutate(path, transform(new FormData(form)))) form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dati non validi");
    }
  }
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [filename, setFilename] = useState(""),
    [correction, setCorrection] = useState<
      WorkspaceData["attendances"][number] | null
    >(null);
  useEffect(() => {
    setPreview([]);
    setCorrection(null);
    setNotice("");
  }, [venueId]);
  const results = validateSales(
    preview.map((r) =>
      Object.fromEntries(Object.keys(mapping).map((k) => [k, r[mapping[k]]])),
    ),
  );
  async function upload(file?: File) {
    setPreview([]);
    setError("");
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Massimo 2 MB");
      return;
    }
    try {
      let rows: Record<string, unknown>[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const Papa = (await import("papaparse")).default;
        const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length) throw Error("CSV non valido");
        rows = parsed.data;
      } else {
        const read = (await import("read-excel-file/browser")).readSheet;
        const sheet = await read(file);
        const headers = (sheet.shift() || []).map(String);
        if (new Set(headers).size !== headers.length)
          throw Error("Intestazioni duplicate");
        rows = sheet.map((r) =>
          Object.fromEntries(
            headers.map((h, i) => [
              h,
              r[i] instanceof Date
                ? (r[i] as Date).toISOString().slice(0, 10)
                : r[i],
            ]),
          ),
        );
      }
      if (!rows.length || rows.length > 5000)
        throw Error("Il file deve contenere da 1 a 5.000 righe");
      setFilename(file.name);
      setPreview(rows);
      const keys = Object.keys(rows[0]);
      setMapping(
        Object.fromEntries(
          ["date", "receipt", "revenue", "covers", "desserts"].map((k, i) => [
            k,
            keys.includes(k) ? k : keys[i] || "",
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "File non valido");
    }
  }
  const m = metrics(
    data?.summary.revenue ?? 0,
    data?.summary.covers ?? 0,
    data?.summary.hours ?? 0,
    data?.summary.cost ?? 0,
  );
  const dessertRatio = data?.summary.covers
    ? ((data.summary.desserts ?? 0) / data.summary.covers) * 100
    : 0;
  const previous = data?.summary.previousRevenue ?? 0;
  const change = previous
    ? (((data?.summary.revenue ?? 0) - previous) / previous) * 100
    : null;
  return (
    <div className="shell" data-venue={venueId}>
      <aside>
        <a className="brand" href="/">
          bistrò<span>CONTROL / 1.0</span>
        </a>
        <div className="workspace">SPAZIO DI LAVORO</div>
        <nav aria-label="Navigazione principale">
          {sections.map((s, i) => {
            if (!finance && i !== 1) return null;
            const Icon = icons[i];
            return (
              <button
                key={s}
                className={tab === i ? "active" : ""}
                aria-current={tab === i ? "page" : undefined}
                onClick={() => setTab(i)}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{s}</span>
                {tab === i && <ChevronRight size={16} />}
              </button>
            );
          })}
        </nav>
        <div className="aside-bottom">
          <span className="avatar">BC</span>
          <div>
            {user.name}
            <small>
              {user.role === "ADMIN"
                ? "Amministratore"
                : user.role === "MANAGER"
                  ? "Responsabile"
                  : "Dipendente"}
            </small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Bistrò Control <ChevronRight size={13} />
            {sections[tab]}
          </div>
          <div className="header-actions">
            <span className="demo">Demo privata · dati fittizi</span>
            <button
              aria-label="Esci"
              disabled={pending}
              onClick={() => mutate("auth/logout", {})}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <div className="heading">
          <div>
            <div className="eyebrow">IL TUO BUSINESS, A COLPO D’OCCHIO</div>
            <h1>
              {tab === 0 ? "Ogni numero, una prospettiva." : sections[tab]}
            </h1>
            <p>
              {venue?.name} · dati salvati in PostgreSQL · orari Europe/Rome
            </p>
          </div>
          <div
            className={"venue-pill " + (venueId === "marina" ? "marina" : "")}
          >
            {venue?.name}
          </div>
        </div>
        <div className="filters">
          <label>
            Locale
            <select
              aria-label="Locale"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              disabled={pending}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Periodo
            <select
              aria-label="Periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="day">Giorno</option>
              <option value="week">Settimana</option>
              <option value="month">Mese</option>
            </select>
          </label>
          <label>
            Data
            <input
              aria-label="Data"
              type="date"
              value={date}
              required
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
          <button
            aria-label="Aggiorna"
            disabled={pending}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
          </div>
        )}
        {!data ? (
          <section
            className="card loading-card"
            aria-live="polite"
            aria-busy={!error}
          >
            <p>
              {error ? "Impossibile caricare i dati." : "Caricamento dei dati…"}
            </p>
          </section>
        ) : (
          <>
            {tab === 0 && finance && (
              <>
                <div className="kpis">
                  {[
                    [
                      "Incassi del periodo",
                      euro(data.summary.revenue),
                      change === null ? "—" : `${number(change)}%`,
                      "rispetto al periodo precedente",
                    ],
                    [
                      "Coperti",
                      number(data.summary.covers),
                      "",
                      "nel periodo selezionato",
                    ],
                    ["Scontrino medio", euro(m.average), "", "per coperto"],
                    [
                      "Costo del personale",
                      euro(data.summary.cost),
                      number(m.staffRatio) + "%",
                      "degli incassi",
                    ],
                  ].map(([a, b, c, d], i) => (
                    <article className={"kpi kpi-" + i} key={a}>
                      <div>
                        {a}
                        <ArrowUpRight size={18} />
                      </div>
                      <strong>{b}</strong>
                      <footer>
                        {c && <b>{c}</b>}
                        <span>{d}</span>
                      </footer>
                    </article>
                  ))}
                </div>
                <div className="chart-grid">
                  <section className="card">
                    <h2>Andamento degli incassi</h2>
                    <p>
                      {data.range.start} — {data.range.end} · {venue?.name}
                    </p>
                    {data.trend.length ? (
                      <div
                        className="actual-chart"
                        role="group"
                        aria-label="Andamento degli incassi"
                        tabIndex={0}
                      >
                        {data.trend.map((t) => (
                          <div
                            key={t.date}
                            title={`${t.date}: ${euro(t.revenue)}`}
                            role="img"
                            aria-label={`${t.date}: ${euro(t.revenue)}`}
                            tabIndex={0}
                          >
                            <div
                              style={{
                                height: Math.max(
                                  2,
                                  (t.revenue /
                                    Math.max(
                                      ...data.trend.map((t) => t.revenue),
                                      1,
                                    )) *
                                    160,
                                ),
                              }}
                            />
                            <small>{t.date.slice(8)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>Nessun incasso nel periodo.</p>
                    )}
                    <div className="chart-note">
                      Confronto con il periodo precedente{" "}
                      <b>
                        {change === null
                          ? "Dati precedenti assenti"
                          : number(change) + "%"}
                      </b>
                    </div>
                  </section>
                  <section className="card efficiency">
                    <h2>L’efficienza, in numeri</h2>
                    <p>Presenze attribuite al giorno di entrata</p>
                    <div>
                      <span>
                        <Clock size={18} />
                        Ore lavorate
                      </span>
                      <strong>{number(data.summary.hours)} h</strong>
                    </div>
                    <div>
                      <span>Incassi / ora lavorata</span>
                      <strong>{euro(m.revenuePerHour)}</strong>
                    </div>
                    <div>
                      <span>Incidenza personale</span>
                      <strong>{number(m.staffRatio)}%</strong>
                    </div>
                    <div className="tip">
                      Incassi del mese
                      <strong>{euro(data.summary.monthRevenue)}</strong>
                      <p>Obiettivo mensile {euro(data.goal.revenueTarget)}</p>
                    </div>
                  </section>
                </div>
                <section className="card spaced">
                  <h2>Dolci e coperti</h2>
                  <p>
                    {data.summary.desserts} dolci / {data.summary.covers}{" "}
                    coperti · {number(dessertRatio)}% · obiettivo{" "}
                    {data.goal.dessertPercent}%
                  </p>
                  <progress value={dessertRatio} max={100} />
                </section>
              </>
            )}
            {tab === 1 && (
              <>
                <section className="card">
                  <h2>{finance ? "Il team" : "La tua attività"}</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dipendente</th>
                          <th>Ruolo</th>
                          {finance && <th>Costo / ora</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.employees.map((e) => (
                          <tr key={e.employeeId}>
                            <td>{e.name}</td>
                            <td>{e.jobTitle}</td>
                            {finance && <td>{euro(e.hourlyCost)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {finance && (
                    <details>
                      <summary>Aggiungi dipendente fittizio</summary>
                      <form
                        className="form-grid"
                        onSubmit={(e) =>
                          submit(e, "employees", (f) => ({
                            name: f.get("name"),
                            jobTitle: f.get("jobTitle"),
                            hourlyCost: Number(f.get("hourlyCost")),
                          }))
                        }
                      >
                        <label>
                          Nome dimostrativo
                          <input
                            name="name"
                            required
                            minLength={2}
                            maxLength={80}
                          />
                        </label>
                        <label>
                          Mansione
                          <input
                            name="jobTitle"
                            required
                            minLength={2}
                            maxLength={80}
                          />
                        </label>
                        <label>
                          Costo orario (€)
                          <input
                            name="hourlyCost"
                            type="number"
                            required
                            min="0"
                            max="1000"
                            step="0.01"
                          />
                        </label>
                        <button disabled={pending}>Salva dipendente</button>
                      </form>
                    </details>
                  )}
                </section>
                {user.employeeId && (
                  <section className="card spaced">
                    <h2>La tua timbratura</h2>
                    <p>
                      {data.openAttendance
                        ? `Entrata ${time(data.openAttendance.startsAt)} · ${data.openAttendance.paused ? "In pausa" : "In servizio"}`
                        : "Fuori servizio"}
                    </p>
                    <div className="actions">
                      {!data.openAttendance ? (
                        <button
                          disabled={pending}
                          onClick={() => mutate("clock", { action: "in" })}
                        >
                          Timbra entrata
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={pending}
                            onClick={() =>
                              mutate("clock", {
                                action: data.openAttendance?.paused
                                  ? "resume"
                                  : "pause",
                              })
                            }
                          >
                            {data.openAttendance.paused
                              ? "Termina pausa"
                              : "Inizia pausa"}
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => mutate("clock", { action: "out" })}
                          >
                            Timbra uscita
                          </button>
                        </>
                      )}
                    </div>
                    <small>
                      Puoi timbrare solo per il tuo account, nel locale
                      selezionato.
                    </small>
                  </section>
                )}
                <section className="card spaced">
                  <h2>Turni del periodo</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dipendente</th>
                          <th>Entrata</th>
                          <th>Uscita</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.shifts.map((s) => (
                          <tr key={s.id}>
                            <td>{s.name}</td>
                            <td>{time(s.startsAt)}</td>
                            <td>{time(s.endsAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.shifts.length && <p>Nessun turno nel periodo.</p>}
                  {finance && (
                    <details>
                      <summary>Pianifica un turno</summary>
                      <form
                        className="form-grid"
                        onSubmit={(e) =>
                          submit(e, "shifts", (f) => ({
                            employeeId: f.get("employeeId"),
                            startsAt: toInstant(String(f.get("startsAt"))),
                            endsAt: toInstant(String(f.get("endsAt"))),
                          }))
                        }
                      >
                        <EmployeeSelect data={data} />
                        <label>
                          Entrata (Roma)
                          <input
                            type="datetime-local"
                            name="startsAt"
                            required
                          />
                        </label>
                        <label>
                          Uscita (Roma)
                          <input type="datetime-local" name="endsAt" required />
                        </label>
                        <button disabled={pending}>Salva turno</button>
                      </form>
                    </details>
                  )}
                </section>
                <section className="card spaced">
                  <h2>Presenze effettive</h2>
                  <p>
                    Ore del periodo: {number(data.summary.hours)} h. Pause
                    escluse; le presenze aperte sono provvisorie.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dipendente</th>
                          <th>Entrata</th>
                          <th>Uscita</th>
                          <th>Ore</th>
                          {finance && <th>Rettifica</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.attendances.map((a) => (
                          <tr key={a.id}>
                            <td>{a.name}</td>
                            <td>{time(a.startsAt)}</td>
                            <td>{a.endsAt ? time(a.endsAt) : "In corso"}</td>
                            <td>{number(a.hours)}</td>
                            {finance && (
                              <td>
                                <button
                                  disabled={!a.endsAt || pending}
                                  onClick={() => setCorrection(a)}
                                >
                                  Rettifica
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {correction && (
                    <form
                      key={correction.id}
                      className="form-grid"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        try {
                          if (
                            await mutate("attendance/correct", {
                              id: correction.id,
                              version: correction.version,
                              startsAt: toInstant(String(f.get("startsAt"))),
                              endsAt: toInstant(String(f.get("endsAt"))),
                              pauseMinutes: Number(f.get("pauseMinutes")),
                              reason: f.get("reason"),
                            })
                          )
                            setCorrection(null);
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Dati non validi",
                          );
                        }
                      }}
                    >
                      <label>
                        Entrata rettificata
                        <input
                          name="startsAt"
                          type="datetime-local"
                          required
                          defaultValue={dateTimeLocal(correction.startsAt)}
                        />
                      </label>
                      <label>
                        Uscita rettificata
                        <input
                          name="endsAt"
                          type="datetime-local"
                          required
                          defaultValue={dateTimeLocal(correction.endsAt!)}
                        />
                      </label>
                      <label>
                        Pausa totale rettificata (minuti)
                        <input
                          name="pauseMinutes"
                          type="number"
                          min="0"
                          required
                          defaultValue={Math.round(
                            correction.pauseMinutes +
                              correction.pauses.reduce(
                                (s, p) =>
                                  s +
                                  (p.endsAt
                                    ? (Date.parse(p.endsAt) -
                                        Date.parse(p.startsAt)) /
                                      60000
                                    : 0),
                                0,
                              ),
                          )}
                        />
                      </label>
                      <label>
                        Motivazione obbligatoria
                        <input
                          name="reason"
                          required
                          minLength={8}
                          maxLength={500}
                        />
                      </label>
                      <button disabled={pending}>
                        Salva rettifica tracciata
                      </button>
                      <button type="button" onClick={() => setCorrection(null)}>
                        Annulla
                      </button>
                    </form>
                  )}
                </section>
                <section className="card spaced">
                  <h2>Ferie e assenze</h2>
                  {data.absences.map((a) => (
                    <div className="absence" key={a.id}>
                      <p>
                        {a.name} · {a.kind} · {time(a.startsAt)} →{" "}
                        {time(a.endsAt)} · {a.status}
                      </p>
                      {finance && a.status === "PENDING" && (
                        <div className="actions">
                          <button
                            disabled={pending}
                            onClick={() =>
                              mutate("absences/approve", {
                                id: a.id,
                                status: "APPROVED",
                              })
                            }
                          >
                            Approva
                          </button>
                          <button
                            disabled={pending}
                            onClick={() =>
                              mutate("absences/approve", {
                                id: a.id,
                                status: "REJECTED",
                              })
                            }
                          >
                            Rifiuta
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <details>
                    <summary>Richiedi ferie o assenza</summary>
                    <form
                      className="form-grid"
                      onSubmit={(e) =>
                        submit(e, "absences", (f) => ({
                          employeeId: f.get("employeeId"),
                          kind: f.get("kind"),
                          startsAt: toInstant(String(f.get("startsAt"))),
                          endsAt: toInstant(String(f.get("endsAt"))),
                        }))
                      }
                    >
                      <EmployeeSelect data={data} />
                      <label>
                        Tipo
                        <select name="kind">
                          <option value="FERIE">Ferie</option>
                          <option value="ASSENZA">Assenza</option>
                        </select>
                      </label>
                      <label>
                        Da (Roma)
                        <input name="startsAt" type="datetime-local" required />
                      </label>
                      <label>
                        A (Roma)
                        <input name="endsAt" type="datetime-local" required />
                      </label>
                      <button disabled={pending}>Invia richiesta</button>
                    </form>
                  </details>
                </section>
                {finance && (
                  <section className="card spaced">
                    <h2>Registro delle modifiche</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Quando</th>
                            <th>Autore</th>
                            <th>Operazione</th>
                            <th>Motivazione</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.audit.map((a) => (
                            <tr key={a.id}>
                              <td>{time(a.createdAt)}</td>
                              <td>{a.actor}</td>
                              <td>{a.action}</td>
                              <td>{a.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
            {tab === 2 && finance && (
              <section className="card">
                <h2>Importa gli incassi · {venue?.name}</h2>
                <p>
                  CSV / XLSX · 2 MB · 5.000 righe · date YYYY-MM-DD e importi
                  con punto decimale
                </p>
                <div className="notice">
                  I dati validati verranno salvati esclusivamente in{" "}
                  {venue?.name}. Un duplicato annulla l’intero import. Wycash
                  non è ancora collegato.
                </div>
                <label className="upload">
                  Seleziona il file
                  <input
                    disabled={pending}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                {preview.length > 0 && (
                  <>
                    <h3>Mappa le colonne</h3>
                    <div className="mapping">
                      {["date", "receipt", "revenue", "covers", "desserts"].map(
                        (k, i) => (
                          <label key={k}>
                            {
                              [
                                "Data",
                                "Scontrino",
                                "Incasso",
                                "Coperti",
                                "Dolci",
                              ][i]
                            }
                            <select
                              value={mapping[k]}
                              onChange={(e) =>
                                setMapping({ ...mapping, [k]: e.target.value })
                              }
                            >
                              <option value="">Seleziona</option>
                              {Object.keys(preview[0]).map((h) => (
                                <option key={h}>{h}</option>
                              ))}
                            </select>
                          </label>
                        ),
                      )}
                    </div>
                    <p>
                      {results.filter((r) => r.valid).length} valide ·{" "}
                      {results.filter((r) => !r.valid).length} errori o
                      duplicati. Anteprima delle prime 20 righe.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {Object.keys(preview[0]).map((k) => (
                              <th key={k}>{k}</th>
                            ))}
                            <th>Esito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.slice(0, 20).map((r, i) => (
                            <tr key={i}>
                              {Object.values(r).map((v, j) => (
                                <td key={j}>{String(v)}</td>
                              ))}
                              <td>
                                {results[i]?.valid
                                  ? "Valida"
                                  : results[i]?.error}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      className="primary"
                      disabled={pending || results.some((r) => !r.valid)}
                      onClick={async () => {
                        if (
                          await mutate("imports", {
                            filename,
                            rows: results.map((r) => r.data),
                          })
                        )
                          setPreview([]);
                      }}
                    >
                      Conferma importazione in {venue?.name}
                    </button>
                  </>
                )}
                <h3>Registro importazioni</h3>
                {!data.imports.length && <p>Nessuna importazione.</p>}
                {data.imports.map((r) => (
                  <p key={r.id}>
                    {time(r.createdAt)} · {r.filename} · {r.accepted} righe ·{" "}
                    {r.status}
                  </p>
                ))}
              </section>
            )}
            {tab === 3 && finance && (
              <section className="card">
                <h2>Vendite per prodotto e categoria</h2>
                <p>
                  Gli import riepilogativi di incassi non contengono il
                  dettaglio dei prodotti.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Prodotto</th>
                        <th>Categoria</th>
                        <th>Quantità</th>
                        <th>Incasso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((p) => (
                        <tr key={p.product + "|" + p.category}>
                          <td>{p.product}</td>
                          <td>{p.category}</td>
                          <td>{p.quantity}</td>
                          <td>{euro(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="notice">
                  Dolci / coperti: {data.summary.desserts} /{" "}
                  {data.summary.covers} = {number(dessertRatio)}% · obiettivo{" "}
                  {data.goal.dessertPercent}%
                </div>
                <button
                  onClick={async () => {
                    const Papa = (await import("papaparse")).default;
                    const blob = new Blob(
                      [
                        "\ufeff" +
                          Papa.unparse(data.items, {
                            delimiter: ";",
                            escapeFormulae: true,
                          }),
                      ],
                      { type: "text/csv;charset=utf-8" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `vendite-${venueId}-${date}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Esporta vendite CSV
                </button>
              </section>
            )}
            {tab === 4 && finance && (
              <section className="card">
                <h2>Obiettivi del mese · {venue?.name}</h2>
                <p>
                  {date.slice(0, 7)} · configurazione modificabile solo
                  dall’amministratore
                </p>
                <div className="goal">
                  <strong>{number(dessertRatio)}%</strong>
                  <span>
                    Dolci / coperti del periodo · obiettivo{" "}
                    {data.goal.dessertPercent}%
                  </span>
                  <progress
                    max="100"
                    value={Math.min(
                      100,
                      (dessertRatio / Math.max(data.goal.dessertPercent, 0.1)) *
                        100,
                    )}
                  />
                </div>
                <form
                  key={`${venueId}:${date.slice(0, 7)}:${data.goal.dessertPercent}:${data.goal.revenueTarget}:${data.goal.dailyRevenueTarget}`}
                  className="form-grid"
                  onSubmit={(e) =>
                    submit(e, "goals", (f) => ({
                      month: date.slice(0, 7) + "-01",
                      dessertPercent: Number(f.get("dessertPercent")),
                      dailyRevenueTarget: Number(f.get("dailyRevenueTarget")),
                      revenueTarget: Number(f.get("revenueTarget")),
                    }))
                  }
                >
                  <label>
                    Obiettivo dolci / coperti (%)
                    <input
                      name="dessertPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      disabled={!admin}
                      defaultValue={data.goal.dessertPercent}
                    />
                  </label>
                  <label>
                    Obiettivo incassi giornalieri (€)
                    <input
                      name="dailyRevenueTarget"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      disabled={!admin}
                      defaultValue={data.goal.dailyRevenueTarget}
                    />
                  </label>
                  <label>
                    Obiettivo incassi mensili (€)
                    <input
                      name="revenueTarget"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      disabled={!admin}
                      defaultValue={data.goal.revenueTarget}
                    />
                  </label>
                  {admin && <button disabled={pending}>Salva obiettivi</button>}
                </form>
                <div className="notice">
                  Premi: non attivi. Nessun compenso viene assegnato
                  automaticamente. Il flusso di configurazione e approvazione
                  sarà sviluppato separatamente.
                </div>
              </section>
            )}
          </>
        )}
        <footer className="page-footer">
          BISTRÒ CONTROL
          <span>
            Solo dati fittizi · versione di test · non pronta per produzione
          </span>
        </footer>
      </main>
    </div>
  );
}
function EmployeeSelect({ data }: { data: WorkspaceData }) {
  return (
    <label>
      Dipendente
      <select name="employeeId" required>
        {data.employees.map((e) => (
          <option key={e.employeeId} value={e.employeeId}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
