<!-- Actualizado para el acceso sencillo solicitado por CAIE. -->

# CAIE Tienda

Aplicación React/TypeScript para intercambiar horas educativas por artículos. Frontend estático para GitHub Pages; Supabase proporciona Auth, PostgreSQL, RLS y Realtime. No utiliza la API de OpenAI ni un servidor Node permanente.

## Estado de entrega

Implementados el flujo móvil completo, administración, compras y anulaciones atómicas, ajustes auditados, eventos, importación inicial protegida y exportación Excel. Consulta `docs/TEST_REPORT.md` y `docs/db-test-results.json` para conocer qué se ejecutó y qué sigue pendiente. El esquema remoto y la importación real ya fueron aplicados con autorización y conciliación. Existe un evento activo para el 10 de octubre de 2026. GitHub Pages está publicado en `https://emiliano-garcia1804.github.io/caie_tienda/`. Esta primera etapa usa acceso público expresamente autorizado, sin cuentas, contraseñas ni enlaces privados. El alcance del esquema original está descrito en `docs/schema-review.md` y el acceso actual en `docs/ACCESO-SENCILLO.md`.

## Instalación y ejecución

Requiere Node.js 24 y npm. En PowerShell:

```powershell
Set-Location 'C:\Users\emili\OneDrive\Coding\caie-tienda'
npm ci
Copy-Item .env.example .env.local # únicamente si todavía no existe
npm run dev
```

Abrir `http://127.0.0.1:5173/caie-tienda/`. `.env.local` ya está configurado en la instalación actual y excluido de Git. URL y publishable key son públicas. Nunca añadir contraseñas PostgreSQL, secret keys ni claves service_role a variables `VITE_*`.

La aplicación abre directamente la tienda compartida en cualquiera de los cinco teléfonos, sin correo, contraseña ni enlaces privados. Por autorización expresa del propietario, cualquier visitante puede consultar y modificar los recursos de esta etapa. `open_store` reutiliza las operaciones transaccionales existentes; las tablas mantienen RLS y no permiten escritura directa. No hay datos ficticios en la aplicación; las pruebas interceptan HTTP únicamente en Playwright.

## Arquitectura y estructura

```text
src/App.tsx             Pantallas, autenticación, compra y administración
src/api.ts              Cliente Supabase y llamadas RPC
src/domain.ts           Tipos, búsqueda normalizada, cálculos Decimal
src/excel.ts            Inspección local y generación XLSX (carga bajo demanda)
src/styles.css          Interfaz móvil con identidad del recurso oficial
public/caie.jpeg         Copia del recurso institucional, sin fotografías personales
supabase/migrations/    Esquema, índices, permisos, RLS y funciones versionadas
supabase/config.toml    Configuración local y propiedades Auth declaradas
supabase/integrity.sql  Conciliación de auditoría, saldos, unidades y compras
scripts/                Inspección Excel, cuentas seguras y pruebas PostgreSQL
tests/                  Pruebas de cálculo, Excel y navegador
docs/                   Revisión de migración, resultados y operación
.github/workflows/      CI y publicación manual con autorización
```

Las horas usan `numeric(12,3)` en PostgreSQL y cadenas con Decimal.js en React: hasta tres decimales exactos. Los precios `NA` y las existencias `NA` son `NULL`, no cero. La aplicación muestra estas filas como no disponibles. Las cantidades son enteros.

Tablas: `profiles`, `participants`, `products`, `events`, `purchases`, `purchase_items`, `audit_log`, `import_batches`. No se usa el nombre como identificador. Eventos tienen estados pendiente (`draft`), activo y cerrado; un índice parcial garantiza un máximo de un evento activo. Los nombres del participante, grupo y producto quedan guardados en la compra para preservar el historial ante correcciones.

`confirm_purchase` valida perfil activo, bloquea el evento para lectura compartida, bloquea al participante y los productos ordenados por UUID, verifica precios y saldo, inserta compra/detalle, descuenta horas/unidades y registra auditoría en una sola transacción. Un bloqueo de asesoría por clave UUID y una restricción única garantizan idempotencia. La misma clave con distinto contenido u operador se rechaza. Los precios del navegador solo sirven para detectar cambios; la base calcula con sus propios precios.

