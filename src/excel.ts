import Decimal from "decimal.js";
import {
  categories,
  groups,
  normalize,
  dateTime,
  type Snapshot,
} from "./domain";
export type ImportPlan = {
  fingerprint: string;
  participants: {
    name: string;
    group_name: string;
    balance: string;
    original_status: string | null;
  }[];
  products: {
    name: string;
    category: string;
    price: string | null;
    stock: number | null;
  }[];
  warnings: string[];
  errors: string[];
  ambiguous: { sheet: string; rows: number[] }[];
  sheets: string[];
};
function text(v: unknown): string {
  if (v && typeof v === "object") {
    if ("result" in v) return text(v.result);
    if ("richText" in v)
      return (v.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return v == null ? "" : String(v);
}
const clean = (v: unknown) => text(v).replace(/\s+/g, " ").trim();
function decimal(v: unknown, missing: boolean): string | null {
  const s = clean(v);
  if (missing && (!s || normalize(s) === "na" || normalize(s) === "n/a"))
    return null;
  if (!s || !/^\d+(\.\d{1,3})?$/.test(s) || new Decimal(s).gt("999999999.999"))
    throw new Error("valor decimal inválido");
  return new Decimal(s).toString();
}
export async function inspectWorkbook(
  buffer: ArrayBuffer,
): Promise<ImportPlan> {
  if (buffer.byteLength > 10 * 1024 * 1024)
    throw new Error("El archivo supera 10 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const plan: ImportPlan = {
    fingerprint,
    participants: [],
    products: [],
    warnings: [],
    errors: [],
    ambiguous: [],
    sheets: wb.worksheets.map((s) => s.name),
  };
  const seen = new Map<string, number[]>();
  for (const kind of ["Horas", "Inventario"]) {
    const sheet = wb.worksheets.find(
      (s) => normalize(s.name) === normalize(kind),
    );
    if (!sheet) {
      plan.errors.push(`Falta la hoja ${kind}.`);
      continue;
    }
    const headers = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((c, i) => headers.set(normalize(clean(c.value)), i));
    const required =
      kind === "Horas"
        ? ["Nombre", "Grupo", "Horas", "Status"]
        : ["Item", "Precio", "GRAN TOTAL", "Categoría"];
    if (required.some((h) => !headers.has(normalize(h)))) {
      plan.errors.push(`Encabezados incompletos en ${kind}.`);
      continue;
    }
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const get = (h: string) => row.getCell(headers.get(normalize(h))!).value;
      const name = clean(get(kind === "Horas" ? "Nombre" : "Item"));
      if (!name || normalize(name) === "total") return;
      try {
        if (kind === "Horas") {
          const group = groups.find(
            (g) => normalize(g) === normalize(clean(get("Grupo"))),
          );
          if (!group) throw new Error("grupo desconocido");
          const key = `${kind}:${group}:${normalize(name)}`;
          seen.set(key, [...(seen.get(key) ?? []), n]);
          const status = clean(get("Status"));
          if (status)
            plan.warnings.push(
              `Horas, fila ${n}: Status original conservado; no se crearán compras históricas.`,
            );
          plan.participants.push({
            name,
            group_name: group,
            balance: decimal(get("Horas"), false)!,
            original_status: status || null,
          });
        } else {
          const category = categories.find(
            (c) => normalize(c) === normalize(clean(get("Categoría"))),
          );
          if (!category) throw new Error("categoría desconocida");
          const price = decimal(get("Precio"), true),
            stockValue = decimal(get("GRAN TOTAL"), true);
          if (
            stockValue !== null &&
            (!new Decimal(stockValue).isInteger() ||
              new Decimal(stockValue).gt(2147483647))
          )
            throw new Error("existencias no enteras");
          const key = `${kind}:${normalize(name)}`;
          seen.set(key, [...(seen.get(key) ?? []), n]);
          plan.products.push({
            name,
            category,
            price,
            stock: stockValue === null ? null : Number(stockValue),
          });
          if (price === null || stockValue === null)
            plan.warnings.push(
              `Inventario, fila ${n}: ${name} tiene ${price === null ? "precio" : "existencias"} pendiente; no estará disponible.`,
            );
        }
      } catch (e) {
        plan.errors.push(`${kind}, fila ${n}: ${(e as Error).message}.`);
      }
    });
  }
  for (const [key, rows] of seen)
    if (rows.length > 1)
      plan.ambiguous.push({ sheet: key.split(":")[0], rows });
  if (plan.ambiguous.length)
    plan.errors.push(
      "Hay registros ambiguos. Corrige una copia del archivo antes de importar; no se combinarán automáticamente.",
    );
  if (!plan.participants.length || !plan.products.length)
    plan.errors.push("El archivo debe contener participantes y productos.");
  plan.warnings.push(
    "Las hojas de Registro Salida no se importan; se conservan únicamente como referencia.",
  );
  return plan;
}
export async function exportWorkbook(data: Snapshot): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CAIE Tienda";
  wb.created = new Date(data.captured_at);
  const horas = wb.addWorksheet("Horas");
  horas.addRow(["Nombre", "Grupo", "Horas", "Status"]);
  for (const p of data.participants)
    horas.addRow([
      p.name,
      p.group_name,
      Number(p.balance),
      p.purchased ? "Ya compró" : "Pendiente",
    ]);
  const inv = wb.addWorksheet("Inventario");
  inv.addRow(["Item", "Precio", "GRAN TOTAL", "Categoría"]);
  for (const p of data.products)
    inv.addRow([
      p.name,
      p.price === null ? "NA" : Number(p.price),
      p.stock === null ? "NA" : p.stock,
      p.category,
    ]);
  // Preserve signed stock numerically and flag discrepancies without adding columns.
  for (let row = 2; row <= inv.rowCount; row++) {
    const stock = inv.getCell(row, 3);
    if (typeof stock.value === "number" && stock.value < 0) {
      stock.font = { bold: true, color: { argb: "FF9C0006" } };
      stock.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFC7CE" },
      };
    }
  }
  const mov = wb.addWorksheet("Movimientos");
  mov.addRow([
    "Fecha",
    "Evento",
    "Participante",
    "Grupo",
    "Producto",
    "Cantidad",
    "Precio unitario",
    "Subtotal",
    "Operador",
    "Estado de la compra",
  ]);
  for (const c of data.purchases)
    for (const i of c.items)
      mov.addRow([
        dateTime(c.created_at),
        data.events.find((e) => e.id === c.event_id)?.name ?? "",
        c.participant_name,
        c.participant_group,
        i.product_name,
        i.quantity,
        Number(i.unit_price),
        Number(i.subtotal),
        data.operators.find((o) => o.id === c.operator_id)?.display_name ?? "",
        c.state === "confirmed" ? "Confirmada" : "Anulada",
      ]);
  for (const s of wb.worksheets) {
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: s.rowCount, column: s.columnCount },
    };
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF283F80" },
    };
    s.getRow(1).height = 28;
    s.columns.forEach((c, i) => {
      c.width =
        i === 0 || (s.name === "Movimientos" && [1, 2, 4, 8].includes(i))
          ? 32
          : 20;
    });
    s.eachRow((r, n) => {
      if (n > 1)
        r.eachCell((c) => {
          if (typeof c.value === "number") c.numFmt = "0.###";
          c.alignment = { vertical: "middle", wrapText: true };
        });
    });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
export function downloadExcel(buffer: ArrayBuffer) {
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `CAIE-Tienda-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
