import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import { inspectWorkbook, exportWorkbook } from "../src/excel.ts";
import { privateAdminSession } from "./private-client.mjs";
const file = process.argv[2];
if (!file) throw new Error("Se requiere la ruta privada del Excel original.");
const plan = await inspectWorkbook(new Uint8Array(readFileSync(file)).buffer),
  session = await privateAdminSession();
try {
  const s = session.snapshot;
  assert.equal(s.participants.length, plan.participants.length);
  assert.equal(s.products.length, plan.products.length);
  assert.equal(s.purchases.length, 0);
  for (const p of plan.participants) {
    const matches = s.participants.filter(
      (x) => x.name === p.name && x.group_name === p.group_name,
    );
    assert.equal(matches.length, 1, "Conciliación de identificación falló.");
    assert.ok(
      new Decimal(matches[0].balance).eq(p.balance),
      "Conciliación de saldo falló.",
    );
  }
  for (const p of plan.products) {
    const matches = s.products.filter(
      (x) => x.name === p.name && x.category === p.category,
    );
    assert.equal(matches.length, 1, "Conciliación de producto falló.");
    assert.equal(matches[0].stock, p.stock, "Conciliación de unidades falló.");
    if (p.price === null) assert.equal(matches[0].price, null);
    else
      assert.ok(
        new Decimal(matches[0].price).eq(p.price),
        "Conciliación de precio falló.",
      );
  }
  const { data, error } = await session.client.rpc("export_snapshot");
  if (error) throw new Error("Exportación restringida falló.");
  const buffer = await exportWorkbook(data),
    dir = join(homedir(), "Documents", "CAIE-privado");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "CAIE-Tienda-actual.xlsx");
  writeFileSync(target, new Uint8Array(buffer));
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(buffer);
  assert.equal(exported.getWorksheet("Horas").actualRowCount, 183);
  assert.equal(exported.getWorksheet("Inventario").actualRowCount, 43);
  assert.equal(exported.getWorksheet("Movimientos").actualRowCount, 1);
  const groups = {};
  for (const p of s.participants)
    groups[p.group_name] = (groups[p.group_name] ?? 0) + 1;
  const result = {
    executed_at: new Date().toISOString(),
    status: "PASS",
    participant_balances_all_match: true,
    products_prices_and_units_all_match: true,
    participants: s.participants.length,
    products: s.products.length,
    groups,
    hours_total: s.participants
      .reduce((n, p) => n.add(p.balance), new Decimal(0))
      .toString(),
    purchases: 0,
    missing_fields: 2,
    private_export_created: true,
    export_reopened: true,
    original_fingerprint: plan.fingerprint,
  };
  writeFileSync(
    "docs/reconciliation-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  console.log("Exportación privada guardada fuera del repositorio.");
} finally {
  await session.close();
}
