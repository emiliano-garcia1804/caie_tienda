import type { SupabaseClient } from "@supabase/supabase-js";

// Device links are private and never part of the public build. Remove their
// credentials from the address/history before starting the router or requests.
export async function restoreDeviceAccess(
  auth: Pick<SupabaseClient["auth"], "initialize" | "setSession">,
  browser: Pick<Window, "location" | "history">,
): Promise<string | null> {
  const params = new URLSearchParams(browser.location.hash.slice(1));
  const access = params.get("caie_access_token");
  const refresh = params.get("caie_refresh_token");
  if (access !== null || refresh !== null) {
    browser.history.replaceState(
      null,
      "",
      browser.location.pathname + browser.location.search,
    );
    if (!access || !refresh)
      return "El enlace está incompleto. Solicita un nuevo enlace para este teléfono.";
    try {
      // setSession also renews an expired access token using the refresh token.
      const { error } = await auth.setSession({
        access_token: access,
        refresh_token: refresh,
      });
      return error
        ? "No pudimos abrir este acceso. Solicita un nuevo enlace para este teléfono."
        : null;
    } catch {
      return "No pudimos abrir este acceso. Revisa la conexión y solicita un nuevo enlace si continúa el problema.";
    }
  }
  // Existing invite/recovery URLs must finish before HashRouter reads the hash.
  await auth.initialize();
  return null;
}
