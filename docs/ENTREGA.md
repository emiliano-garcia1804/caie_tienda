<!-- Actualizado para el acceso sencillo solicitado por CAIE. -->

# Entrega de CAIE Tienda

## Implementado

React, TypeScript y Vite; Tailwind y estilos accesibles; logotipo oficial existente; interfaz en español para 320–430 px, tablets y escritorio. Flujo completo de grupos, participantes, búsqueda, filtros, catálogo, carrito, revisión, compra confirmada e historial. Gestión de datos, saldos, precios, existencias, eventos, anulaciones, importación y exportación. Acceso compartido de CAIE para los cinco teléfonos, cambio de contraseña y sincronización/revalidación. No hay gestión de voluntarios o roles en la interfaz.

PostgreSQL normalizado con ocho tablas, UUID, tres decimales exactos, existencias enteras, RLS y auditoría. Compras/anulaciones atómicas, idempotencia, bloqueo ordenado y formularios administrativos protegidos contra valores obsoletos. Supabase CLI instalada, autenticada y vinculada. Migración aplicada al remoto con autorización; signup público deshabilitado, email activo y redirects locales configurados. Ninguna secret key ni contraseña en frontend o repositorio.

Datos reales importados con autorización: 182 participantes y 42 productos, 1,075 horas; conciliación individual de saldos, precios y unidades. Dos campos siguen pendientes y los productos afectados están bloqueados. No se importaron movimientos históricos. Original privado intacto. Administrador creado y enlace inicial privado en Documentos. Evento **CAIE Tienda · 10 de octubre de 2026** activo; 182 participantes pendientes y cero compras.

GitHub Actions de verificación y publicación manual preparado, base configurable y routing por hash. No se ha publicado ni realizado push al repositorio remoto. El origen Git existente se conservó, aunque se trasladó su carpeta `.git` desde el directorio inicial vacío `caie_tienda` al directorio solicitado `caie-tienda`.

## Archivos de operación

- `README.md`: instalación, configuración, cuentas, importación, exportación, pruebas, deployment y mantenimiento.
- `docs/OPERACION.md`: checklist del evento, respaldo, restauración y conciliación.
- `docs/TEST_REPORT.md`: PASS y BLOCKED con límites de cada suite.
- `docs/db-test-results.json`: 34 pruebas PostgreSQL reales locales.
- `docs/remote-test-results.json`: 8 verificaciones reales de Supabase, sin compras ni participantes simulados.
- `docs/import-result.json`, `docs/reconciliation-result.json`, `docs/event-result.json`: resúmenes sin nombres.
- `supabase/migrations/202610090001_core.sql`: esquema aplicado versionado.
- `supabase/integrity.sql`: consultas de integridad, solo lectura.

## Verificación

PASS: build TypeScript/Vite, 15 pruebas Vitest, 34 de PostgreSQL real local, 24 de navegador móvil, 8 verificaciones remotas, auditoría npm sin vulnerabilidades, inspección/importación/conciliación del original y generación/reapertura de Excel actualizado privado. La comprobación final remota no encontró diferencias entre auditoría, saldos e inventario. Consultar el reporte para distinguir mocks de navegador, SQL real y servicios remotos.

Los casos de última unidad, últimas horas, cinco operadores, doble confirmación, respuesta descartada y fallo intermedio se ejecutaron en PostgreSQL real aislado. No se hicieron compras simuladas en el remoto. La suscripción Realtime remota fue aceptada, pero la sincronización de cinco teléfonos físicos aún requiere un ensayo operativo autorizado.

## Pendientes

- Por la simplificación solicitada, se utiliza un acceso de CAIE desde los cinco teléfonos; no se requiere gestionar altas de voluntarios. La auditoría identifica la cuenta compartida y no diferencia personas que usan esa misma cuenta.
- Establecer la contraseña del acceso CAIE mediante su enlace privado.
- Definir los dos valores NA antes de vender esos productos; pueden permanecer bloqueados.
- Revisar los cinco teléfonos y conectividad real antes del evento.
- Crear respaldo PostgreSQL privado con cliente compatible con PostgreSQL 17 o el procedimiento de Supabase CLI; no se generó dump remoto en esta entrega.
- Configurar la URL final de Auth y autorizar/publicar GitHub Pages cuando corresponda.
- Microsoft Excel de escritorio y Safari/WebKit físicos no se automatizaron.

## Arranque local

```powershell
Set-Location 'C:\Users\emili\OneDrive\Coding\caie-tienda'
npm run dev
```

Abrir `http://127.0.0.1:5173/caie-tienda/`. Para primer acceso, abrir las instrucciones privadas en `C:\Users\emili\Documents\CAIE-privado\primer-acceso.txt`. El Excel actualizado está en esa misma carpeta privada; ningún dato personal se encuentra en el build estático.

## Checklist inmediato para el 10 de octubre

1. Confirmar que Supabase esté activo y completar acceso/contraseña del administrador.
2. Probar el acceso de CAIE en los cinco teléfonos; cerrar sesión al terminar.
3. Revisar evento activo y los dos productos bloqueados, sin inventar valores.
4. Conservar Excel privado y generar respaldo PostgreSQL compatible.
5. Verificar saldos iniciales y existencias, conexión, baterías y coordinación de voluntarios.
6. No entregar artículos hasta la respuesta de compra confirmada; conservar el intento si falla la conexión.
7. Usar anulación y ajustes con motivo para corregir errores; conservar todo el historial.
