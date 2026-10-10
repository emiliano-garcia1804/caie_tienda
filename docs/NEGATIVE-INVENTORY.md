# Inventario negativo

La tienda permite registrar compras de productos activos con precio y existencias conocidos, incluso si las existencias son cero o negativas. El saldo de horas del participante sigue siendo un límite obligatorio; precios y horas no pueden ser negativos. Los datos NA siguen bloqueados.

Antes de confirmar, el carrito muestra los artículos cuyo inventario quedará negativo y el saldo esperado. Verificar que las unidades existen físicamente. La interfaz identifica inventario cero y negativo; Gestionar tienda permite filtrarlo y registrar ajustes auditados. El Excel conserva existencias negativas como números y resalta las celdas en rojo, sin alterar encabezados ni precios históricos.

Las compras siguen siendo transacciones atómicas con bloqueos de filas e idempotencia. Dos compras diferentes pueden llevar el inventario de 1 a -1, pero no perder descuentos. Anular devuelve exactamente las unidades y horas de esa compra. Los negativos indican discrepancias que se deben conciliar, no corrupción de la auditoría.

## Productos no listados

En Seleccionar artículos, abrir **¿No encuentras el producto? Agregar uno no listado**. Introducir nombre, costo unitario en horas, cantidad y categoría. Añadirlo al carrito, revisar y confirmar. Los productos existentes con el mismo nombre se sugieren para evitar duplicarlos; dos personas pueden introducir nombres parecidos, por lo que conviene revisar el catálogo antes de agregar.

La migración `202610100002_unlisted_products.sql` crea el producto y la compra en una sola transacción. Antes de confirmar no modifica la base. Los errores revierten también el alta y su auditoría; reintentos con el mismo identificador devuelven una única compra. El producto comienza con inventario cero y la compra descuenta las unidades. El nombre y costo aparecen en el recibo, historial y hojas Inventario/Movimientos del Excel. Anular devuelve sus horas y unidades; el producto queda en el catálogo para conciliación.

## Activación

Aplicar las nuevas migraciones con la CLI vinculada al proyecto existente:

```sh
git pull --ff-only
npx supabase db push --dry-run --linked
npx supabase db push --linked
```

La migración `202610100001_negative_inventory.sql` no modifica cantidades, saldos, compras ni participantes existentes. Retira la restricción de stock no negativo, actualiza el estado derivado del producto y reemplaza la función de compra conservando permisos, auditoría y validaciones restantes. No editar migraciones ya aplicadas. La actualización de la base y la publicación de la página son pasos separados.

Después de aplicar ambas migraciones, ejecutar el workflow existente **Publicar CAIE Tienda (manual)** sobre main con la autorización `PUBLICAR`. No se necesita cambiar variables públicas ni credenciales.

## Validación de este cambio

- 22 pruebas unitarias PASS: carrito exacto, horas insuficientes, stock cero/negativo, bloqueo NA/inactivo y exportación/reapertura de negativos.
- Build TypeScript/Vite PASS.
- Validación adicional de migraciones y operaciones SQL con PGlite (PostgreSQL WebAssembly): verificación local secuencial, no sustituye pruebas de concurrencia con conexiones PostgreSQL independientes.
- Las pruebas PostgreSQL y Playwright del repositorio se actualizaron para verificar la nueva política; GitHub Actions ejecuta ambas suites con datos sintéticos. La sesión local no dispone de binarios PostgreSQL y la descarga de Chromium no pudo completarse.
- El acceso administrativo remoto a Supabase no está disponible en esta sesión. No afirmar activación de producción hasta aplicar la migración y publicar la página.
