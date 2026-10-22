# Sony Soporte Técnico

Aplicación web de demostración para gestionar solicitudes de soporte técnico, con vistas para clientes, técnicos y administración.

## Tecnologías

- HTML5
- CSS
- JavaScript
- `localStorage` para datos de demostración
- Tailwind CSS mediante CDN

## Cómo ejecutar

1. Descarga o clona este repositorio.
2. Abre `index.html` en un navegador.
3. Para una experiencia local más consistente, puedes iniciar un servidor estático desde esta carpeta, por ejemplo con la extensión Live Server de Visual Studio Code.

## Cuentas de demostración

El proyecto inicializa datos ficticios en el navegador. Las credenciales de prueba están visibles en la pantalla de inicio de sesión y en `js/mockData.js`. No uses estas cuentas ni datos reales en producción.

## Limitaciones de seguridad

**Este proyecto es solo un prototipo académico/de demostración.** La autenticación y los datos se gestionan en el navegador con `localStorage`; las contraseñas se almacenan sin protección criptográfica y un usuario puede modificar los datos desde las herramientas del navegador. No hay backend ni control de acceso real. No introduzcas información personal, contraseñas reales ni datos de clientes.

Antes de usarlo en producción, implementa un backend, base de datos, contraseñas con hash seguro, sesiones/autorización del lado del servidor, validación y controles de seguridad.

## Archivos principales

- `index.html`: acceso y registro
- `cliente.html`: panel del cliente
- `tecnico.html`: panel del técnico
- `admin.html`: panel de administración
- `css/style.css`: estilos
- `js/`: lógica de autenticación, datos de prueba y paneles
- `database/sony_soporte_corregido.sql`: esquema PostgreSQL con datos de prueba

## Base de datos

El script `database/sony_soporte_corregido.sql` crea el esquema PostgreSQL (usuarios, productos, tickets, evidencias, diagnósticos, historial de estados y notificaciones), sus triggers y datos de prueba ficticios.

**Atención:** el script empieza con `DROP SCHEMA IF EXISTS public CASCADE;`, por lo que borra todo lo que haya en el esquema `public`. Ejecútalo solo sobre una base de datos vacía o de pruebas:

```bash
createdb sony_soporte
psql -d sony_soporte -f database/sony_soporte_corregido.sql
```

## Licencia

Consulta `LICENSE.txt`. Verifica que la licencia sea adecuada para todos los componentes y contenidos que decidas distribuir.