`cancel_purchase` conserva la compra, reintegra horas y unidades, registra motivo/actor y rechaza una segunda anulación. El Status se deriva de compras confirmadas del evento activo. En acceso público hay revalidación al recuperar foco, conexión y cada 30 segundos; Realtime se mantiene para el modo por cuentas. `app_snapshot` y `export_snapshot` construyen todos sus datos mediante un solo SELECT para conservar una lectura consistente.

## Supabase y migraciones

La CLI está instalada como dependencia local (`npx supabase`). El proyecto actual ya está vinculado a `krjyplolmaoflcknhlpt`; la autenticación CLI se guarda fuera del repositorio.

```powershell
npx supabase login --output pretty --agent no
npx supabase link --project-ref krjyplolmaoflcknhlpt
npx supabase db push --dry-run --linked
```

**Solo después de aprobación explícita de la migración:**

```powershell
npx supabase db push --linked
```

La configuración Auth declara registro público deshabilitado. Verificar y aplicar la configuración autorizada:

```powershell
npx supabase config diff --project-ref krjyplolmaoflcknhlpt --agent no
npx supabase config push --project-ref krjyplolmaoflcknhlpt --agent no
```

No activar registros públicos ni usuarios anónimos. La configuración solo modifica propiedades declaradas; revisar el diff antes de cambios. Para usar todo el stack Supabase local se necesita Docker (`npx supabase start`). La instalación actual no tiene Docker; las pruebas SQL utilizan PostgreSQL real instalado, con un reemplazo local de `auth.uid()` y usuarios sintéticos. Esto prueba transacciones y RLS, **no** el stack local de Supabase completo. Adicionalmente, se verificaron Auth real, permisos y suscripción Realtime del proyecto remoto sin crear compras simuladas.

## Acceso sencillo de CAIE

Por la simplificación y el acceso público solicitados, los cinco teléfonos abren la URL normal. No se requiere una lista de voluntarios, una cuenta ni gestionar roles desde la interfaz. Cualquier visitante puede consultar y modificar los recursos. La auditoría etiqueta esos movimientos como **Acceso público**. Consultar `docs/ACCESO-SENCILLO.md` para el uso y el cierre posterior de este modo. Los enlaces privados anteriores ya no son necesarios.

### Procedimiento de cuentas separadas para una etapa posterior

Estas restricciones describen el modo por cuentas, cuando el acceso público se haya cerrado y se publique con `VITE_PUBLIC_ACCESS=false` y `VITE_SIMPLE_ACCESS=false`. Una cuenta Auth sin perfil no recibe acceso a datos por los endpoints privados. No existe una función pública para administrar cuentas. Crear las cuentas mediante el script privilegiado local:

```powershell
npm run accounts
```

El script solicita una secret key de Supabase en entrada oculta, correo, nombre, rol (`admin` para el primero, `operator` para voluntarios) y contraseña temporal de al menos 12 caracteres. La clave se usa únicamente en memoria y no entra en argumentos, logs, `.env`, Git ni frontend. Obtenerla de la configuración privada del proyecto. Si la cuenta Auth se crea pero falla el perfil, el script comunica el UUID para recuperación administrativa; no asigna acceso automáticamente.

La cuenta del primer administrador solicitado ya está creada. Las instrucciones y el enlace temporal están en `C:\Users\emili\Documents\CAIE-privado\primer-acceso.txt`, fuera del repositorio. Abrirlo con el servidor local iniciado y elegir contraseña en Mi cuenta. El enlace caduca; después de usarlo no se necesita para entrar con correo/contraseña. No se envió correo ni se guardó una contraseña. `scripts/provision-admin.mjs` captura la clave CLI únicamente en memoria y prepara un enlace individual privado; `scripts/private-client.mjs` permite tareas administrativas autorizadas mediante JWT y renueva ese enlace. No ejecutar los scripts de verificación de acceso después de entregar el enlace al usuario sin coordinarlo, pues consumen y renuevan enlaces temporales.

Entregar credenciales únicamente a los voluntarios autorizados por un canal privado. Para rotar contraseñas seleccionar Mi cuenta o usar Supabase Auth administrativamente; no colocar contraseñas en el repositorio. La interfaz no incluye gestión de roles ni altas de voluntarios, por la simplificación solicitada. El backend conserva permisos protegidos; si posteriormente se requieren cuentas separadas, el script local permite crearlas. La desactivación se comprueba en cada lectura y RPC aunque un JWT siga vigente. No se permite que un administrador retire sus propios permisos. La revocación de sesiones o eliminación de cuentas Auth requiere el procedimiento de Supabase Auth; los perfiles y referencias históricas deben conservarse.

