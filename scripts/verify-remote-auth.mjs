import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import assert from "node:assert/strict";
const url = "https://krjyplolmaoflcknhlpt.supabase.co",
  pub = "sb_publishable_kcG3Birh6buxfoIqEfC-mA_vaXMOU0f";
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.code ?? e.name });
    console.error("FAIL " + name);
  }
}
const anon = createClient(url, pub, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await test("Registro público deshabilitado y proveedor email activo", async () => {
  const r = await fetch(url + "/auth/v1/settings", {
      headers: { apikey: pub },
    }),
    s = await r.json();
  assert.equal(s.disable_signup, true);
  assert.equal(s.external.email, true);
});
await test("Anónimo no lee participantes ni compras", async () => {
  for (const table of ["participants", "purchases"]) {
    const { data, error } = await anon.from(table).select("id");
    assert.ok(error);
    assert.equal(data, null);
  }
});
await test("Anónimo no ejecuta snapshot ni exportación", async () => {
  for (const f of ["app_snapshot", "export_snapshot"]) {
    const { error } = await anon.rpc(f);
    assert.ok(error);
  }
});
const file = join(homedir(), "Documents", "CAIE-privado", "primer-acceso.txt"),
  instructions = readFileSync(file, "utf8"),
  link = instructions.match(/https:\/\/\S+/)?.[0];
if (!link)
  throw new Error("No se encontró el enlace privado de primer acceso.");
const parsed = new URL(link),
  token = parsed.searchParams.get("token"),
  type = parsed.searchParams.get("type");
const client = createClient(url, pub, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let email;
await test("Supabase Auth real: sesión individual desde enlace administrativo", async () => {
  const { data, error } = await client.auth.verifyOtp({
    token_hash: token,
    type,
  });
  assert.equal(error, null);
  assert.ok(data.session);
  email = data.user.email;
});
if (email) {
  await test("Administrador obtiene snapshot y exportación mediante su JWT", async () => {
    const { data, error } = await client.rpc("app_snapshot");
    assert.equal(error, null);
    assert.equal(data.profile.role, "admin");
    assert.equal(data.participants.length, 0);
    assert.equal(data.products.length, 0);
    const result = await client.rpc("export_snapshot");
    assert.equal(result.error, null);
    assert.equal(result.data.purchases.length, 0);
  });
  await test("JWT autorizado tampoco permite modificar directamente saldo, precio ni permisos", async () => {
    for (const [table, values] of [
      ["participants", { balance: 999 }],
      ["products", { price: 0 }],
      ["profiles", { role: "operator" }],
    ]) {
      const { error } = await client
        .from(table)
        .update(values)
        .eq("id", "00000000-0000-4000-8000-000000000000");
      assert.ok(error);
      assert.equal(error.code, "42501");
    }
  });
  await test("Compra inválida rechazada sin crear transacciones", async () => {
    const { error } = await client.rpc("confirm_purchase", {
      p_participant: "00000000-0000-4000-8000-000000000000",
      p_event: "00000000-0000-4000-8000-000000000000",
      p_key: crypto.randomUUID(),
      p_items: [],
    });
    assert.ok(error);
    const { data } = await client.rpc("app_snapshot");
    assert.equal(data.purchases.length, 0);
  });
  await test("Realtime remoto acepta suscripción autenticada", async () => {
    const channel = client
      .channel("security-readonly-verification")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {},
      );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), 15000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(status));
        }
      });
    });
    await client.removeChannel(channel);
  });
  await client.auth.signOut();
  await client.realtime.disconnect();
  await client.auth.stopAutoRefresh();
  const cli = spawnSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules/supabase/dist/supabase.js"),
      "projects",
      "api-keys",
      "--project-ref",
      "krjyplolmaoflcknhlpt",
      "--reveal",
      "--output",
      "json",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (cli.status !== 0)
    throw new Error("No fue posible preparar otro enlace privado.");
  let keys = JSON.parse(cli.stdout);
  if (!Array.isArray(keys)) keys = keys.rows ?? keys.api_keys ?? [];
  const key = (
    keys.find(
      (k) => k.type === "secret" && k.api_key?.startsWith("sb_secret_"),
    ) ?? keys.find((k) => k.name === "service_role")
  )?.api_key;
  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "http://127.0.0.1:5173/caie-tienda/" },
  });
  if (error) throw new Error("No fue posible renovar el acceso privado.");
  writeFileSync(file, instructions.replace(link, data.properties.action_link), {
    mode: 0o600,
  });
  console.log(
    "Se renovó el enlace privado de primer acceso. Ningún token, clave ni contraseña se imprimió.",
  );
}
writeFileSync(
  "docs/remote-test-results.json",
  JSON.stringify(
    {
      executed_at: new Date().toISOString(),
      project: "krjyplolmaoflcknhlpt",
      no_purchase_created: true,
      no_participant_imported: true,
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
await anon.realtime.disconnect();
await anon.auth.stopAutoRefresh();
