import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
export const publicUrl = "https://krjyplolmaoflcknhlpt.supabase.co";
export const publicKey = "sb_publishable_kcG3Birh6buxfoIqEfC-mA_vaXMOU0f";
export async function privateAdminSession() {
  const file = join(
      homedir(),
      "Documents",
      "CAIE-privado",
      "primer-acceso.txt",
    ),
    instructions = readFileSync(file, "utf8"),
    link = instructions.match(/https:\/\/\S+/)?.[0];
  if (!link)
    throw new Error("Falta el enlace privado de acceso administrativo.");
  const parsed = new URL(link),
    client = createClient(publicUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const { data, error } = await client.auth.verifyOtp({
    token_hash: parsed.searchParams.get("token"),
    type: parsed.searchParams.get("type"),
  });
  if (error)
    throw new Error(
      "El enlace administrativo privado caducó o fue utilizado. Genera uno nuevo mediante Supabase Auth.",
    );
  const { data: snapshot, error: profileError } =
    await client.rpc("app_snapshot");
  if (profileError || snapshot.profile.role !== "admin")
    throw new Error("Se requiere un administrador autorizado.");
  const close = async () => {
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
      throw new Error("No se pudo renovar el enlace privado de acceso.");
    let keys = JSON.parse(cli.stdout);
    if (!Array.isArray(keys)) keys = keys.rows ?? keys.api_keys ?? [];
    const key = (
      keys.find(
        (k) => k.type === "secret" && k.api_key?.startsWith("sb_secret_"),
      ) ?? keys.find((k) => k.name === "service_role")
    )?.api_key;
    if (!key)
      throw new Error(
        "No fue posible obtener la credencial administrativa en memoria.",
      );
    const service = createClient(publicUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: recovery, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email: data.user.email,
      options: { redirectTo: "http://127.0.0.1:5173/caie-tienda/" },
    });
    if (error) throw new Error("No se pudo renovar el enlace privado.");
    writeFileSync(
      file,
      instructions.replace(link, recovery.properties.action_link),
      { mode: 0o600 },
    );
  };
  return { client, snapshot, close };
}
