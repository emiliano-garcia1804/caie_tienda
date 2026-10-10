import { it, expect } from "vitest";
import ExcelJS from "exceljs";
import { inspectWorkbook, exportWorkbook } from "../src/excel";
import type { Snapshot } from "../src/domain";
async function input(extra?: unknown[]) {
  const w = new ExcelJS.Workbook();
  const h = w.addWorksheet("Horas");
  h.addRow(["Nombre ", "Grupo ", "Horas", "Status "]);
  h.addRow(["Persona sintética", " Mamás ", 12, ""]);
  if (extra) h.addRow(extra);
  const i = w.addWorksheet("Inventario");
  i.addRow(["Item", "Precio", "GRAN TOTAL", "Categoría "]);
  i.addRow(["Bomba sintética", "NA", 3, " Juguetes "]);
  i.addRow(["Juguete sintético", 1, "NA", "Juguetes"]);
  i.addRow(["TOTAL", "", "", ""]);
  return (await w.xlsx.writeBuffer()) as ArrayBuffer;
}
it("importa encabezados normalizados, preserves NA, excluye TOTAL", async () => {
  const p = await inspectWorkbook(await input());
  expect(p.participants).toEqual([
    {
      name: "Persona sintética",
      group_name: "Mamás",
      balance: "12",
      original_status: null,
    },
  ]);
  expect(p.products).toHaveLength(2);
  expect(p.products[0].price).toBeNull();
  expect(p.products[1].stock).toBeNull();
  expect(p.errors).toEqual([]);
  expect(p.fingerprint).toMatch(/^[a-f0-9]{64}$/);
});
it("detecta duplicados por acentos en un mismo grupo sin fusionarlos", async () => {
  const p = await inspectWorkbook(
    await input(["Persona sintetica", "Mamás", 4, ""]),
  );
  expect(p.ambiguous).toEqual([{ sheet: "Horas", rows: [2, 3] }]);
  expect(p.participants).toHaveLength(2);
  expect(p.errors.length).toBeGreaterThan(0);
});
it("permite nombres iguales en diferentes grupos", async () => {
  const p = await inspectWorkbook(
    await input(["Persona sintética", "Papás", 4, ""]),
  );
  expect(p.ambiguous).toEqual([]);
});
it("rechaza horas negativas sin convertir a cero", async () => {
  const p = await inspectWorkbook(
    await input(["Otra persona", "Papás", -1, ""]),
  );
  expect(p.errors[0]).toContain("decimal inválido");
});
it("detecta hoja o encabezado faltante", async () => {
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Horas").addRow(["Nombre"]);
  const p = await inspectWorkbook((await w.xlsx.writeBuffer()) as ArrayBuffer);
  expect(p.errors.join()).toContain("Encabezados");
  expect(p.errors.join()).toContain("Falta la hoja Inventario");
});
it("exporta XLSX legible, columnas exactas, Status, decimales y movimientos", async () => {
  const data = {
    captured_at: "2026-10-09T18:00:00Z",
    participants: [
      {
        id: "p",
        name: "Persona sintética",
        group_name: "Mamás",
        balance: "3.125",
        purchased: true,
      },
    ],
    products: [
      {
        name: "Producto sintético",
        category: "Hogar",
        price: null,
        stock: null,
      },
    ],
    events: [{ id: "e", name: "Evento sintético" }],
    operators: [{ id: "o", display_name: "Operador sintético" }],
    purchases: [
      {
        event_id: "e",
        participant_name: "Persona sintética",
        participant_group: "Mamás",
        operator_id: "o",
        created_at: "2026-10-09T18:00:00Z",
        state: "confirmed",
        items: [
          {
            product_name: "Producto sintético",
            quantity: 2,
            unit_price: "0.125",
            subtotal: "0.25",
          },
        ],
      },
    ],
  } as unknown as Snapshot;
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await exportWorkbook(data));
  expect(w.worksheets.map((s) => s.name)).toEqual([
    "Horas",
    "Inventario",
    "Movimientos",
  ]);
  expect(w.getWorksheet("Horas")!.getRow(1).values).toEqual([
    undefined,
    "Nombre",
    "Grupo",
    "Horas",
    "Status",
  ]);
  expect(w.getWorksheet("Horas")!.getRow(2).values).toEqual([
    undefined,
    "Persona sintética",
    "Mamás",
    3.125,
    "Ya compró",
  ]);
  expect(w.getWorksheet("Inventario")!.getCell("C2").value).toBe("NA");
  expect(w.getWorksheet("Movimientos")!.getCell("H2").value).toBe(0.25);
  expect(w.getWorksheet("Movimientos")!.getCell("I2").value).toBe(
    "Operador sintético",
  );
});

it("exporta inventario negativo como número y lo resalta", async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(
    await exportWorkbook({
      captured_at: "2026-10-10T18:00:00Z",
      participants: [],
      purchases: [],
      events: [],
      operators: [],
      products: [
        {
          id: "p",
          name: "Stock a conciliar",
          category: "Hogar",
          price: "2",
          stock: -3,
          active: true,
          availability: "review",
        },
      ],
    } as unknown as Snapshot),
  );
  const cell = w.getWorksheet("Inventario")!.getCell("C2");
  expect(cell.value).toBe(-3);
  expect(cell.font.color?.argb).toBe("FF9C0006");
});
