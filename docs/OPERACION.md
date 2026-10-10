<!-- Actualizado para el acceso sencillo solicitado por CAIE. -->
# Operación y respaldo

## Antes del primer evento

- Verificar que Supabase esté activo desde el Dashboard; hacerlo uno o dos días antes para resolver una pausa con tiempo.
- Verificar registro público deshabilitado y políticas RLS aplicadas; una cuenta sin perfil debe quedar sin acceso.
- Utilizar el acceso de CAIE ya preparado y comprobar inicio y cierre de sesión en los cinco teléfonos. La auditoría quedará a nombre de esa cuenta compartida.
- Obtener autorización para importar el Excel original. Conciliar 182 participantes, grupos, 1,075 horas y 42 productos; resolver ambigüedades si se detectan.
- Corregir precio de Bomba para inflar y existencias de Juguetes, o mantenerlos no disponibles.
- Crear/activar el evento correcto. Confirmar nombre, fecha, participantes pendientes, saldo e inventario conservados.
- Descargar Excel y respaldo PostgreSQL privados antes de abrir.
- Revisar Wi-Fi/datos, baterías, cargadores, legibilidad y botones. No registrar compras sin conexión.
- Realizar capacitación con capturas sintéticas o el entorno aislado; no hacer compras simuladas en producción.
- Tener a un administrador disponible para anulaciones y ajustes con motivo.

## Durante el evento

1. Confirmar verbalmente el participante y su grupo.
2. Revisar horas, artículos, cantidades y saldo restante antes de confirmar.
3. Entregar artículos después de recibir “Compra registrada correctamente”.
4. Si falla la respuesta, mantener la pantalla y reintentar con el mismo intento. Revisar historial antes de capturar otra compra.
5. Si otro operador agotó un artículo o gastó horas del participante, corregir el carrito usando la información actualizada.
6. Reportar errores al administrador con la referencia de compra; evitar fotos o mensajes públicos con nombres personales.

## Al cerrar

- Conciliar unidades físicas con inventario. Registrar diferencias con motivo, nunca borrar compras.
- Revisar compras anuladas y ajustes en Auditoría.
- Ejecutar `supabase/integrity.sql` desde una conexión administrativa protegida: los resultados con diferencias requieren investigación.
- Cerrar evento, descargar Excel actualizado y crear respaldo PostgreSQL privado.
- Cerrar sesiones de los teléfonos compartidos. Desactivar cuentas que ya no deban acceder.

## Respaldos PostgreSQL

Guardar respaldos fuera del repositorio y de GitHub Pages, preferentemente cifrados y con acceso restringido. Una ruta posible es `C:\Users\emili\Documents\CAIE-privado\respaldos`. No almacenar contraseñas en scripts ni argumentos publicados.

Después de verificar conexión CLI, las exportaciones son operaciones de lectura autorizadas:

```powershell
npx supabase db dump --linked --file 'C:\Users\emili\Documents\CAIE-privado\respaldos\schema.sql'
npx supabase db dump --linked --data-only --file 'C:\Users\emili\Documents\CAIE-privado\respaldos\data.sql'
npx supabase db dump --linked --role-only --file 'C:\Users\emili\Documents\CAIE-privado\respaldos\roles.sql'
```

`db dump` puede necesitar Docker. Como alternativa, `pg_dump` está instalado y puede utilizarse con el host/puerto/usuario del pooler en modo sesión y contraseña solicitada de forma interactiva (`-W`). **No usar la cadena de conexión con contraseña en comandos o archivos públicos.**

```powershell
& 'C:\Program Files\PostgreSQL\15\bin\pg_dump.exe' -h HOST-POOLER -p 5432 -U postgres.krjyplolmaoflcknhlpt -d postgres -W -Fc -f 'C:\Users\emili\Documents\CAIE-privado\respaldos\caie.dump'
```

Usar cliente pg_dump de versión igual o superior a la del servidor remoto; si el servidor es posterior a PostgreSQL 15, actualizar el cliente antes de generar respaldo. El comando de ejemplo con 15 no es garantía de compatibilidad con el remoto. Verificar el archivo con `pg_restore --list`. No se ha generado un respaldo remoto en esta entrega. Los archivos contienen datos personales y posiblemente datos Auth, según esquemas exportados; tratarlos como privados.

Conservar al menos el respaldo previo y posterior de cada evento, junto con la versión del repositorio/migraciones. Descargar el Excel facilita conciliación humana; el respaldo SQL conserva auditoría y relaciones. Verificar que el respaldo elegido incluya los esquemas/datos necesarios para cuentas Auth; los dumps predeterminados de CLI pueden excluir esquemas administrados. Revisar el procedimiento oficial antes de una recuperación completa.

## Restauración

1. Restaurar primero en un proyecto o base aislada y vacía, nunca sobre producción como ensayo.
2. Seguir las instrucciones de Supabase para esquemas administrados, roles y Auth; no sustituir tablas internas de Auth a ciegas.
3. Para un dump custom completo, usar `pg_restore` con credenciales solicitadas interactivamente y sin `--clean` sobre una base con datos existentes.
4. Ejecutar conciliación de `supabase/integrity.sql`, comprobar FK, conteos, saldos, existencias, compras y permisos.
5. Verificar acceso con una cuenta individual de pruebas en ese entorno aislado.
6. Restaurar producción únicamente con autorización expresa, ventana de mantenimiento y respaldo previo. La restauración puede ser destructiva y no está autorizada por la preparación del proyecto.

## Conciliación

`supabase/integrity.sql` compara los saldos e inventarios actuales con el saldo inicial y los deltas registrados por auditoría. También verifica suma de detalles contra total de cada compra, no negatividad y un único evento activo. Las comprobaciones no sustituyen el conteo físico ni la revisión de motivos. Las compras anuladas permanecen en Movimientos con su estado. Las horas reintegradas y unidades devueltas aparecen en auditoría.

La auditoría completa es inmutable para los clientes; la interfaz muestra los últimos 500 movimientos. Usar una consulta administrativa privada para periodos mayores. No entregar dumps o reportes con nombres a usuarios sin autorización.
