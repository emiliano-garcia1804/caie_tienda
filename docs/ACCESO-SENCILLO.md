# Primera etapa: acceso directo en cinco teléfonos

La tienda compartida abre sin introducir correo ni contraseña. Cada teléfono utiliza un enlace privado una vez y conserva su acceso en ese navegador. Los cinco teléfonos consultan los mismos registros de Supabase; las compras, los saldos y el inventario mantienen sus transacciones y controles de concurrencia.

1. Abrir `C:\Users\emili\Documents\CAIE-privado\accesos-telefonos\abrir-tienda.html` en un navegador.
2. Utilizar un enlace distinto para cada teléfono. Los archivos `telefono-1.txt` a `telefono-5.txt` contienen los enlaces para compartir por un canal privado con las personas autorizadas.
3. Después del primer acceso, guardar la página normal como favorito: `https://emiliano-garcia1804.github.io/caie_tienda/`.
4. Para añadir participantes o productos, abrir **Gestionar tienda** y pulsar **Agregar participante** o **Agregar producto**. Para registrar compras, abrir **Nueva compra**.
5. Pulsar **Excel** en el encabezado para descargar los registros actualizados. La descarga incluye Horas, Inventario y Movimientos de una misma lectura de la base.

No es necesario iniciar un servidor local, elegir contraseñas ni gestionar usuarios desde la interfaz. Si se borran los datos del navegador, se usa navegación privada o se cierra el acceso, será necesario abrir un enlace nuevo para ese teléfono. **Gestionar tienda → Acceso de este teléfono** permite cerrarlo sin desconectar los demás teléfonos.

El responsable puede preparar enlaces nuevos mediante:

```powershell
npm run access:devices -- CORREO_ADMINISTRADOR_EXISTENTE 5
```

Este comando usa la CLI previamente autorizada, comprueba que el administrador existe y está activo, y crea sesiones independientes de la misma cuenta. No crea usuarios, cambia contraseñas, modifica perfiles ni añade registros de aplicación. Verifica el acceso de las sesiones con lecturas de `app_snapshot`; guarda los enlaces fuera del repositorio y no imprime tokens. Para preparar un solo acceso, usar `1` como último argumento.

Supabase Auth y las políticas RLS permanecen como mecanismo interno de protección. La URL pública, por sí sola, no da acceso a los registros. Los enlaces privados son credenciales y no deben subirse a GitHub, colocarse en `public/` ni incluirse en el build. La auditoría sigue atribuida a la cuenta compartida y no identifica a la persona física que utiliza cada teléfono.

El modo de correo y contraseña queda disponible para una etapa posterior mediante `VITE_SIMPLE_ACCESS=false`; el valor predeterminado de esta etapa es acceso directo. La aplicación consume las credenciales del fragmento privado antes de iniciar HashRouter y las retira de la dirección y del historial.
