// Crea el esquema y los datos de prueba en la base de datos indicada por DATABASE_URL.
// ATENCIÓN: el script SQL borra todo el esquema "public" antes de recrearlo.
// Uso: npm run db:init -- --confirmar
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL. Cópiala de Railway (variable DATABASE_PUBLIC_URL) en el archivo .env');
    process.exit(1);
  }

  if (!process.argv.includes('--confirmar')) {
    console.error('Este script BORRA todo el esquema "public". Ejecútalo con: npm run db:init -- --confirmar');
    process.exit(1);
  }

  const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: esLocal ? false : { rejectUnauthorized: false },
  });

  const sql = fs.readFileSync(path.join(__dirname, 'sony_soporte_corregido.sql'), 'utf8');

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const { rows } = await client.query(`
    SELECT 'usuarios' AS tabla, count(*)::int AS filas FROM usuarios
    UNION ALL SELECT 'productos', count(*)::int FROM productos
    UNION ALL SELECT 'tickets', count(*)::int FROM tickets
    UNION ALL SELECT 'evidencias', count(*)::int FROM evidencias
    UNION ALL SELECT 'diagnosticos', count(*)::int FROM diagnosticos
    UNION ALL SELECT 'historial_estados', count(*)::int FROM historial_estados
    UNION ALL SELECT 'notificaciones', count(*)::int FROM notificaciones
  `);
  console.table(rows);
  console.log('Base de datos inicializada correctamente.');
  await client.end();
}

main().catch((err) => {
  console.error('Error al inicializar la base de datos:', err.message);
  process.exit(1);
});
