import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file)
  throw new Error('Uso: npm run inspect:excel -- "ruta al archivo.xlsx"');
const buffer = readFileSync(file),
  wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const summary = {
  fingerprint: createHash("sha256").update(buffer).digest("hex"),
  sheets: [],
  groups: {},
  participants: 0,
  products: 0,
  duplicate_rows: [],
  missing: [],
  hours_total: "0",
  errors: [],
};
const seen = new Map();
let total = 0;
for (const sheet of wb.worksheets) {
  summary.sheets.push({
    name: sheet.name,
    rows: sheet.actualRowCount,
    columns: sheet.columnCount,
  });
  if (normalize(sheet.name) === "horas")
    sheet.eachRow((r, n) => {
      if (n === 1 || !r.getCell(1).text.trim()) return;
      const name = r.getCell(1).text,
        group = r.getCell(2).text.trim(),
        h = r.getCell(3).value;
      summary.participants++;
      summary.groups[group] = (summary.groups[group] ?? 0) + 1;
      const key = group + ":" + normalize(name);
      seen.set(key, [...(seen.get(key) ?? []), n]);
      if (typeof h !== "number" || h < 0)
        summary.errors.push({ sheet: "Horas", row: n, field: "Horas" });
      else total += h;
      if (r.getCell(4).text.trim())
        summary.errors.push({
          sheet: "Horas",
          row: n,
          field: "Status no vacío",
        });
    });
  if (normalize(sheet.name) === "inventario")
    sheet.eachRow((r, n) => {
      if (
        n === 1 ||
        !r.getCell(1).text.trim() ||
        normalize(r.getCell(1).text) === "total"
      )
        return;
      summary.products++;
      for (const [i, f] of [
        [2, "Precio"],
        [3, "GRAN TOTAL"],
      ])
        if (normalize(r.getCell(i).text) === "na" || !r.getCell(i).text.trim())
          summary.missing.push({
            sheet: "Inventario",
            row: n,
            product: r.getCell(1).text.trim(),
            field: f,
          });
    });
}
summary.hours_total = String(total);
summary.duplicate_rows = [...seen.values()].filter((rows) => rows.length > 1);
// Aggregate-only output: deliberately excludes personal names and row contents.
console.log(JSON.stringify(summary, null, 2));
