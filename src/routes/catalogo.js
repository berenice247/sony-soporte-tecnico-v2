// Catálogo público (para clientes autenticados): solo productos activos.
const express = require('express');
const db = require('../../database/db');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, nombre, categoria, modelo FROM productos WHERE activo ORDER BY categoria, nombre'
  );
  res.json({ productos: rows });
});

module.exports = router;
