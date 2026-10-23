// Pool de conexiones a PostgreSQL compartido por el servidor.
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('DATABASE_URL no está definida: las rutas de la API que usan la base de datos fallarán.');
}

// La red privada de Railway (*.railway.internal) y localhost no usan SSL; la URL pública sí.
const sinSsl = !url || /@(localhost|127\.0\.0\.1|[^:/]+\.railway\.internal)[:/]/.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: sinSsl ? false : { rejectUnauthorized: false },
});

module.exports = pool;
