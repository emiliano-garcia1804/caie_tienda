import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
const user = "11111111-1111-4111-8111-111111111111",
  person = "22222222-2222-4222-8222-222222222222",
  product = "33333333-3333-4333-8333-333333333333",
  event = "44444444-4444-4444-8444-444444444444";
function fixture() {
  return {
    profile: {
      id: user,
      display_name: "Voluntaria sintética",
      role: "admin",
      active: true,
    },
    operators: [
      {
        id: user,
        display_name: "Voluntaria sintética",
        role: "admin",
        active: true,
      },
    ],
    events: [
      {
        id: event,
        name: "Tienda de prueba",
        event_date: "2026-10-09",
        state: "active",
      },
    ],
    participants: [
      {
        id: person,
        name: "José Ejemplo",
        group_name: "Pequeños",
        balance: "12",
        purchased: false,
      },
      {
        id: "p2",
        name: "Persona Atendida",
        group_name: "Pequeños",
        balance: "4",
        purchased: true,
      },
      {
        id: "p3",
        name: "Persona Mamá",
        group_name: "Mamás",
        balance: "10",
        purchased: false,
      },
    ],
    products: [
      {
        id: product,
        name: "Cobija de prueba",
        category: "Hogar",
        price: "2",
        stock: 10,
        active: true,
        availability: "available",
      },
      {
        id: "prod2",
        name: "Cuaderno de prueba",
        category: "Útiles escolares",
        price: "1",
        stock: 2,
        active: true,
        availability: "available",
      },
      {
        id: "prod3",
        name: "Producto agotado",
        category: "Higiene",
        price: "1",
        stock: 0,
        active: true,
        availability: "out",
      },
      {
        id: "prod4",
        name: "Precio pendiente",
        category: "Juguetes",
        price: null,
        stock: 3,
        active: true,
        availability: "incomplete",
      },
      {
        id: "prod5",
        name: "Existencias pendientes",
        category: "Juguetes",
        price: "1",
        stock: null,
        active: true,
        availability: "incomplete",
      },
    ],
    purchases: [] as any[],
    audit: [],
    captured_at: "2026-10-09T18:00:00Z",
  };
}
async function setup(
  page: Page,
  options: { reject?: boolean; lostResponse?: boolean } = {},
) {
  const data = fixture();
  let first = true;
  await page.routeWebSocket(/supabase\.co/, (socket) => socket.close());
  await page.route(
    "https://krjyplolmaoflcknhlpt.supabase.co/**",
    async (route) => {
      const url = route.request().url();
      const body = route.request().postDataJSON();
      const json = (value: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(value),
        });
      if (url.includes("/auth/v1/token")) {
        const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
        return json({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "synthetic",
          user: {
            id: user,
            aud: "authenticated",
            email: "sintetica@example.invalid",
            app_metadata: { provider: "email" },
            user_metadata: {},
            created_at: "2026-10-09T18:00:00Z",
          },
        });
      }
      if (url.includes("/auth/v1/logout")) return json({});
      if (url.includes("/auth/v1/user"))
        return json({
          id: user,
          aud: "authenticated",
          email: "sintetica@example.invalid",
          app_metadata: { provider: "email" },
          user_metadata: {},
          created_at: "2026-10-09T18:00:00Z",
        });
      if (
        url.includes("/rpc/app_snapshot") ||
        url.includes("/rpc/export_snapshot")
      )
        return json(data);
      if (url.includes("/rpc/confirm_purchase")) {
        if (options.reject)
          return json(
            {
              code: "P0001",
              message:
                "Inventario insuficiente para Cobija de prueba. Revisa el carrito.",
            },
            400,
          );
        let purchase = data.purchases.find(
          (c) => c.idempotency_key === body.p_key,
        );
        if (!purchase) {
          const items = body.p_items.map((i: any) => {
            const p = data.products.find((p) => p.id === i.product_id)!;
            return {
              product_id: p.id,
              product_name: p.name,
              quantity: i.quantity,
              unit_price: p.price,
              subtotal: String(Number(p.price) * i.quantity),
            };
          });
          const total = items.reduce(
            (t: number, i: any) => t + Number(i.subtotal),
            0,
          );
          data.participants[0].balance = String(
            Number(data.participants[0].balance) - total,
          );
          data.participants[0].purchased = true;
          for (const i of items)
            data.products.find((p) => p.id === i.product_id)!.stock! -=
              i.quantity;
          purchase = {
            id: "purchase-test",
            idempotency_key: body.p_key,
            participant_id: person,
            participant_name: data.participants[0].name,
            participant_group: "Pequeños",
            event_id: event,
            operator_id: user,
            created_at: "2026-10-09T18:00:00Z",
            total: String(total),
            balance_after: data.participants[0].balance,
            state: "confirmed",
            items,
          };
          data.purchases.push(purchase);
        }
        if (options.lostResponse && first) {
          first = false;
          return route.abort("failed");
        }
        return json({
          id: purchase.id,
          total: purchase.total,
          balance_after: purchase.balance_after,
          state: "confirmed",
        });
      }
      if (url.includes("/rpc/admin_participant")) {
        if (body.p_id === null)
          data.participants.push({
            id: crypto.randomUUID(),
            name: body.p_name,
            group_name: body.p_group,
            balance: body.p_balance,
            purchased: false,
          });
        return json(null);
      }
      if (url.includes("/rpc/admin_product")) {
        if (body.p_id === null)
          data.products.push({
            id: crypto.randomUUID(),
            name: body.p_name,
            category: body.p_category,
            price: body.p_price,
            stock: body.p_stock,
            active: body.p_active,
            availability: "available",
          });
        return json(null);
      }
      return json({});
    },
  );
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })).toString("base64url")}.test`;
  await page.goto(`#caie_access_token=${token}&caie_refresh_token=synthetic`);
  await expect(
    page.getByRole("heading", { name: "Bienvenido a la tienda" }),
  ).toBeVisible();
  return data;
}
async function openCheckout(page: Page) {
  await page.getByRole("link", { name: "Nueva compra" }).last().click();
  await page.getByRole("link", { name: /Pequeños/ }).click();
  await page.getByRole("link", { name: /José Ejemplo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Seleccionar artículos" }),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("Inicio, grupos, búsqueda sin acentos y filtros por Status", async ({
  page,
}, info) => {
  await setup(page);
  await noOverflow(page);
  await page.getByRole("link", { name: "Nueva compra" }).last().click();
  for (const g of ["Pequeños", "Medianos", "Grandes", "Mamás", "Papás"])
    await expect(
      page.getByRole("heading", { name: g, exact: true }),
    ).toBeVisible();
  await page.getByRole("link", { name: /Pequeños/ }).click();
  await page.getByLabel("Buscar por nombre").fill("jose");
  await expect(page.getByRole("link", { name: /José Ejemplo/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Persona Atendida/ }),
  ).toHaveCount(0);
  await page.getByLabel("Buscar por nombre").fill("");
  await page.getByRole("button", { name: "Pendientes", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Persona Atendida/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ya compraron", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Persona Atendida/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Persona Atendida/ }).click();
  await expect(page.getByRole("alert")).toContainText("ya realizó una compra");
  await page.getByRole("button", { name: "Continuar con la compra" }).click();
  await noOverflow(page);
  mkdirSync(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/${info.project.name}-catalog.png`,
    fullPage: true,
  });
});
test("Carrito, cantidades, costo, confirmación, éxito, historial y siguiente participante", async ({
  page,
}, info) => {
  const data = await setup(page);
  await openCheckout(page);
  await page.getByRole("button", { name: "Agregar Cobija de prueba" }).click();
  await page.getByRole("button", { name: "Agregar Cobija de prueba" }).click();
  await page.getByRole("button", { name: "Quitar Cobija de prueba" }).click();
  await page
    .getByRole("button", { name: "Agregar Cuaderno de prueba" })
    .click();
  await expect(page.getByText("9 horas", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Agregar Producto agotado" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Agregar Precio pendiente" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Agregar Existencias pendientes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Revisar compra" }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Volver a editar" }).click();
  await page.getByRole("button", { name: "Revisar compra" }).click();
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra registrada correctamente" }),
  ).toBeVisible();
  expect(data.purchases).toHaveLength(1);
  expect(data.participants[0].balance).toBe("9");
  await page.screenshot({
    path: `.local/screenshots/${info.project.name}-success.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Nueva compra", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "¿A qué grupo pertenece?" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Historial", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "José Ejemplo" }),
  ).toBeVisible();
  await noOverflow(page);
});
test("Saldo insuficiente bloquea confirmación y límites de stock", async ({
  page,
}) => {
  await setup(page);
  await openCheckout(page);
  for (let i = 0; i < 7; i++)
    await page
      .getByRole("button", { name: "Agregar Cobija de prueba" })
      .click();
  await expect(page.getByRole("alert")).toContainText("supera las horas");
  await expect(
    page.getByRole("button", { name: "Revisar compra" }),
  ).toBeDisabled();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Agregar Cobija de prueba" })
      .click();
  await expect(
    page.getByRole("button", { name: "Agregar Cobija de prueba" }),
  ).toBeDisabled();
  await noOverflow(page);
});
test("Conflicto de inventario vuelve a edición sin mostrar éxito", async ({
  page,
}) => {
  await setup(page, { reject: true });
  await openCheckout(page);
  await page.getByRole("button", { name: "Agregar Cobija de prueba" }).click();
  await page.getByRole("button", { name: "Revisar compra" }).click();
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Inventario insuficiente",
  );
  await expect(
    page.getByRole("heading", { name: "Compra registrada correctamente" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Volver a editar" }),
  ).toBeEnabled();
});
test("Respuesta perdida conserva identificador y recupera única compra", async ({
  page,
}) => {
  const data = await setup(page, { lostResponse: true });
  await openCheckout(page);
  await page.getByRole("button", { name: "Agregar Cobija de prueba" }).click();
  await page.getByRole("button", { name: "Revisar compra" }).click();
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar confirmación" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a editar" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Historial", exact: true }).click();
  await expect(page).toHaveURL(/#\/buy\//);
  await expect(page.getByRole("alert")).toContainText("Primero recupera");
  await page.getByRole("button", { name: "Reintentar confirmación" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra registrada correctamente" }),
  ).toBeVisible();
  expect(data.purchases).toHaveLength(1);
  expect(data.participants[0].balance).toBe("10");
});
test("Administración, exportación XLSX, filtros y cierre de sesión", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("link", { name: "Gestionar tienda", exact: true })
    .click();
  await noOverflow(page);
  await expect(
    page.getByRole("button", { name: "Operadores", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar Excel actualizado" })
    .last()
    .click();
  expect((await download).suggestedFilename()).toMatch(/CAIE-Tienda.*\.xlsx/);
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.getByLabel("Buscar productos").fill("cobija");
  await expect(
    page.getByRole("button", { name: /Cobija de prueba/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Cobija de prueba/ }).click();
  await expect(page.getByLabel("Precio en horas")).toHaveValue("2");
  await noOverflow(page);
  await page.getByText("Acceso de este teléfono", { exact: true }).click();
  const logout = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/logout"),
  );
  await page
    .getByRole("button", { name: "Cerrar acceso de este teléfono" })
    .click();
  expect((await logout).url()).toContain("scope=local");
  await expect(
    page.getByRole("heading", { name: "Abre el enlace de tu teléfono" }),
  ).toBeVisible();
});
test("Acceso directo persiste al recargar sin correo, contraseña ni tokens en URL", async ({
  page,
}) => {
  await setup(page);
  expect(page.url()).not.toContain("token");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bienvenido a la tienda" }),
  ).toBeVisible();
  await expect(
    page.locator('input[type="email"], input[type="password"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Mi cuenta", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar Excel actualizado" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/CAIE-Tienda.*\.xlsx/);
  await noOverflow(page);
});

test("Añadir participante, conservarlo al recargar y descargarlo en Excel", async ({
  page,
}) => {
  const data = await setup(page);
  await page
    .getByRole("link", { name: "Gestionar tienda", exact: true })
    .click();
  await page.getByRole("button", { name: "Agregar participante" }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Nuevo participante" }) });
  await form
    .getByLabel("Nombre", { exact: true })
    .fill("Persona nueva sintética");
  await form.getByLabel("Grupo del participante").selectOption("Grandes");
  await form.getByLabel("Saldo de horas").fill("12.345");
  await form.getByRole("button", { name: "Guardar participante" }).click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  await expect(
    page.getByRole("heading", { name: "Nuevo participante" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Persona nueva sintética/ }),
  ).toBeVisible();
  expect(data.participants).toHaveLength(4);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar Excel actualizado" })
    .first()
    .click();
  const file = await download;
  const path = await file.path();
  expect(path).not.toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(path!));
  const sheet = workbook.getWorksheet("Horas")!;
  expect(sheet.getRow(5).values).toEqual([
    ,
    "Persona nueva sintética",
    "Grandes",
    12.345,
    "Pendiente",
  ]);
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.getByRole("button", { name: "Agregar producto" }).click();
  const productForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Nuevo producto" }) });
  await productForm
    .getByLabel("Nombre", { exact: true })
    .fill("Producto nuevo sintético");
  await productForm.getByLabel("Categoría del producto").selectOption("Hogar");
  await productForm.getByLabel("Precio en horas").fill("1.25");
  await productForm.getByLabel("Existencias (unidades)").fill("15");
  await productForm.getByRole("button", { name: "Guardar producto" }).click();
  await expect(
    page.getByRole("button", { name: /Producto nuevo sintético/ }),
  ).toBeVisible();
  const nextDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar Excel actualizado" })
    .first()
    .click();
  const nextFile = await nextDownload;
  const nextWorkbook = new ExcelJS.Workbook();
  await nextWorkbook.xlsx.load(readFileSync((await nextFile.path())!));
  const inventory = nextWorkbook.getWorksheet("Inventario")!;
  const added = inventory
    .getRows(2, inventory.rowCount - 1)!
    .find((row) => row.getCell(1).value === "Producto nuevo sintético");
  expect(added?.values).toEqual([
    ,
    "Producto nuevo sintético",
    1.25,
    15,
    "Hogar",
  ]);
  await noOverflow(page);
});

test("URL pública no muestra registros ni pide correo o contraseña", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rpc/")) requests.push(r.url());
  });
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: "Abre el enlace de tu teléfono" }),
  ).toBeVisible();
  await expect(
    page.locator('input[type="email"], input[type="password"]'),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  await noOverflow(page);
});
test("Catálogo búsqueda y categorías, conexión y objetivos táctiles", async ({
  page,
}) => {
  await setup(page);
  await openCheckout(page);
  await page
    .getByRole("button", { name: "Útiles escolares", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cuaderno de prueba" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cobija de prueba" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByLabel("Buscar productos").fill("cobija");
  await expect(
    page.getByRole("heading", { name: "Cobija de prueba" }),
  ).toBeVisible();
  const box = await page
    .getByRole("button", { name: "Agregar Cobija de prueba" })
    .boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await noOverflow(page);
});
