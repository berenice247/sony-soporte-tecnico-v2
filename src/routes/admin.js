const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const v = require('../utils/validation');
const { conflicto, noEncontrado } = require('../utils/errors');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { obtenerTicket } = require('./tickets');

const router = express.Router();
router.use(requiereSesion, requiereRol('administrador'));

// Aprueba el presupuesto del técnico y lo envía al cliente.
router.post('/tickets/:id/aprobar', async (req, res) => {
  const id = v.id(req.params.id);
  await db.tx(req.usuario.id, async (cx) => {
    const { rowCount } = await cx.query(
      "UPDATE tickets SET estado = 'presupuesto_enviado', comentario_admin = NULL WHERE id = $1 AND estado = 'pendiente_aprobacion_admin'",
      [id]
    );
    if (!rowCount) throw conflicto('Este ticket no está pendiente de aprobación.');
    await cx.query('UPDATE diagnosticos SET costo_oficial = costo_estimado WHERE ticket_id = $1', [id]);
  });
  res.json({ ticket: await obtenerTicket(id) });
});

// Devuelve el presupuesto al técnico con una observación.
router.post('/tickets/:id/observar', async (req, res) => {
  const id = v.id(req.params.id);
  const comentario = v.parrafo(req.body.comentario, 'La observación', 5, 500);
  const { rowCount } = await db.tx(req.usuario.id, (cx) => cx.query(
    "UPDATE tickets SET estado = 'revisar_precio_tecnico', comentario_admin = $2 WHERE id = $1 AND estado = 'pendiente_aprobacion_admin'",
    [id, comentario]
  ));
  if (!rowCount) throw conflicto('Este ticket no está pendiente de aprobación.');
  res.json({ ticket: await obtenerTicket(id) });
});

router.get('/tecnicos', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.nombres, u.apellidos, u.correo,
            (SELECT count(*)::int FROM tickets t WHERE t.tecnico_id = u.id
               AND t.estado NOT IN ('resuelto', 'cancelado', 'reparacion_rechazada')) AS "ticketsActivos"
     FROM usuarios u WHERE u.rol = 'tecnico' AND u.activo ORDER BY u.apellidos, u.nombres`
  );
  res.json({ tecnicos: rows });
});

router.post('/tecnicos', async (req, res) => {
  const nombres = v.nombre(req.body.nombres, 'Los nombres');
  const apellidos = v.nombre(req.body.apellidos, 'Los apellidos');
  const correo = v.correo(req.body.correo);
  const hash = await bcrypt.hash(v.password(req.body.password), 12);
  try {
    const { rows } = await db.query(
      `INSERT INTO usuarios (rol, nombres, apellidos, correo, password_hash)
       VALUES ('tecnico', $1, $2, $3, $4) RETURNING id, nombres, apellidos, correo`,
      [nombres, apellidos, correo, hash]
    );
    res.status(201).json({ tecnico: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw conflicto('Este correo ya está registrado.');
    throw err;
  }
});

// ---------------------------------------------------------------- asignar ticket a un técnico (RF-05)
router.post('/tickets/:id/asignar', async (req, res) => {
  const id = v.id(req.params.id);
  const tecnicoId = v.id(req.body.tecnicoId);
  await db.tx(req.usuario.id, async (cx) => {
    const { rows } = await cx.query("SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'tecnico' AND activo", [tecnicoId]);
    if (!rows[0]) throw conflicto('Ese técnico no está disponible.');
    const { rowCount } = await cx.query(
      `UPDATE tickets SET estado = 'en_revision', tecnico_id = $2
       WHERE id = $1 AND estado = 'registrado' AND tecnico_id IS NULL AND cliente_acepto_revision_pago`,
      [id, tecnicoId]
    );
    if (!rowCount) throw conflicto('Este ticket ya no está disponible para asignar.');
  });
  res.json({ ticket: await obtenerTicket(id) });
});

// ---------------------------------------------------------------- catálogo de productos (RF-07)
function datosProducto(b) {
  return {
    nombre: v.texto(b.nombre, 'El nombre', 2, 150),
    categoria: v.categoria(b.categoria),
    modelo: b.modelo ? v.texto(b.modelo, 'El modelo', 2, 80) : null,
    descripcion: b.descripcion ? v.parrafo(b.descripcion, 'La descripción', 2, 500) : null,
  };
}
const COLUMNAS_PRODUCTO = 'id, nombre, categoria, modelo, descripcion, activo';

router.get('/productos', async (req, res) => {
  const { rows } = await db.query(`SELECT ${COLUMNAS_PRODUCTO} FROM productos ORDER BY categoria, nombre`);
  res.json({ productos: rows });
});

router.post('/productos', async (req, res) => {
  const d = datosProducto(req.body);
  const { rows } = await db.query(
    `INSERT INTO productos (nombre, categoria, modelo, descripcion) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNAS_PRODUCTO}`,
    [d.nombre, d.categoria, d.modelo, d.descripcion]
  );
  res.status(201).json({ producto: rows[0] });
});

router.put('/productos/:id', async (req, res) => {
  const d = datosProducto(req.body);
  const { rows } = await db.query(
    `UPDATE productos SET nombre = $2, categoria = $3, modelo = $4, descripcion = $5 WHERE id = $1 RETURNING ${COLUMNAS_PRODUCTO}`,
    [v.id(req.params.id), d.nombre, d.categoria, d.modelo, d.descripcion]
  );
  if (!rows[0]) throw noEncontrado('El producto no existe.');
  res.json({ producto: rows[0] });
});

// Baja lógica: el producto deja de aparecer para los clientes pero se conserva el historial.
router.post('/productos/:id/estado', async (req, res) => {
  const activo = v.booleano(req.body.activo, 'El estado');
  const { rows } = await db.query(
    `UPDATE productos SET activo = $2 WHERE id = $1 RETURNING ${COLUMNAS_PRODUCTO}`,
    [v.id(req.params.id), activo]
  );
  if (!rows[0]) throw noEncontrado('El producto no existe.');
  res.json({ producto: rows[0] });
});

// ---------------------------------------------------------------- usuarios del sistema (CUS09)
router.get('/usuarios', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, rol::text AS rol, nombres, apellidos, correo, activo,
            to_char(fecha_registro AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "fechaRegistro"
     FROM usuarios ORDER BY rol, apellidos, nombres`
  );
  res.json({ usuarios: rows });
});

router.post('/usuarios/:id/estado', async (req, res) => {
  const id = v.id(req.params.id);
  const activo = v.booleano(req.body.activo, 'El estado');
  if (id === req.usuario.id) throw conflicto('No puedes desactivar tu propia cuenta.');
  const { rows } = await db.query('UPDATE usuarios SET activo = $2 WHERE id = $1 RETURNING id, activo', [id, activo]);
  if (!rows[0]) throw noEncontrado('El usuario no existe.');
  res.json({ usuario: rows[0] });
});

module.exports = router;

