// Servidor web: sirve el frontend estático y expone la API conectada a PostgreSQL.
require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Solo se publican las carpetas y archivos del frontend (nunca .env, node_modules ni database/).
for (const carpeta of ['css', 'js', 'img']) {
  app.use(`/${carpeta}`, express.static(path.join(__dirname, carpeta)));
}

const archivosPublicos = ['index.html', 'cliente.html', 'tecnico.html', 'admin.html', 'robots.txt', 'site.webmanifest'];
for (const archivo of archivosPublicos) {
  app.get(`/${archivo}`, (req, res) => res.sendFile(path.join(__dirname, archivo)));
}
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Comprueba que el servidor y la base de datos responden.
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT count(*)::int AS usuarios FROM usuarios');
    res.json({ estado: 'ok', baseDeDatos: 'conectada', usuarios: rows[0].usuarios });
  } catch (err) {
    console.error('Error de base de datos:', err.message);
    res.status(503).json({ estado: 'error', baseDeDatos: 'sin conexión' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
