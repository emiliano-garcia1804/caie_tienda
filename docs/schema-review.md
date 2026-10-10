# Migración preparada para revisión

Proyecto remoto: `krjyplolmaoflcknhlpt`. Archivo: `supabase/migrations/202610090001_core.sql`.

## Cambios

- Ocho tablas: perfiles individuales, participantes, productos, eventos, compras, detalles, auditoría y lotes de importación.
- Identificadores UUID, fechas con zona horaria, horas exactas `numeric(12,3)`, existencias enteras y restricciones contra valores negativos.
- Un máximo de un evento activo. Estados de compra derivados de transacciones confirmadas del evento activo.
- RLS de lectura para perfiles autorizados; ningún cliente, incluido un administrador, modifica las tablas directamente.
- RPC de compra y anulación con bloqueo de filas, transacción única, precios históricos y auditoría. Compra idempotente por identificador UUID; rechazo de reutilización con otro contenido u operador.
- RPC administrativas auditadas y detección de formularios con saldo/inventario obsoletos.
- Importación inicial única por fingerprint, bloqueada cuando ya existen datos. Exportación administrativa desde una lectura consistente.
- Realtime para cambios en participantes, productos, compras, eventos y perfiles.
- Permisos de ejecución limitados a las funciones creadas por la migración; `SECURITY DEFINER` con `search_path` vacío y autorización interna.

## Alcance de la aprobación

La aprobación de esta migración **no autoriza** importar datos personales del Excel, crear compras simuladas en producción ni publicar GitHub Pages. La migración no contiene nombres reales, productos precargados, compras de prueba ni borrados.

Pruebas locales ejecutadas contra PostgreSQL real; informe `docs/db-test-results.json`. Supabase Auth y Realtime remotos requieren una verificación posterior, con cuentas autorizadas y sin compras de prueba en producción.