## Importación del Excel

El original permanece en `C:\Users\emili\OneDrive\Coding\otros archivos caie_tienda`, fuera del repositorio y del build. No copiarlo a `public/`.

```powershell
npm run inspect:excel -- 'C:\Users\emili\OneDrive\Coding\otros archivos caie_tienda\CAIE TIENDA AGO-SEP.xlsx'
```

Este comando imprime solo resúmenes y filas con errores, sin nombres personales. La revisión original encontró 182 participantes, 42 productos, 1,075 horas, ocho hojas, Status vacíos y dos campos NA. Los grupos coinciden con lo solicitado. No se detectaron duplicados normalizados dentro del grupo. No se importaron las hojas de Registro Salida. La importación ya autorizada está completa y conciliada; su resumen sin nombres está en `docs/import-result.json` y `docs/reconciliation-result.json`. Se creó un Excel actualizado privado en `C:\Users\emili\Documents\CAIE-privado\CAIE-Tienda-actual.xlsx`.

Después de verificar RLS y obtener autorización expresa para los datos reales, entrar como administrador → Importación → seleccionar el `.xlsx`. La inspección ocurre localmente en el teléfono/navegador; solo al pulsar Importar se envía el conjunto validado. Revisar cantidades, errores, ambiguos y campos pendientes, y confirmar la autorización. Los archivos con errores o duplicados quedan bloqueados. No se fusionan personas automáticamente.

El hash SHA-256 identifica el lote. Repetir exactamente el archivo devuelve cero registros importados. Otro archivo queda rechazado si ya existe un lote, participante, producto o compra; nunca sobrescribe saldos operativos. Correcciones posteriores se realizan con ajustes auditados y una conciliación humana. No se importan compras históricas.

## Uso y exportación

Abrir la página → Nueva compra → grupo → participante → productos/cantidades → Revisar compra → Confirmar. Revisar nombre y artículos con el participante. Una segunda compra muestra advertencia y permite continuar. Sin conexión no se confirma.

Si se pierde una respuesta, mantener la pantalla abierta y usar **Reintentar confirmación**, que conserva el mismo identificador y contenido. No repetir la compra desde otra pantalla sin revisar primero el historial. Solo se muestra éxito después de una respuesta válida. Ante conflicto definitivo, volver a editar y revisar inventario/saldo actualizado.

Gestionar tienda: ajustar horas o precios/existencias con un motivo, agregar productos, gestionar eventos, consultar historial y anular compras. Los formularios rechazan cambios si su saldo o inventario original ya cambió; seleccionar de nuevo el registro.

**Descargar Excel actualizado** obtiene `export_snapshot` restringido al administrador y genera Horas, Inventario y Movimientos con encabezados solicitados y precios históricos. La fecha se muestra en Ciudad de México. Los NA se conservan como texto. Este Excel es una exportación, no una base operativa ni un respaldo completo. No incluye correos, tokens, contraseñas ni campos privados de Auth. Guárdalo fuera de carpetas públicas y repositorios. Los archivos se validaron reabriéndolos mediante ExcelJS; Microsoft Excel de escritorio no se automatizó.

## Pruebas

```powershell
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
npm run build
```

`test:db` requiere PostgreSQL 15 o posterior. Usa `CAIE_PG_BIN` si está definido; en otro caso consulta `pg_config --bindir`, con una ruta de respaldo para PostgreSQL 15. Comprueba que `postgres`, `initdb` y `pg_ctl` sean de la misma versión mayor y que coincidan con el clúster existente. Crea un clúster exclusivamente de pruebas en `.local/pg-test-cluster`, escucha solo en `127.0.0.1:55439`, usa una base temporal con nombre aleatorio y elimina únicamente esa base al terminar. Nunca acepta una URL remota. Los datos son sintéticos. Rechaza un puerto ocupado o un clúster ya iniciado; no utiliza servicios existentes. En Linux, ejecutar con usuario normal, no root: los sockets se crean en `.local/pg-test-sockets`, con permisos `0700` para el directorio y los sockets. En Windows utiliza únicamente TCP. El arranque y el cierre esperan confirmación de `pg_ctl`; los errores originales se conservan y los fallos de arranque muestran el log. Actions imprime y guarda los logs si falla la suite. Ver `docs/CI-POSTGRES.md`.

