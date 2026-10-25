// Pool de conexiones a PostgreSQL compartido por toda la API.
const { Pool, types } = require('pg');

// Los BIGINT (ids, conteos) llegan como número y no como texto.
types.setTypeParser(20, (v) => Number(v));

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('DATABASE_URL no está definida: las rutas que usan la base de datos fallarán.');
}

// localhost y la red privada de Railway (*.railway.internal) no usan SSL; la URL pública sí.
const sinSsl = !url || /@(localhost|127\.0\.0\.1|[^:/]+\.railway\.internal)[:/]/.test(url) || /[?&]host=\//.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: sinSsl ? false : { rejectUnauthorized: false },
});

const query = (texto, params) => pool.query(texto, params);

// Ejecuta `fn(client)` dentro de una transacción. Si se indica `usuarioId`, los
// triggers de la base lo usan para registrar quién cambió el estado de un ticket.
async function tx(usuarioId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (usuarioId) await client.query("SELECT set_config('app.usuario_id', $1, true)", [String(usuarioId)]);
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
