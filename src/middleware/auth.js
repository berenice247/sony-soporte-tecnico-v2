// Sesión basada en un JWT guardado en una cookie httpOnly (el navegador no puede leerla con JS).
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../../database/db');
const { noAutorizado, prohibido } = require('../utils/errors');

function emitirSesion(req, res, usuarioId) {
  const token = jwt.sign({ sub: String(usuarioId) }, config.jwtSecret, { expiresIn: `${config.sesionHoras}h` });
  res.cookie(config.cookieSesion, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: config.sesionHoras * 3600 * 1000,
  });
}

function cerrarSesion(res) {
  res.clearCookie(config.cookieSesion, { httpOnly: true, sameSite: 'strict' });
}

// Exige sesión válida. El rol se lee SIEMPRE de la base de datos, nunca del navegador.
async function requiereSesion(req, res, next) {
  const token = req.cookies[config.cookieSesion];
  if (!token) throw noAutorizado();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    cerrarSesion(res);
    throw noAutorizado('Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  const { rows } = await db.query(
    'SELECT id, rol, nombres, apellidos, correo FROM usuarios WHERE id = $1 AND activo',
    [payload.sub]
  );
  if (!rows[0]) {
    cerrarSesion(res);
    throw noAutorizado();
  }
  req.usuario = rows[0];
  next();
}

const requiereRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario.rol)) throw prohibido();
  next();
};

module.exports = { emitirSesion, cerrarSesion, requiereSesion, requiereRol };
