// Configuración central leída de variables de entorno.
const crypto = require('crypto');

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('JWT_SECRET no está definida: se generó una temporal (las sesiones se cierran al reiniciar). Defínela en Railway > Variables.');
}

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret,
  sesionHoras: 8,
  maxIntentosLogin: Number(process.env.LOGIN_MAX_INTENTOS) || 10, // por IP cada 15 min
  cookieSesion: 'sony_sesion',
  demo: process.env.DEMO_MODE === 'true',
  produccion: process.env.NODE_ENV === 'production',
};
