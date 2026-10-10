# Acceso sencillo solicitado

CAIE utiliza un único acceso privado desde los cinco teléfonos. No es necesario proporcionar listas de correos ni gestionar cuentas/roles desde la interfaz. La cuenta ya preparada tiene los permisos para registrar compras y gestionar la tienda. El esquema conserva controles de permisos para proteger la base, pero no añade pasos al flujo cotidiano.

1. Iniciar el servidor local (`npm run dev`).
2. Abrir `C:\Users\emili\Documents\CAIE-privado\primer-acceso.txt` y utilizar el enlace temporal.
3. Seleccionar la inicial de la cuenta en la esquina superior y establecer una contraseña en Mi cuenta.
4. Compartir el correo de acceso y esa contraseña únicamente con los voluntarios autorizados, por un canal privado.
5. Iniciar sesión en cada teléfono y cerrar sesión al terminar. No se requiere crear otro administrador.

La misma cuenta puede tener cinco sesiones simultáneas: cada compra tiene su propio identificador y la base protege saldos e inventarios con bloqueos transaccionales. La auditoría queda atribuida a la cuenta CAIE compartida; no distingue qué persona estaba usando cada teléfono. Si CAIE decide necesitar esa distinción posteriormente, el procedimiento opcional de cuentas individuales sigue documentado.

GitHub Pages distribuye archivos públicos; mantener un inicio de sesión protege los nombres aunque alguien obtenga la URL. La contraseña y los datos personales no se incluyen en el sitio estático. El archivo de primer acceso es privado y contiene una credencial temporal, por lo que no debe copiarse al repositorio.
