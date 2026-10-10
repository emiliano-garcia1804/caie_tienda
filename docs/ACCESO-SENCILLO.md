# Primera etapa: abrir y usar la tienda

Abrir **https://emiliano-garcia1804.github.io/caie_tienda/** en cualquiera de los cinco teléfonos. No se necesitan correo, contraseña, sesión guardada ni enlaces privados. Todos consultan y modifican la misma tienda.

1. Para añadir participantes o productos, abrir **Gestionar tienda** y pulsar **Agregar participante** o **Agregar producto**.
2. Para registrar compras, abrir **Nueva compra**, elegir grupo y participante, seleccionar artículos y confirmar.
3. Pulsar el botón de descarga del encabezado para obtener el Excel actualizado con Horas, Inventario y Movimientos.
4. Guardar la URL normal como favorito. La tienda vuelve a abrir también después de borrar los datos del navegador.

El propietario autorizó expresamente que cualquier visitante de la página pueda consultar y modificar los recursos durante esta etapa. Las operaciones públicas se registran como **Acceso público**; no identifican a una persona ni a un teléfono. Los datos se actualizan al volver a la ventana, reconectar o cada 30 segundos.

## Implementación y reversión posterior

`public.open_store` permite únicamente las operaciones existentes de la aplicación: snapshot, exportación, compras, anulaciones, participantes, productos, eventos e importación inicial. Reutiliza sus transacciones, validaciones, bloqueos, idempotencia y auditoría. La importación sigue sin poder reemplazar los registros existentes. No expone gestión de cuentas, SQL arbitrario ni escritura directa en las tablas.

Una identidad técnica sin correo, contraseña ni credenciales de inicio de sesión etiqueta los movimientos públicos. RLS y los permisos de los endpoints anteriores permanecen; las pruebas originales siguen verificándolos. El navegador usa solamente la URL y la publishable key de Supabase, nunca claves administrativas ni tokens compartidos.

Para cerrar este acceso en una etapa posterior, el responsable puede ejecutar en una conexión administrativa:

```sql
update caie_private.store_access set enabled = false where singleton;
```

La configuración privada no se puede modificar desde la página. Volver al acceso por cuentas requiere además publicar con `VITE_PUBLIC_ACCESS=false` y `VITE_SIMPLE_ACCESS=false`. Los enlaces privados preparados anteriormente ya no son necesarios en esta etapa.
