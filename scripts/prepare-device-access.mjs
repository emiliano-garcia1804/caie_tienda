import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import assert from "node:assert/strict";

// Run only when device access is requested. This never creates users, changes
// passwords/profiles, or writes application data. Credentials stay in memory
// and the resulting links are saved outside the repository.
const [email, countText = "5"] = process.argv.slice(2);
const count = Number(countText);
if (!email || !Number.isInteger(count) || count < 1 || count > 5)
  throw new Error("Uso: npm run access:devices -- CORREO [1-5]");
const url = "https://krjyplolmaoflcknhlpt.supabase.co";
const publicKey = "sb_publishable_kcG3Birh6buxfoIqEfC-mA_vaXMOU0f";
const site = "https://emiliano-garcia1804.github.io/caie_tienda/";
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
  throw new Error("No se pudo obtener la credencial administrativa de la CLI.");
let keys = JSON.parse(cli.stdout);
if (!Array.isArray(keys)) keys = keys.rows ?? keys.api_keys ?? [];
const key = (
  keys.find(
    (k) => k.type === "secret" && k.api_key?.startsWith("sb_secret_"),
  ) ?? keys.find((k) => k.name === "service_role")
)?.api_key;
if (!key) throw new Error("Credencial administrativa no disponible.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, key, options);
const { data: profiles, error: profileError } = await service
  .from("profiles")
  .select("id")
  .eq("role", "admin")
  .eq("active", true);
if (profileError) throw new Error(profileError.message);
let account;
for (const profile of profiles) {
  const { data, error } = await service.auth.admin.getUserById(profile.id);
  if (error) throw new Error(error.message);
  if (data.user.email?.toLowerCase() === email.toLowerCase())
    account = data.user;
}
if (!account)
  throw new Error(
    "El correo debe pertenecer a un administrador existente y activo.",
  );
const dir = join(homedir(), "Documents", "CAIE-privado", "accesos-telefonos");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const sessions = new Set();
const links = [];
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
for (let index = 1; index <= count; index++) {
  const { data: generated, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
    options: { redirectTo: site },
  });
  if (error) throw new Error(error.message);
  const device = createClient(url, publicKey, options);
  try {
    const { data, error: verifyError } = await device.auth.verifyOtp({
      token_hash: generated.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw new Error(verifyError.message);
    assert.equal(data.user.id, account.id);
    assert.ok(data.session);
    const claims = JSON.parse(
      Buffer.from(
        data.session.access_token.split(".")[1],
        "base64url",
      ).toString(),
    );
    assert.ok(
      claims.session_id && !sessions.has(claims.session_id),
      "Each phone must have its own refresh session.",
    );
    sessions.add(claims.session_id);
    const { data: snapshot, error: accessError } =
      await device.rpc("app_snapshot");
    if (accessError) throw new Error(accessError.message);
    assert.equal(snapshot.profile.role, "admin");
    const params = new URLSearchParams({
      caie_access_token: data.session.access_token,
      caie_refresh_token: data.session.refresh_token,
    });
    const link = site + "#" + params.toString();
    links.push(link);
    writeFileSync(
      join(dir, `telefono-${index}.txt`),
      `CAIE Tienda - Acceso privado del telefono ${index}\n\nAbre este enlace una vez en ese telefono:\n${link}\n\nDespues puedes abrir la pagina normal de CAIE Tienda. No necesitas correo ni contrasena. Conserva este enlace en privado y utiliza un enlace diferente para cada telefono.\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      join(dir, `telefono-${index}.html`),
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAIE: tel&eacute;fono ${index}</title><body style="font:18px system-ui;max-width:640px;margin:60px auto;padding:20px"><h1>CAIE Tienda: tel&eacute;fono ${index}</h1><p><a href="${escape(link)}" rel="noreferrer">Abrir CAIE Tienda</a></p><p>Abre este enlace una vez en este tel&eacute;fono. Despu&eacute;s puedes volver a la p&aacute;gina normal; el navegador recordar&aacute; el acceso.</p><p>Comparte este enlace &uacute;nicamente con la persona autorizada que utilizar&aacute; este tel&eacute;fono.</p></body></html>`,
      { mode: 0o600 },
    );
  } finally {
    // Do not sign out: these sessions are being handed to the requested devices.
    await device.auth.stopAutoRefresh();
    await device.realtime.disconnect();
  }
}
writeFileSync(
  join(dir, "abrir-tienda.html"),
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accesos privados CAIE</title><body style="font:18px system-ui;max-width:640px;margin:60px auto;padding:20px"><h1>Abrir CAIE Tienda</h1><p>Usa un enlace distinto en cada tel&eacute;fono. No se necesita correo ni contrase&ntilde;a.</p><ul>${links.map((link, i) => `<li style="margin:20px 0"><a href="${escape(link)}" rel="noreferrer">Abrir en el tel&eacute;fono ${i + 1}</a> &middot; <a href="telefono-${i + 1}.txt">Copiar enlace</a></li>`).join("")}</ul><p>Despu&eacute;s del primer acceso puedes guardar la p&aacute;gina normal como favorito. Mant&eacute;n estos archivos fuera de carpetas p&uacute;blicas.</p></body></html>`,
  { mode: 0o600 },
);
await service.auth.stopAutoRefresh();
console.log(
  JSON.stringify({
    device_links_prepared: count,
    independent_sessions_verified: sessions.size,
    application_access_verified: true,
    private_index: join(dir, "abrir-tienda.html"),
    credentials_logged: false,
  }),
);
