import { readFileSync, writeFileSync } from "node:fs";
import { inspectWorkbook } from "../src/excel.ts";
import { privateAdminSession } from "./private-client.mjs";
import Decimal from "decimal.js";
const [file, approval] = process.argv.slice(2);
if (!file || approval !== "--approved-real-data")
  throw new Error(
    'Se requiere ruta privada y autorización explícita previa para datos personales. Uso: npm run import:initial -- "ruta.xlsx" --approved-real-data',
  );
const plan = await inspectWorkbook(new Uint8Array(readFileSync(file)).buffer);
if (plan.errors.length)
  throw new Error(
    "Importación bloqueada por errores: " + plan.errors.join("; "),
  );
const session = await privateAdminSession();
try {
  const { data, error } = await session.client.rpc("initial_import", {
    p_fingerprint: plan.fingerprint,
    p_participants: plan.participants,
    p_products: plan.products,
  });
  if (error) throw new Error(error.message);
  const { data: confirmed, error: readError } =
    await session.client.rpc("app_snapshot");
  if (readError)
    throw new Error(
      "Importación respondió pero falta verificar resultados. No reimportar otro archivo.",
    );
  const expectedHours = plan.participants.reduce(
      (n, p) => n.add(p.balance),
      new Decimal(0),
    ),
    actualHours = confirmed.participants.reduce(
      (n, p) => n.add(p.balance),
      new Decimal(0),
    );
  if (
    !data.already_imported &&
    (confirmed.participants.length !== plan.participants.length ||
      confirmed.products.length !== plan.products.length ||
      !actualHours.eq(expectedHours))
  )
    throw new Error(
      "La conciliación posterior requiere revisión administrativa.",
    );
  const summary = {
    executed_at: new Date().toISOString(),
    fingerprint: plan.fingerprint,
    participants_found: plan.participants.length,
    products_found: plan.products.length,
    ...data,
    participants_current: confirmed.participants.length,
    products_current: confirmed.products.length,
    hours_current_total: actualHours.toString(),
    ambiguous: plan.ambiguous.length,
    missing_fields: plan.products.reduce(
      (n, p) => n + Number(p.price === null) + Number(p.stock === null),
      0,
    ),
    errors: 0,
    historical_purchases_imported: 0,
  };
  // Summary only: never writes names, row content or authenticated responses.
  writeFileSync("docs/import-result.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  await session.close();
}
