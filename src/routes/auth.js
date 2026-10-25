const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const v = require('../utils/validation');
const config = require('../config');
const { badRequest, conflicto, ApiError } = require('../utils/errors');
const { emitirSesion, cerrarSesion, requiereSesion } = require('../middleware/auth');

const router = express.Router();

// Máximo 10 intentos por IP cada 15 minutos para frenar adivinanzas de contraseñas.
const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.maxIntentosLogin,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new ApiError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')),
});

// Hash falso para que el tiempo de respuesta no revele si el correo existe.
const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente-1', 12);

const publico = (u) => ({ id: u.id, nombres: u.nombres, apellidos: u.apellidos, correo: u.correo, rol: u.rol });

router.post('/login', limitador, async (req, res) => {
  const correo = v.correo(req.body.correo);
  if (typeof req.body.password !== 'string' || !req.body.password) throw badRequest('Ingresa tu contraseña.');

  const { rows } = await db.query(
    'SELECT id, rol, nombres, apellidos, correo, password_hash FROM usuarios WHERE correo = $1 AND activo',
    [correo]
  );
  const usuario = rows[0];
  const valido = await bcrypt.compare(req.body.password, usuario ? usuario.password_hash : HASH_FALSO);
  if (!usuario || !valido) throw new ApiError(401, 'Correo o contraseña incorrectos.');

  emitirSesion(req, res, usuario.id);
  res.json({ usuario: publico(usuario) });
});

router.post('/registro', limitador, async (req, res) => {
  const nombres = v.nombre(req.body.nombres, 'Los nombres');
  const apellidos = v.nombre(req.body.apellidos, 'Los apellidos');
  const correo = v.correo(req.body.correo);
  const password = v.password(req.body.password);

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await db.query(
      `INSERT INTO usuarios (rol, nombres, apellidos, correo, password_hash)
       VALUES ('cliente', $1, $2, $3, $4)
       RETURNING id, rol, nombres, apellidos, correo`,
      [nombres, apellidos, correo, hash]
    );
    emitirSesion(req, res, rows[0].id);
    res.status(201).json({ usuario: publico(rows[0]) });
  } catch (err) {
    if (err.code === '23505') throw conflicto('Este correo ya está registrado.');
    throw err;
  }
});

router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

router.get('/me', requiereSesion, (req, res) => {
  res.json({ usuario: publico(req.usuario) });
});

// Consulta suave para la pantalla de acceso: responde 200 con o sin sesión.
router.get('/sesion', async (req, res) => {
  try {
    await requiereSesion(req, res, () => {});
  } catch {
    return res.json({ usuario: null });
  }
  res.json({ usuario: publico(req.usuario) });
});

// Cuentas de prueba: solo se muestran si DEMO_MODE=true (nunca en producción real).
router.get('/demo', (req, res) => {
  if (!config.demo) return res.json({ cuentas: [] });
  res.json({
    cuentas: [
      { rol: 'Cliente', correo: 'lucia.ramos@mail.com', password: 'cliente123' },
      { rol: 'Técnico', correo: 'marco.delgado@sony.com', password: 'tecnico123' },
      { rol: 'Admin', correo: 'paula.nunez@sony.com', password: 'admin123' },
    ],
  });
});

module.exports = router;
