// Bandeja de notificaciones del usuario (las genera el trigger de la base al cambiar el estado de un ticket).
const express = require('express');
const db = require('../../database/db');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, ticket_id AS "ticketId", mensaje, leido, fecha_envio AS fecha
     FROM notificaciones WHERE usuario_id = $1
     ORDER BY fecha_envio DESC, id DESC LIMIT 30`,
    [req.usuario.id]
  );
  const { rows: [{ n }] } = await db.query(
    'SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND NOT leido',
    [req.usuario.id]
  );
  res.json({ notificaciones: rows, sinLeer: n });
});

router.post('/leer', async (req, res) => {
  await db.query('UPDATE notificaciones SET leido = TRUE WHERE usuario_id = $1 AND NOT leido', [req.usuario.id]);
  res.json({ ok: true });
});

module.exports = router;
