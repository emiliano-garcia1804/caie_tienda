<!-- Actualizado para el acceso sencillo solicitado por CAIE. -->

# Reporte de pruebas

Las pruebas utilizan exclusivamente datos sintéticos. No se ejecutaron compras de prueba en Supabase remoto. La importación definitiva de personas reales se realizó por separado, con autorización expresa y conciliación. Los resultados SQL detallados y la fecha de ejecución se conservan en `db-test-results.json`.

## Primera etapa: acceso directo compartido

Validación de la versión sin formularios de correo ni contraseña: build PASS, 20 pruebas unitarias PASS, 37 pruebas de PostgreSQL real PASS y 30 pruebas de navegador PASS. Se verificaron apertura por enlace privado, retiro de tokens de la URL, persistencia al recargar, cierre limitado a un dispositivo, alta de participantes/productos y descarga del Excel reabierto con sus registros. Los errores encontrados al probar la etiqueta del selector de grupo se corrigieron antes de la ejecución final.

La migración adicional solo amplía `admin_participant` para aceptar un ID nulo al crear un participante. Se comprobaron saldo decimal exacto, auditoría, rechazo de operador/anónimo y rollback de altas inválidas. Todas las pruebas anteriores de atomicidad, saldos, inventario, cinco operadores, idempotencia, anulaciones y RLS siguen ejecutándose. No se hicieron compras ni altas de prueba sobre datos reales.

La primera ejecución de esta etapa en GitHub Actions detectó que el botón de Excel desbordaba el encabezado de 320 px en Ubuntu. En teléfonos se muestra ahora un botón de descarga de 44 px con su nombre accesible, conservando las comprobaciones de ausencia de desplazamiento horizontal.

El resumen que sigue documenta la entrega anterior y sus verificaciones originales.

## Resumen ejecutado

| Suite                            | Resultado         | Evidencia y límite                                                                                                         |
| -------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| TypeScript y build Vite          | PASS              | Build estático generado con base `/caie-tienda/`; advertencia de tamaño de bundles, sin errores                            |
| Vitest                           | PASS · 15 pruebas | Cálculo decimal exacto, validaciones de carrito, normalización, importación, ambiguos, NA y exportación/reapertura XLSX    |
| PostgreSQL real local            | PASS · 34 pruebas | PostgreSQL 15.4 instalado; migración completa, RLS, RPC, concurrencia y rollback; Auth se reemplaza con `auth.uid()` local |
| Playwright                       | PASS · 24 pruebas | Ocho escenarios en Android, iPhone simulado y 320 px; Chromium; Auth y RPC HTTP interceptados                              |
| Auditoría npm                    | PASS              | Cero vulnerabilidades reportadas después del override de uuid 11.1.1                                                       |
| Vinculación CLI y dry-run remoto | PASS              | Proyecto vinculado; `db push --dry-run` identifica una migración pendiente; no la aplica                                   |
| Inspección del Excel original    | PASS              | 182 participantes, 42 productos, ocho hojas, grupos correctos, 1,075 horas, dos NA, sin ambiguos normalizados              |

## Funcionalidad

