# Sony · Soporte Técnico

Aplicación web para gestionar solicitudes de soporte técnico con tres perfiles:

| Perfil | Qué hace |
| --- | --- |
| **Cliente** | Registra su equipo con boleta y foto, sigue el avance, acepta o rechaza el presupuesto y chatea con el técnico. |
| **Técnico** | Toma órdenes, registra diagnóstico y presupuesto, finaliza reparaciones y chatea con el cliente. |
| **Administrador** | Valida o devuelve los presupuestos y da de alta técnicos. |

**Flujo de un ticket:** `registrado → en_revision → pendiente_aprobacion_admin → presupuesto_enviado → reparacion_aceptada → resuelto`
(el administrador puede devolver el presupuesto con `revisar_precio_tecnico`; el cliente puede rechazarlo o cancelar antes de que lo tome un técnico).

## Tecnologías

- **Backend:** Node.js 18+, Express 5, PostgreSQL (`pg`), `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit`
- **Frontend:** HTML + JavaScript sin frameworks, Tailwind CSS 3 (compilado, sin CDN)
- **Base de datos:** PostgreSQL en Railway

## Estructura

```
├── server.js                 Punto de entrada
├── src/
│   ├── app.js                Express: seguridad (helmet/CSP), rutas y errores
│   ├── config.js             Variables de entorno
│   ├── middleware/           Sesión/roles (auth.js) y protección CSRF (seguridad.js)
│   ├── routes/               auth.js · tickets.js · admin.js
│   ├── utils/                Validaciones (validation.js) y errores
│   └── input.css             Estilos fuente (Tailwind + componentes)
├── database/
│   ├── schema.sql            Esquema PostgreSQL + datos de prueba
│   ├── init-db.js            Carga el esquema (npm run db:init)
│   └── db.js                 Pool de conexiones y transacciones
├── public/                   Frontend que sirve Express
│   ├── index.html · cliente.html · tecnico.html · admin.html
│   ├── css/app.css           Generado con `npm run build:css` (se versiona)
│   └── js/                   common.js · auth.js · cliente.js · tecnico.js · admin.js
└── test/api.test.js          Pruebas de la API (incluye los casos de la auditoría)
```

## Ejecutar en local

```bash
npm install
cp .env.example .env        # completa DATABASE_URL y JWT_SECRET
npm run db:init -- --confirmar   # ⚠️ borra y recrea el esquema "public"
npm run dev                 # http://localhost:3000
```

Con `DEMO_MODE=true` la pantalla de acceso muestra las cuentas de prueba. Contraseñas de prueba: clientes `cliente123`, técnicos `tecnico123`, administrador `admin123`.

Si cambias clases de Tailwind en el HTML/JS, vuelve a compilar el CSS: `npm run build:css`.

## Base de datos en Railway

1. En Railway crea un proyecto y agrega **Database → PostgreSQL**.
2. Para cargar el esquema desde tu PC: copia `DATABASE_PUBLIC_URL` del servicio Postgres a tu `.env` como `DATABASE_URL` y ejecuta `npm run db:init -- --confirmar`.
3. Para desplegar la app: agrega un servicio desde este repositorio de GitHub y en **Variables** define:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (red privada de Railway) |
| `JWT_SECRET` | una cadena larga y aleatoria |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` solo mientras muestren el proyecto; luego `false` |

Railway ejecuta `npm start`. En **Settings → Networking** genera el dominio público. `GET /api/health` confirma que la base responde.

> ⚠️ `schema.sql` empieza con `DROP SCHEMA public CASCADE`: al ejecutarlo se pierden los datos existentes. Si la base de Railway ya tenía el esquema anterior, hay que volver a correr `db:init` para actualizarla.

## Pruebas

```bash
DATABASE_URL=postgresql://...  npm test   # usa una base de PRUEBAS: recrea el esquema
```

## Seguridad: cómo se resolvió la auditoría

| ID | Hallazgo | Solución |
| --- | --- | --- |
| H-01 | XSS en campos del ticket | Todo texto del usuario se escapa con `App.esc()` antes de mostrarse; además la CSP (`script-src 'self'`) bloquea scripts en línea y ya no hay `onclick` en el HTML. |
| H-02 | Rol editable desde el navegador | Sesión en cookie `httpOnly` firmada (JWT). El rol se lee de la base de datos en cada petición y cada ruta valida el rol en el servidor. |
| H-03 | Contraseñas sin cifrar y visibles | Hash `bcrypt` (coste 12) en `password_hash`; nunca se envía al navegador ni se guarda en `localStorage`. |
| H-04 | Contraseñas débiles o vacías | Mínimo 8 caracteres con letras y números, máximo 72, sin espacios vacíos (validado en servidor y con indicador en el formulario). |
| H-05 | Campos sin límite | Límites mínimos y máximos en el servidor, en `CHECK` de la base y con `minlength`/`maxlength` en los formularios. |
| H-06 | Foto pesada rompe el guardado | La foto se reduce en el navegador (≤1280 px, JPEG) y el servidor rechaza imágenes de más de 2 MB con un mensaje claro. |
| H-07 | Tickets ajenos modificables | Cada acción comprueba propiedad y estado en la consulta SQL (`WHERE id = … AND tecnico_id = …`). Un ticket solo lo toma un técnico y el cliente solo cancela antes de que lo tomen. |
| H-08 | Presupuesto negativo / garantía indebida | Costo validado (≥ 0) en servidor y base de datos; no se permite "aplica garantía" si la garantía está vencida. |
| H-09 | Fecha de compra futura | La fecha no puede ser posterior a hoy; la garantía vencida se calcula en el servidor. Formato de boleta y serie validados. |
| H-10 | Caída por datos dañados / escrituras pisadas | Ya no hay `localStorage`: los datos viven en PostgreSQL con transacciones, y los errores de red o del servidor se muestran con avisos. |

Medidas adicionales: límite de 10 intentos de acceso por IP cada 15 min, cabeceras de seguridad con `helmet`, comprobación de origen contra CSRF (cookie `SameSite=Strict` + JSON obligatorio), historial de estados con el usuario que hizo cada cambio y cuentas de prueba ocultas salvo `DEMO_MODE=true`.

## Pendientes sugeridos

- Recuperación de contraseña por correo.
- Mostrar en la interfaz las notificaciones que ya se guardan en la tabla `notificaciones`.
- Guardar las fotos en un almacenamiento de archivos (por ejemplo S3) en lugar de la base de datos.

## Licencia

Consulta `LICENSE.txt`.
