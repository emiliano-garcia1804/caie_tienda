import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// Requires explicitly requested account. Key output is captured only in memory.
const [email, name] = process.argv.slice(2);
if (!email || !name)
  throw new Error('Uso: node scripts/provision-admin.mjs CORREO "NOMBRE"');
const cli = join(process.cwd(), "node_modules/supabase/dist/supabase.js");
const r = spawnSync(
  process.execPath,
  [
    cli,
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
if (r.status !== 0)
  throw new Error(
    "No fue posible obtener la clave administrativa mediante la CLI autorizada.",
  );
let rows = JSON.parse(r.stdout);
if (!Array.isArray(rows)) rows = rows.rows ?? rows.api_keys ?? [];
const candidate =
  rows.find(
    (k) => k.type === "secret" && k.api_key?.startsWith("sb_secret_"),
  ) ?? rows.find((k) => k.name === "service_role");
if (!candidate?.api_key)
  throw new Error(
    "No se encontró una clave administrativa. No se imprimieron las claves disponibles.",
  );
const client = createClient(
  "https://krjyplolmaoflcknhlpt.supabase.co",
  candidate.api_key,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await client.auth.admin.generateLink({
  type: "invite",
  email,
  options: { redirectTo: "http://127.0.0.1:5173/caie-tienda/" },
});
if (error) throw new Error(error.message);
const { error: profileError } = await client
  .from("profiles")
  .upsert({
    id: data.user.id,
    display_name: name,
    role: "admin",
    active: true,
  });
if (profileError)
  throw new Error(
    "Cuenta creada; falta el perfil administrativo: " + profileError.message,
  );
const dir = join(homedir(), "Documents", "CAIE-privado");
mkdirSync(dir, { recursive: true });
const target = join(dir, "primer-acceso.txt");
writeFileSync(
  target,
  `CAIE Tienda · Acceso privado individual\n\nEste enlace es una credencial temporal. No compartirlo ni subirlo a GitHub.\n\n1. Inicia la aplicación con npm run dev.\n2. Abre este enlace una sola vez:\n${data.properties.action_link}\n\n3. En la aplicación, selecciona tu inicial (Mi cuenta) y establece una contraseña de al menos 12 caracteres.\n4. Cierra sesión y vuelve a entrar con tu correo y la contraseña elegida.\n\nEl enlace caduca según la política de Supabase. Si caduca, un administrador debe generar otro enlace de recuperación. No se envió correo ni se guardó ninguna contraseña.\n`,
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    account_created: true,
    profile_created: true,
    role: "admin",
    private_instructions_file: target,
    email_sent: false,
    credentials_logged: false,
  }),
);