| Caso solicitado                                               | Estado  | Cómo se comprobó                                                                                                                  |
| ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1–4: grupos, búsqueda, saldos y filtros Status                | PASS    | Playwright en tres tamaños                                                                                                        |
| 5–8: selección, cantidades, costos y saldo restante           | PASS    | Playwright y Decimal/Vitest                                                                                                       |
| 9–11: una compra, múltiples productos y varias unidades       | PASS    | RPC en PostgreSQL real y flujo de navegador                                                                                       |
| 12–16: saldo/stock insuficiente, agotado, precio NA, stock NA | PASS    | PostgreSQL real y bloqueos de interfaz                                                                                            |
| 17–18: Status y segunda compra                                | PASS    | Snapshot PostgreSQL y advertencia de navegador                                                                                    |
| 19–20: anulación y restitución exacta                         | PASS    | PostgreSQL real; doble anulación rechazada y Status recalculado                                                                   |
| 21: nuevo evento                                              | PASS    | PostgreSQL real; estado pendiente con saldo/inventario conservados; dos activos rechazados                                        |
| 22: exportación                                               | PASS    | RPC snapshot concurrente real, generación/reapertura ExcelJS y descarga desde navegador                                           |
| 23–24: importación y reimportación                            | PASS    | Workbook sintético + PostgreSQL real, repetición sin duplicar ni reponer saldo gastado                                            |
| Importación definitiva de participantes reales                | PASS    | Autorizada y ejecutada; conciliación individual de 182 saldos y 42 productos; `import-result.json` y `reconciliation-result.json` |
| Apertura en Microsoft Excel de escritorio                     | BLOCKED | Se reabrieron los XLSX con ExcelJS; no se automatizó Microsoft Excel                                                              |

## Concurrencia real

| Caso                                    | Estado | Resultado verificado                                                                                                                                                        |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · Última unidad                       | PASS   | Dos usuarios distintos; una confirmación y stock cero                                                                                                                       |
| B · Últimas horas                       | PASS   | Dos usuarios sobre un participante; una confirmación y saldo cero                                                                                                           |
| C · Cinco operadores                    | PASS   | Cinco usuarios/participantes, mismo producto; cinco compras, cinco unidades descontadas, horas conciliadas                                                                  |
| D · Doble confirmación                  | PASS   | Dos conexiones, misma clave; mismo recibo y un solo descuento; payload diferente rechazado                                                                                  |
| E · Respuesta perdida                   | PASS   | PostgreSQL: descartar respuesta tras commit y repetir devuelve compra existente; navegador: abortar HTTP tras procesamiento sintético conserva intento y recupera resultado |
| F · Fallo intermedio                    | PASS   | Trigger de fallo en prueba tras descuentos: rollback de saldo, inventario, compra, detalle y auditoría                                                                      |
| Carritos con productos en orden opuesto | PASS   | Dos compras concurrentes sin deadlock                                                                                                                                       |
| Snapshot durante cinco compras          | PASS   | Inventario, compras y saldos corresponden al mismo snapshot                                                                                                                 |

E no representa una desconexión física de teléfono contra Supabase remoto. La persistencia y la concurrencia declaradas arriba corresponden al motor PostgreSQL real local, no a mocks.

## Seguridad

| Caso                                                    | Estado  | Evidencia                                                                                                                                     |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Anónimos sin lectura/RPC                                | PASS    | Roles PostgreSQL reales, permission denied                                                                                                    |
| Operador sin escritura directa de saldo/precio/permisos | PASS    | Roles reales, permission denied                                                                                                               |
| Cuenta sin perfil o desactivada                         | PASS    | Lectura RLS vacía y RPC rechazadas                                                                                                            |
| Precio alterado desde cliente                           | PASS    | Precio real y precio esperado comparados en RPC; operación rechazada                                                                          |
| RPC administrativas/exportación solo admin              | PASS    | Operador rechazado, administrador obtiene snapshot                                                                                            |
| Todas las tablas con RLS                                | PASS    | Consulta de catálogo PostgreSQL                                                                                                               |
| SECURITY DEFINER con search_path seguro                 | PASS    | Consulta de catálogo PostgreSQL                                                                                                               |
| Ajustes obsoletos                                       | PASS    | Saldo/existencias cambiadas causan rechazo; auditoría de cambios válidos                                                                      |
| Supabase Auth real y administrador individual           | PASS    | Cuenta autorizada creada; sesión JWT real y acceso a snapshot/exportación; `remote-test-results.json` (8 pruebas)                             |
| Cinco sesiones con una cuenta CAIE compartida           | PASS    | PostgreSQL real: compras simultáneas consistentes; no se necesitan cinco cuentas individuales por la simplificación solicitada                |
| RLS/RPC del proyecto Supabase remoto                    | PASS    | Ocho tablas con RLS, cero RPC accesibles a anon, lectura anónima rechazada, JWT admin sin escritura directa; no se hicieron compras de prueba |
| Suscripción Realtime autenticada remota                 | PASS    | Suscripción real aceptada por Supabase, sin mutar datos para probarla                                                                         |
| Sincronización Realtime entre cinco teléfonos reales    | BLOCKED | Pendiente comprobar dispositivos físicos; no se hicieron compras simuladas en producción                                                      |

