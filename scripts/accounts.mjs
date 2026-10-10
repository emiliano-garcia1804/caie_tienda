import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
// Interactive secrets are hidden, never written to disk, argv, logs or frontend.
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function ask(prompt, secret = false) {
  process.stdout.write(prompt);
  hidden = secret;
  try {
    return (await rl.question("")).trim();
  } finally {
    hidden = false;
    if (secret) process.stdout.write("\n");
  }
}
try {
  console.log(
    "CAIE · Crear cuenta individual (requiere migración remota ya autorizada y aplicada).",
  );
  const url = "https://krjyplolmaoflcknhlpt.supabase.co";
  const key = await ask(
    "Secret key de Supabase (entrada oculta; no se guarda): ",
    true,
  );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = await ask("Correo: "),
    name = await ask("Nombre del operador: "),
    role = await ask("Rol (operator/admin): ");
  if (!["operator", "admin"].includes(role)) throw new Error("Rol inválido.");
  const password = await ask(
    "Contraseña temporal segura (mínimo 12 caracteres; entrada oculta): ",
    true,
  );
  if (password.length < 12) throw new Error("Usa al menos 12 caracteres.");
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const { error: profileError } = await client
    .from("profiles")
    .insert({ id: data.user.id, display_name: name, role, active: true });
  if (profileError) {
    console.error(
      "Cuenta Auth creada, pero perfil no creado. ID:",
      data.user.id,
    );
    throw profileError;
  }
  console.log(
    "Cuenta y perfil creados. Entrega la contraseña por un canal privado; no uses este repositorio para distribuirla.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
