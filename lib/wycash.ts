import Papa from "papaparse";
import { z } from "zod";
import { saleSchema } from "./domain";

const count = z.number().int().nonnegative().max(1_000_000_000);
const cents = z.number().int().nonnegative().max(10_000_000_000);
export const categoryRowSchema = z.object({
  category: z.string().trim().min(1).max(160),
  subcategory: z.string().trim().max(160),
  quantity: count,
  revenueCents: cents,
  sourceAverageCents: cents.nullable(),
});
export type CategoryRow = z.infer<typeof categoryRowSchema>;
export function categoryKey(row: Pick<CategoryRow, "category" | "subcategory">) {
  return JSON.stringify([row.category.toUpperCase(), row.subcategory.toUpperCase()]);
}
export const categoryReportSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  startsOn: saleSchema.shape.date,
  endsOn: saleSchema.shape.date,
  rows: z.array(categoryRowSchema).min(1).max(5000),
}).superRefine((report, ctx) => {
  if (report.endsOn < report.startsOn)
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "La fine del periodo precede l’inizio" });
  const seen = new Set<string>();
  report.rows.forEach((row, index) => {
    const key = categoryKey(row);
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["rows", index], message: "Categoria e sottocategoria duplicate" });
    seen.add(key);
    if (/^(TOTALE|TOTALI|TOTALE GENERALE|TOTAL)$/i.test(row.category))
      ctx.addIssue({ code: "custom", path: ["rows", index], message: "Rimuovere la riga di totale generale" });
  });
});

// Parse currency as integer cents, never infer missing values or reinterpret units.
function decimalCents(value: string): number {
  let s = value.trim();
  if (s.includes(",") && s.includes(".")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) throw Error("Importo ambiguo");
    s = s.replaceAll(".", "").replace(",", ".");
  } else s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error("Importo non valido: usare al massimo due decimali");
  const [whole, fraction = ""] = s.split(".");
  return cents.parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
const normalize = (s: string) => s.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
const headers = ["categoria merceologica", "sottocategoria", "totale pezzi", "totale €", "totale media €"];
export function isWycashCategories(fields: string[]) {
  const keys = fields.map(normalize);
  return headers.every((h) => keys.includes(h));
}
export function parseWycashCategories(text: string): CategoryRow[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw Error("CSV non valido: controllare separatori e virgolette");
  const columns = parsed.data.shift()?.map(normalize) ?? [];
  if (new Set(columns).size !== columns.length) throw Error("Intestazioni duplicate");
  if (!isWycashCategories(columns)) throw Error("Seleziona l’esportazione Wycash Statistiche Categorie con le cinque colonne originali");
  if (!parsed.data.length || parsed.data.length > 5000) throw Error("Il file deve contenere da 1 a 5.000 righe");
  const at = headers.map((h) => columns.indexOf(h));
  const rows = parsed.data.map((values, index) => {
    try {
      if (values.length !== columns.length) throw Error("Numero di colonne non corretto");
      const [category, subcategory, pieces, revenue, average] = at.map((i) => values[i].trim());
      if (!/^\d+$/.test(pieces)) throw Error("Totale Pezzi deve essere un intero non negativo");
      return categoryRowSchema.parse({ category, subcategory, quantity: Number(pieces), revenueCents: decimalCents(revenue), sourceAverageCents: average === "" ? null : decimalCents(average) });
    } catch (e) {
      throw Error(`Riga ${index + 2}: ${e instanceof z.ZodError ? "Valori mancanti o fuori limite" : e instanceof Error ? e.message : "Dati non validi"}`);
    }
  });
  // Reuse all report-level constraints, including duplicate category pairs.
  const checked = categoryReportSchema.safeParse({ filename: "preview.csv", startsOn: "2000-01-01", endsOn: "2000-01-01", rows });
  if (!checked.success) throw Error(checked.error.issues.map((i) => i.message).join("; "));
  return checked.data.rows;
}
export function categoryTotals(rows: CategoryRow[]) {
  return rows.reduce((sum, row) => ({ quantity: sum.quantity + row.quantity, revenueCents: sum.revenueCents + row.revenueCents }), { quantity: 0, revenueCents: 0 });
}