## Móvil y revisión visual

PASS: navegación, búsqueda, filtros, cantidades, carrito, confirmación, éxito, errores de inventario, reintento tras respuesta perdida, inicio/cierre de sesión interceptado, descarga Excel, ausencia de desbordamiento horizontal en pantallas revisadas y controles de cantidades de 44 × 44 px. Capturas sintéticas revisadas visualmente en `.local/screenshots/`.

BLOCKED: Safari/WebKit real, dispositivos físicos y conectividad de cinco teléfonos. La emulación iPhone utiliza Chromium y no sustituye Safari.

## Problemas corregidos

- Resolución de dependencias: se fijó @types/node moderno compatible con Vite.
- Dependencia transitiva vulnerable: override uuid 11.1.1, con repetición de pruebas XLSX.
- Expresión CASE de validación SQL: se añadieron paréntesis para la sintaxis PL/pgSQL.
- Arranque del servidor de prueba en Windows: proceso oculto con log dedicado, sin heredar pipes del comando.
- Expectativas SQL: formato decimal de PostgreSQL conserva tres lugares; se corrigió el test, sin cambiar la aritmética.
- Recuperación de respuesta perdida: el Status actualizado no puede ocultar un intento pendiente con la advertencia de compra repetida.
- Carrito móvil: resumen compacto fijo y artículos expandibles, en lugar de panel completo superpuesto al catálogo.
- ExcelJS: carga bajo demanda para reducir el bundle inicial.
- Ajustes administrativos: comprobación de valores originales para evitar sobrescribir compras concurrentes.
- Actualización de contraseña: los eventos de Auth ya no desmontan la compra ni la pantalla de cuenta; verificado en los tres tamaños móviles.

## Revisión final del remoto

PASS: consulta agregada de solo lectura en el proyecto remoto: cero diferencias entre auditoría y saldos/existencias, cero valores negativos, un evento activo, 182 participantes, 42 productos y cero compras. Consulta versionada en `supabase/integrity-summary.sql`.

Los asesores de Supabase muestran advertencias por funciones SECURITY DEFINER ejecutables por usuarios autenticados. Es el mecanismo requerido para las RPC: cada función valida permisos internos y usa `search_path` protegido; no tienen acceso anónimo. También se informó que la protección de contraseñas filtradas de Supabase Auth está desactivada. No se activaron servicios de pago. Estas advertencias se documentan y no se presentan como una auditoría sin alertas.

## Pendiente para producción

Migración aplicada con autorización, Auth/RLS remotos verificados, administrador creado, importación autorizada y conciliada, evento del 10 de octubre de 2026 activo. Pendientes: definir los dos valores NA si se desean vender esos productos, comprobar cinco teléfonos físicos, respaldo PostgreSQL privado, URL final de Auth y autorización de publicación. No hay publicación realizada ni compras sintéticas en producción.

## Verificación remota y conciliación posteriores

PASS · 8 verificaciones remotas (`remote-test-results.json`): registro público deshabilitado, anónimo sin lectura ni RPC, sesión Supabase Auth real, snapshot/exportación admin, escritura directa rechazada incluso para admin, RPC inválida sin compra creada y suscripción Realtime autenticada. PASS · todos los saldos, precios y unidades reales coinciden individualmente con el original; exportación XLSX privada creada y reabierta (`reconciliation-result.json`). PASS · evento real creado/activado y 182 participantes pendientes (`event-result.json`).
