// Protección básica contra CSRF: las peticiones que modifican datos deben venir del mismo sitio
// y como JSON (un formulario de otra web no puede enviar ese Content-Type).
const { prohibido, badRequest } = require('../utils/errors');

function mismoOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origen = req.get('origin');
  if (origen) {
    let host;
    try { host = new URL(origen).host; } catch { throw prohibido('Origen no permitido.'); }
    if (host !== req.get('host')) throw prohibido('Origen no permitido.');
  }
  if (!req.is('application/json')) {
    throw badRequest('El contenido debe enviarse como JSON.');
  }
  next();
}

module.exports = { mismoOrigen };
