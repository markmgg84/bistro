"use client";
import { useEffect, useState } from "react";
import { categoryReportSchema, categoryTotals, parseWycashCategories, type CategoryRow } from "../lib/wycash";

type ReportSummary = { id: string; filename: string; startsOn: string; endsOn: string; quantity: number; revenue: number };
type SavedReport = ReportSummary & { rows: CategoryRow[] };
const euros = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const integer = (n: number) => new Intl.NumberFormat("it-IT").format(n);
const day = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

function CategoryTable({ rows }: { rows: CategoryRow[] }) {
  const totals = categoryTotals(rows);
  return <>
    <p><strong>{rows.length} categorie · {integer(totals.quantity)} pezzi · {euros(totals.revenueCents)}</strong></p>
    <div className="table-wrap"><table>
      <thead><tr><th>Categoria</th><th>Sottocategoria</th><th>Pezzi</th><th>Totale</th><th>Media Wycash</th><th>Quota sul totale</th></tr></thead>
      <tbody>{[...rows].sort((a, b) => b.revenueCents - a.revenueCents).map((row) => <tr key={JSON.stringify([row.category, row.subcategory])}>
        <td>{row.category}</td><td>{row.subcategory || "—"}</td><td>{integer(row.quantity)}</td><td>{euros(row.revenueCents)}</td>
        <td>{row.sourceAverageCents === null ? "—" : euros(row.sourceAverageCents)}</td>
        <td>{totals.revenueCents ? (100 * row.revenueCents / totals.revenueCents).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : "—"}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

export default function WycashCategories({ venueId, venueName, canImport }: { venueId: string; venueName: string; canImport: boolean }) {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [filename, setFilename] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [saved, setSaved] = useState<SavedReport | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/category-reports?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        setReports(result.reports);
        setSelectedId((id) => result.reports.some((report: ReportSummary) => report.id === id) ? id : result.reports[0]?.id ?? "");
      }).catch((e) => { if (e.name !== "AbortError") { setReports([]); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [venueId, revision]);
  useEffect(() => {
    setSaved(null);
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/category-reports?venueId=${encodeURIComponent(venueId)}&reportId=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const result = await r.json(); if (!r.ok) throw Error(result.error); setSaved(result); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [venueId, selectedId]);
  async function upload(file?: File) {
    setRows([]); setFilename(""); setStartsOn(""); setEndsOn(""); setError(""); setNotice("");
    if (!file) return;
    setBusy(true);
    try {
      if (!/\.csv$/i.test(file.name)) throw Error("Per le categorie seleziona il CSV originale di Wycash");
      if (file.size > 2_000_000) throw Error("File troppo grande: massimo 2 MB");
      if (file.name.length > 120) throw Error("Accorcia il nome del file a massimo 120 caratteri");
      const parsed = parseWycashCategories(await file.text());
      setRows(parsed); setFilename(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Impossibile leggere il file"); }
    finally { setBusy(false); }
  }
  return <section className="card spaced" aria-label="Riepiloghi Wycash per categoria">
    <h2>Wycash · vendite per categoria · {venueName}</h2>
    <p>Riepiloghi dell’intero periodo esportato. Coperti, scontrini e andamento giornaliero richiedono un’esportazione con quei dettagli.</p>
    {canImport && <>
      <label className="upload">Seleziona Statistiche Categorie.csv
        <input type="file" accept=".csv" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {rows.length > 0 && <form onSubmit={async (e) => {
        e.preventDefault(); setError(""); setNotice("");
        const input = categoryReportSchema.safeParse({ filename, startsOn, endsOn, rows });
        if (!input.success) { setError(input.error.issues.map((i) => i.message).join("; ")); return; }
        setBusy(true);
        try {
          const r = await fetch("/api/category-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venueId, ...input.data }) });
          const result = await r.json(); if (!r.ok) throw Error(result.error);
          setSelectedId(result.id); setRevision((n) => n + 1); setRows([]); setFilename("");
          setNotice(`Riepilogo salvato in ${venueName}. I totali giornalieri degli incassi non sono stati modificati.`);
        } catch (e) { setError(e instanceof Error ? e.message : "Importazione non riuscita"); }
        finally { setBusy(false); }
      }}>
        <h3>Anteprima · {filename}</h3>
        <p>Il CSV non contiene date: indica il periodo esatto scelto in Wycash, estremi compresi. Il locale di destinazione è <strong>{venueName}</strong>.</p>
        <div className="form-grid">
          <label>Periodo Wycash dal<input type="date" required value={startsOn} disabled={busy} onChange={(e) => setStartsOn(e.target.value)} /></label>
          <label>Periodo Wycash al<input type="date" required min={startsOn || undefined} value={endsOn} disabled={busy} onChange={(e) => setEndsOn(e.target.value)} /></label>
        </div>
        <CategoryTable rows={rows} />
        <p>La media è quella riportata da Wycash. Quantità e importi sono mantenuti come nell’esportazione.</p>
        <button className="primary" disabled={busy || !startsOn || !endsOn}>Conferma categorie in {venueName}</button>
      </form>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    <h3>Riepiloghi salvati</h3>
    <p>Ogni riepilogo ha il proprio periodo e si consulta singolarmente. I filtri Giorno/Settimana/Mese in alto si applicano agli altri dati. Sono mostrati gli ultimi 50 riepiloghi.</p>
    {loading ? <p>Caricamento dei riepiloghi…</p> : !reports.length ? <p>Nessun riepilogo salvato.</p> : <>
      <label>Riepilogo da consultare<select value={selectedId} disabled={busy} onChange={(e) => { setSaved(null); setSelectedId(e.target.value); }}>
        {reports.map((report) => <option key={report.id} value={report.id}>{day(report.startsOn)} – {day(report.endsOn)} · {report.filename}</option>)}
      </select></label>
      {saved?.id === selectedId ? <>
        <p><strong>{venueName} · dal {day(saved.startsOn)} al {day(saved.endsOn)}</strong></p>
        <CategoryTable rows={saved.rows} />
      </> : <p>Caricamento del riepilogo…</p>}
    </>}
  </section>;
}
