import { createClient } from "@supabase/supabase-js";
import type { Snapshot } from "./domain";
export const simpleAccess = import.meta.env.VITE_SIMPLE_ACCESS !== "false";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: simpleAccess,
      storageKey: "caie-tienda-session",
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
export async function rpc<T>(
  name: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    const failure = new Error(error.message) as Error & { definitive: boolean };
    failure.definitive =
      !!error.code &&
      error.code !== "PGRST000" &&
      error.code !== "PGRST001" &&
      error.code !== "PGRST002";
    throw failure;
  }
  return data as T;
}
export const snapshot = () => rpc<Snapshot>("app_snapshot");
