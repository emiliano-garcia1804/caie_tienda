import { describe, it, expect, vi } from "vitest";
import { restoreDeviceAccess } from "../src/device-access";

function browser(hash: string) {
  return {
    location: { hash, pathname: "/caie_tienda/", search: "" },
    history: { replaceState: vi.fn() },
  } as unknown as Parameters<typeof restoreDeviceAccess>[1];
}
function auth(error: unknown = null) {
  return {
    initialize: vi.fn().mockResolvedValue({ error: null }),
    setSession: vi.fn().mockResolvedValue({ error }),
  } as unknown as Parameters<typeof restoreDeviceAccess>[0];
}
describe("Private device access", () => {
  it("removes credentials from browser history before establishing the session", async () => {
    const b = browser(
      "#caie_access_token=private-access&caie_refresh_token=private-refresh",
    );
    const a = auth();
    vi.mocked(a.setSession).mockImplementation(async () => {
      expect(b.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/caie_tienda/",
      );
      return { data: { session: null, user: null }, error: null };
    });
    expect(await restoreDeviceAccess(a, b)).toBeNull();
    expect(a.setSession).toHaveBeenCalledWith({
      access_token: "private-access",
      refresh_token: "private-refresh",
    });
  });
  it("cleans an incomplete link without attempting authentication", async () => {
    const b = browser("#caie_access_token=private-access");
    const a = auth();
    expect(await restoreDeviceAccess(a, b)).toContain("incompleto");
    expect(b.history.replaceState).toHaveBeenCalled();
    expect(a.setSession).not.toHaveBeenCalled();
  });
  it("reports an invalid session without displaying credentials or server errors", async () => {
    const a = auth({ message: "private-refresh" });
    const message = await restoreDeviceAccess(
      a,
      browser("#caie_access_token=x&caie_refresh_token=private-refresh"),
    );
    expect(message).toContain("nuevo enlace");
    expect(message).not.toContain("private-refresh");
  });
  it("preserves ordinary routes and waits for authentication initialization", async () => {
    const b = browser("#/history");
    const a = auth();
    expect(await restoreDeviceAccess(a, b)).toBeNull();
    expect(a.initialize).toHaveBeenCalled();
    expect(a.setSession).not.toHaveBeenCalled();
    expect(b.history.replaceState).not.toHaveBeenCalled();
  });
  it("handles network failure without leaving the credentials in history", async () => {
    const b = browser("#caie_access_token=x&caie_refresh_token=y");
    const a = auth();
    vi.mocked(a.setSession).mockRejectedValue(new Error("Network error"));
    expect(await restoreDeviceAccess(a, b)).toContain("conexión");
    expect(b.history.replaceState).toHaveBeenCalled();
  });
});
