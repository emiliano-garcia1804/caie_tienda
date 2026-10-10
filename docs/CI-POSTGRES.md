# Diagnóstico de PostgreSQL en CI

El repositorio local tenía un único commit, `fd0c7e1`, y el árbol estaba limpio antes de esta corrección. Se conservaron la aplicación, la migración y las 34 pruebas SQL existentes.

Los logs descargados de la [ejecución fallida](https://github.com/emiliano-garcia1804/caie_tienda/actions/runs/38017465775) confirman Ubuntu 24.04, `CAIE_PG_BIN=/usr/lib/postgresql/16/bin`, preparación de PostgreSQL exitosa, `ECONNREFUSED` y un error posterior de `pg_ctl stop`. Esa ejecución no imprimió ni guardó `.local/postgres-test.log`. Por tanto, el mensaje fatal original del servidor no se puede recuperar de sus artefactos y la causa concreta de ese arranque no está confirmada.

El defecto de configuración identificado es que el script dejaba los sockets Unix en la ubicación predeterminada del paquete. En Debian/Ubuntu suele ser `/var/run/postgresql`, un directorio del servicio PostgreSQL que el usuario del runner puede no poder escribir. PostgreSQL necesita crear allí tanto el socket como su archivo de bloqueo, incluso si los clientes utilizan TCP. Esta es la explicación probable del fallo de arranque, pendiente de validación en Ubuntu. La [documentación oficial](https://www.postgresql.org/docs/15/runtime-config-connection.html) explica que la ubicación predeterminada puede cambiar al compilar PostgreSQL y que se crean ambos archivos.

Se comprobó también el defecto del manejo de errores: el script anterior asignaba `started=true` inmediatamente después de lanzar el proceso, antes de comprobar disponibilidad. El cierre fallaba si el servidor había terminado y sustituía el fallo original. El script ahora usa `pg_ctl start -w -t 60`, captura su salida y muestra las últimas 100 líneas del log ante un fallo de infraestructura. Solo cierra un servidor cuyo arranque fue confirmado o que sigue vivo tras un timeout de arranque. Cada operación de limpieza registra sus propios errores sin impedir las siguientes ni la escritura del reporte.

En Linux se crea `.local/pg-test-sockets` con modo `0700`, se corrigen los permisos de un directorio existente y se pasa explícitamente con `-k`; los sockets también usan `0700`. Windows mantiene únicamente TCP. El script comprueba el directorio de datos y la configuración de sockets de la instancia antes de crear la base sintética. Verifica ejecutables, versiones y propiedad del clúster, y rechaza un puerto ocupado. El reporte registra la versión real; no etiqueta PostgreSQL 16 como 15.

Durante la validación se detectó otro problema: en Windows, el servidor podía heredar los canales de salida de `pg_ctl`, bloqueando `spawnSync` aunque el servidor estuviera listo. La salida de arranque de `pg_ctl` se captura en un archivo local para evitar esa espera; se incluye en el error si falla.

Validación local ejecutada con Node 24.15.0 y PostgreSQL 15.4 en Windows:

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 15/15 PASS |
| `npm run build` | PASS; advertencia existente de tamaño de bundles |
| `npm run test:db` | 34/34 PASS, base temporal eliminada y servidor cerrado |
| `npm run test:e2e` | 24/24 PASS con fixtures HTTP sintéticos |
| Clúster nuevo en un directorio temporal | `initdb`, 34 pruebas reales y cierre: PASS |
| Configuración inválida de PostgreSQL inyectada | Exit 1 esperado, log original visible, reporte FAIL guardado y sin intento de stop de un servidor inexistente: PASS |
| Puerto ocupado por un servicio local de prueba | Exit 1 esperado con `EADDRINUSE`, sin utilizar ni cerrar ese servicio: PASS |

El primer intento de cambiar el arranque a `pg_ctl` se bloqueó por la herencia de canales en Windows; se cerró ese servidor sintético y se corrigió antes de la ejecución final. No hay pruebas pendientes o fallidas en la ejecución local final. Las verificaciones auxiliares y sus logs están bajo `.local/`, fuera de Git. No se ejecutó Ubuntu localmente: este equipo no tiene WSL ni Docker instalados. No se modificaron datos remotos de Supabase ni se desplegó la aplicación.

Para verificar en GitHub, hacer commit y push de estos cambios y abrir el workflow **Verificar CAIE Tienda**. Confirmar las versiones impresas en **Preparar PostgreSQL real** y las 34 pruebas PASS en **Pruebas PostgreSQL real con datos sintéticos**, además del build, Vitest y Playwright. Si falla la suite de base de datos, revisar **Diagnóstico PostgreSQL** y descargar **postgres-failures-synthetic**, que incluye el log y el reporte JSON. El workflow conserva `npm run test:db` como paso obligatorio, sin mocks ni tolerancia a fallos. Un push normal no ejecuta el workflow manual de publicación a producción.
