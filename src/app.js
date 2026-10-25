// Configuración de Express: seguridad, API y archivos estáticos.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('../database/db');
const config = require('./config');
const { ApiError } = require('./utils/errors');
const { mismoOrigen } = require('./middleware/seguridad');

const app = express();
app.set('trust proxy', 1); // Railway termina el HTTPS en su proxy
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
}));

// Las fotos llegan como base64 (máx. 2 MB reales ≈ 2.8 MB de texto).
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ estado: 'ok', baseDeDatos: 'conectada' });
  } catch (err) {
    console.error('Error de base de datos:', err.message);
    res.status(503).json({ estado: 'error', baseDeDatos: 'sin conexión' });
  }
});

app.use('/api', mismoOrigen);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/catalogo', require('./routes/catalogo'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api', (req, res, next) => next(new ApiError(404, 'Ruta no encontrada.')));

// Frontend estático. Las respuestas no deben quedar en caché para ver siempre los cambios.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], index: 'index.html' }));

// Manejo central de errores: nunca se filtran detalles internos al navegador.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El JSON enviado no es válido.' });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
});

module.exports = app;
