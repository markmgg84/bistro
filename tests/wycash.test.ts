import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWycashCategories, categoryReportSchema, categoryTotals } from "../lib/wycash";

const header = '"Categoria Merceologica","Sottocategoria","Totale Pezzi","Totale €","Totale Media €"';
const csv = `${header}\n"DOLCI","","3","19.50","6.50"\n"CAFFE","BAR","4","5","1.25"`;
test("Wycash: categorie e centesimi esatti, senza inventare date o coperti", () => {
  const rows = parseWycashCategories(csv);
  assert.deepEqual(categoryTotals(rows), { quantity: 7, revenueCents: 2450 });
  assert.deepEqual(rows[0], { category: "DOLCI", subcategory: "", quantity: 3, revenueCents: 1950, sourceAverageCents: 650 });
  assert.equal("date" in rows[0], false);
  assert.equal("covers" in rows[0], false);
});
test("Wycash: BOM, CRLF, separatore punto e virgola, importi italiani", () => {
  const localized = `${header.replaceAll(",", ";")}\r\n"FOOD";"";"100";"1.234,56";"12,35"\r\n`;
  const [row] = parseWycashCategories("\uFEFF" + localized);
  assert.equal(row.revenueCents, 123456);
  assert.equal(row.sourceAverageCents, 1235);
});
test("Wycash: colonne riordinate e categorie omonime in sottocategorie distinte", () => {
  const rows = parseWycashCategories('Totale €;Totale Pezzi;Sottocategoria;Categoria Merceologica;Totale Media €\n10;2;A;FOOD;5\n12;3;B;FOOD;4');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].revenueCents, 1200);
});
test("Wycash: medie dichiarate conservate anche se diverse dal rapporto", () => {
  const [row] = parseWycashCategories(`${header}\n"PROMO","","10","5.55","0.50"`);
  assert.equal(row.sourceAverageCents, 50);
  assert.equal(row.revenueCents, 555);
});
test("Wycash: rifiuta righe invalide atomicamente, senza import parziali", () => {
  for (const row of ['"X","","","1","1"', '"X","","1","","1"', '"X","","1","1.234","1"', '"X","","1.5","10","1"', '"X","","1","-1","1"', '"X","","1","1e3","1"', '"X","","1","1,234","1"'])
    assert.throws(() => parseWycashCategories(csv + "\n" + row), /Riga 4/);
});
test("Wycash: niente doppio conteggio da categoria duplicata o totale generale", () => {
  assert.throws(() => parseWycashCategories(csv + '\n" dolci ","","2","10","5"'), /duplicate/);
  assert.throws(() => parseWycashCategories(csv + '\n"TOTALE","","7","24.50","3.50"'), /totale generale/);
});
test("Wycash: struttura CSV, colonne duplicate e file vuoti", () => {
  assert.throws(() => parseWycashCategories(""));
  assert.throws(() => parseWycashCategories(header));
  assert.throws(() => parseWycashCategories('date,receipt,revenue\n2026-10-01,1,10'));
  assert.throws(() => parseWycashCategories(`${header},"Totale €"\n"X","","1","1","1","1"`), /duplicate/);
  assert.throws(() => parseWycashCategories(`${header}\n"X","","1","1"`), /colonne/);
});
test("Wycash: periodo esplicito, date reali e fine non precedente all’inizio", () => {
  const rows = parseWycashCategories(csv);
  const base = { filename: "categorie.csv", rows };
  assert.equal(categoryReportSchema.safeParse(base).success, false);
  assert.equal(categoryReportSchema.safeParse({ ...base, startsOn: "2026-02-30", endsOn: "2026-03-01" }).success, false);
  assert.equal(categoryReportSchema.safeParse({ ...base, startsOn: "2026-10-02", endsOn: "2026-10-01" }).success, false);
  assert.equal(categoryReportSchema.safeParse({ ...base, startsOn: "2026-10-01", endsOn: "2026-10-01" }).success, true);
});
test("Wycash: validazione lato server blocca numeri non interi e importi fuori limite", () => {
  const row = parseWycashCategories(csv)[0];
  const base = { filename: "categorie.csv", startsOn: "2026-10-01", endsOn: "2026-10-31" };
  for (const bad of [{ ...row, revenueCents: 1.5 }, { ...row, quantity: -1 }, { ...row, revenueCents: Infinity }, { ...row, quantity: 1e20 }])
    assert.equal(categoryReportSchema.safeParse({ ...base, rows: [bad] }).success, false);
});
