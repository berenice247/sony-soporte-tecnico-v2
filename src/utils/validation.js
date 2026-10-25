// Validaciones del lado del servidor (la validación del navegador es solo ayuda visual).
const { badRequest } = require('./errors');

const CATEGORIAS = ['Consolas / Gaming', 'Televisores', 'Audio', 'Fotografía'];
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024; // 2 MB ya comprimida

const reNombre = /^[\p{L}][\p{L}\s'.-]*$/u;
const reCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reSerie = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;
const reBoleta = /^[A-Za-z0-9]{1,6}-\d{1,10}$/;
const reImagen = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function texto(valor, campo, min, max) {
  if (typeof valor !== 'string') throw badRequest(`${campo} es obligatorio.`);
  const limpio = valor.trim().replace(/\s+/g, ' ');
  if (limpio.length < min) throw badRequest(`${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw badRequest(`${campo} no puede superar los ${max} caracteres.`);
  return limpio;
}

// Igual que texto() pero conserva los saltos de línea (descripciones, diagnósticos).
function parrafo(valor, campo, min, max) {
  if (typeof valor !== 'string') throw badRequest(`${campo} es obligatorio.`);
  const limpio = valor.replace(/\r\n/g, '\n').trim();
  if (limpio.length < min) throw badRequest(`${campo} debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw badRequest(`${campo} no puede superar los ${max} caracteres.`);
  return limpio;
}

function nombre(valor, campo) {
  const limpio = texto(valor, campo, 2, 80);
  if (!reNombre.test(limpio)) throw badRequest(`${campo} solo puede contener letras, espacios, guiones y apóstrofes.`);
  return limpio;
}

function correo(valor) {
  const limpio = texto(valor, 'El correo', 5, 150).toLowerCase();
  if (!reCorreo.test(limpio)) throw badRequest('Ingresa un correo válido.');
  return limpio;
}

function password(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') throw badRequest('La contraseña es obligatoria.');
  if (valor.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres.');
  if (Buffer.byteLength(valor) > 72) throw badRequest('La contraseña no puede superar los 72 caracteres.');
  if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) throw badRequest('La contraseña debe combinar letras y números.');
  return valor;
}

function categoria(valor) {
  if (!CATEGORIAS.includes(valor)) throw badRequest('Selecciona una categoría válida.');
  return valor;
}

function serie(valor) {
  const limpio = texto(valor, 'El número de serie', 4, 50);
  if (!reSerie.test(limpio)) throw badRequest('El número de serie solo admite letras, números, guiones y barras.');
  return limpio.toUpperCase();
}

function boleta(valor) {
  const limpio = texto(valor, 'La boleta', 3, 20).toUpperCase();
  if (!reBoleta.test(limpio)) throw badRequest('La boleta debe tener el formato B001-1234.');
  return limpio;
}

function fechaCompra(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw badRequest('Ingresa una fecha de compra válida.');
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) throw badRequest('Ingresa una fecha de compra válida.');
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  if (fecha > hoy) throw badRequest('La fecha de compra no puede ser posterior a hoy.');
  if (hoy.getUTCFullYear() - fecha.getUTCFullYear() > 15) throw badRequest('La fecha de compra es demasiado antigua.');
  return valor;
}

// Días completos transcurridos desde la compra (para decidir si la garantía venció).
function diasDesde(valor) {
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  return Math.floor((hoy - new Date(`${valor}T00:00:00Z`)) / 86400000);
}

function costo(valor) {
  const numero = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  if (typeof numero !== 'number' || !Number.isFinite(numero)) throw badRequest('El costo debe ser un número.');
  if (numero < 0) throw badRequest('El costo no puede ser negativo.');
  if (numero > 99999.99) throw badRequest('El costo es demasiado alto.');
  return Math.round(numero * 100) / 100;
}

// Valida una imagen enviada como data URL y devuelve su tipo y tamaño.
function imagen(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw badRequest('La imagen no es válida.');
  const m = reImagen.exec(valor);
  if (!m) throw badRequest('La imagen debe ser JPG, PNG o WEBP.');
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_IMAGEN_BYTES) throw badRequest('La imagen pesa demasiado (máximo 2 MB).');
  return valor;
}

function id(valor) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('Identificador no válido.');
  return n;
}

function booleano(valor, campo) {
  if (typeof valor !== 'boolean') throw badRequest(`${campo} no es válido.`);
  return valor;
}

module.exports = {
  CATEGORIAS, texto, parrafo, nombre, correo, password, categoria, serie, boleta,
  fechaCompra, diasDesde, costo, imagen, id, booleano,
};