Playwright utiliza Chromium con dimensiones/tacto Android, iPhone y 320 px. No equivale a probar Safari/WebKit ni dispositivos físicos. Intercepta Auth/RPC dentro de las pruebas; no envía compras a Supabase. Las capturas sintéticas están en `.local/screenshots/` y el reporte detallado en `playwright-report/`, ambos excluidos de Git. `docs/db-test-results.json` conserva resultados ejecutados del SQL real. Cada cambio relevante requiere repetir las pruebas afectadas; el workflow CI no aplica migraciones.

## GitHub Pages

El repositorio remoto existente se llama `caie_tienda`, mientras el directorio de desarrollo es `caie-tienda`. La URL pública final debe usar el nombre real del repositorio. `VITE_BASE_PATH` controla la base; el workflow la obtiene automáticamente de `github.event.repository.name`. HashRouter permite recargar rutas sin servidor adicional ni reglas de reescritura.

1. Obtener autorización expresa de publicación, completar pruebas remotas y revisión de privacidad.
2. Configurar las variables públicas de Actions `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Configurar Settings → Pages → GitHub Actions y proteger el entorno `github-pages` si se desea aprobación adicional.
4. En Supabase Auth, actualizar Site URL y redirects autorizados a `https://USUARIO.github.io/NOMBRE-REPO/`. Conservar localhost solo durante desarrollo. No incluir `#/` en la URL base de autenticación.
5. Subir los archivos revisados al repositorio. No se ha efectuado push ni publicación automáticamente.
6. Ejecutar manualmente el workflow de publicación y escribir `PUBLICAR`. No se activa con un push normal.

Build local: `npm run build`; vista previa: `npm run preview`, abrir `http://127.0.0.1:4173/caie-tienda/`. El build incluye únicamente frontend y logotipo. ExcelJS se carga bajo demanda; su bundle es grande pero no forma parte de la carga inicial. No hay service worker, caché persistente de datos ni compras offline. En esta primera etapa el navegador conserva la sesión del enlace privado; al recargar se mantiene el acceso. No se muestran formularios de usuarios ni contraseñas. La sección Acceso de este teléfono permite cerrarlo sin cerrar los accesos de los demás dispositivos. El modo anterior puede restaurarse con `VITE_SIMPLE_ACCESS=false`. Un intento con respuesta incierta bloquea la navegación interna hasta recuperarlo; conserva el contenido y saldo originales para su reintento.

## Respaldos, restauración y operación

Ver `docs/OPERACION.md` para checklist, respaldos PostgreSQL, restauración protegida y conciliación. En el plan gratuito, Supabase puede pausar proyectos con poca actividad en un periodo de siete días; comprobar disponibilidad con anticipación. Consultar [pausas de proyectos](https://supabase.com/docs/guides/platform/free-project-pausing) y [respaldos](https://supabase.com/docs/guides/platform/backups). Se recomienda un respaldo lógico privado antes y después del evento; el Excel por sí solo no conserva perfiles, auditoría e idempotencia.

## Diagnóstico y mantenimiento

- Acceso rechazado: comprobar cuenta Auth, perfil activo y rol. No cambiar RLS para resolver un acceso individual.
- Tabla/RPC no encontrada: comprobar que se aplicó la migración y el proyecto env es correcto.
- Inventario/saldo obsoleto: volver a seleccionar el registro, revisar el carrito y repetir con los datos actuales. Para respuesta incierta, conservar la clave original.
- Proyecto inaccesible: revisar estado/pausa en Supabase Dashboard y conexión. No operar offline.
- Evento no activo: administración debe crear y activar uno; cerrar el anterior primero.
- Error de importación: corregir una copia privada; no alterar el archivo original ni fusionar registros ambiguos.
- Consultar errores Auth, Postgres y Realtime en Supabase Dashboard sin publicar nombres, payloads ni credenciales.

Actualizar dependencias con revisión de cambios, `npm audit` y las pruebas. `uuid` está fijado por override compatible para corregir la alerta transitiva de ExcelJS; repetir las pruebas Excel ante cualquier actualización. Versionar futuros cambios SQL en migraciones nuevas; no editar una migración ya aplicada. Solicitar aprobación para cada modificación remota. No ejecutar reset remoto ni suites destructivas sobre producción.

Referencias oficiales: [funciones seguras de Supabase](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vite en GitHub Pages](https://vite.dev/guide/static-deploy.html).
