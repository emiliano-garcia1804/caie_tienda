import { privateAdminSession } from "./private-client.mjs";
import { writeFileSync } from "node:fs";
const [date, name] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !name)
  throw new Error(
    'Uso: node scripts/setup-event.mjs AAAA-MM-DD "Nombre del evento"',
  );
const session = await privateAdminSession();
try {
  if (
    session.snapshot.events.some(
      (e) => e.state === "active" && (e.event_date !== date || e.name !== name),
    )
  )
    throw new Error(
      "Existe otro evento activo. No se cerrará automáticamente.",
    );
  let existing = session.snapshot.events.find(
    (e) => e.event_date === date && e.name === name,
  );
  if (!existing) {
    const { data, error } = await session.client.rpc("admin_event", {
      p_id: null,
      p_name: name,
      p_date: date,
      p_action: "create",
    });
    if (error) throw new Error(error.message);
    existing = { id: data, state: "draft" };
  }
  if (existing.state === "draft") {
    const { error } = await session.client.rpc("admin_event", {
      p_id: existing.id,
      p_name: null,
      p_date: null,
      p_action: "activate",
    });
    if (error) throw new Error(error.message);
  }
  const { data, error } = await session.client.rpc("app_snapshot");
  if (error) throw new Error("Falta verificar el evento.");
  const active = data.events.find((e) => e.state === "active");
  if (!active || active.id !== existing.id)
    throw new Error("El evento activo requiere revisión.");
  const summary = {
    executed_at: new Date().toISOString(),
    name: active.name,
    date: active.event_date,
    state: active.state,
    participants_pending: data.participants.filter((p) => !p.purchased).length,
    purchases: data.purchases.length,
  };
  writeFileSync("docs/event-result.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  await session.close();
}
