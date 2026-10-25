const express = require('express');
const db = require('../../database/db');
const v = require('../utils/validation');
const { badRequest, prohibido, noEncontrado, conflicto } = require('../utils/errors');
const { requiereSesion, requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

// Estados en los que el cliente puede ver el diagnóstico y los costos.
const ESTADOS_VISIBLES_CLIENTE = ['presupuesto_enviado', 'reparacion_aceptada', 'reparacion_rechazada', 'resuelto'];

const SELECT_TICKET = `
  SELECT t.id, t.codigo, t.producto, t.categoria,
         t.numero_serie  AS "numeroSerie",
         t.numero_boleta AS "numeroBoleta",
         t.fecha_compra::text AS "fechaCompra",
         t.descripcion_falla AS "descripcionFalla",
         t.estado::text AS estado,
         t.gravedad::text AS gravedad,
         t.garantia_vencida AS "garantiaVencida",
         t.cliente_acepto_revision_pago AS "clienteAceptoRevisionPago",
         t.comentario_admin AS "comentarioAdmin",
         t.cliente_id AS "clienteId",
         t.tecnico_id AS "tecnicoId",
         to_char(t.fecha_creacion AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "fechaCreacion",
         EXISTS (SELECT 1 FROM evidencias e WHERE e.ticket_id = t.id AND e.tipo = 'foto') AS "tieneEvidencia",
         d.hallazgos AS diagnostico,
         d.aplica_garantia AS "aplicaGarantia",
         d.costo_estimado::float8 AS "costoPropuesto",
         d.costo_oficial::float8  AS "costoOficial",
         d.solucion_aplicada AS solucion,
         d.cliente_acepto AS "clienteAceptoPresupuesto",
         c.nombres || ' ' || c.apellidos AS "clienteNombre",
         tc.nombres || ' ' || tc.apellidos AS "tecnicoNombre",
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', m.id, 'texto', m.texto, 'fecha', m.fecha,
                    'remitente', CASE WHEN m.usuario_id = t.cliente_id THEN 'CLIENTE' ELSE 'TECNICO' END,
                    'nombre', u.nombres || ' ' || u.apellidos) ORDER BY m.fecha, m.id)
           FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
           WHERE m.ticket_id = t.id), '[]'::json) AS mensajes,
         COALESCE((
           SELECT json_agg(json_build_object('estado', h.estado_nuevo::text, 'fecha', h.fecha_cambio) ORDER BY h.fecha_cambio, h.id)
           FROM historial_estados h WHERE h.ticket_id = t.id), '[]'::json) AS historial
  FROM tickets t
  JOIN usuarios c ON c.id = t.cliente_id
  LEFT JOIN usuarios tc ON tc.id = t.tecnico_id
  LEFT JOIN diagnosticos d ON d.ticket_id = t.id`;

// Quita al cliente la información interna que todavía no le corresponde.
function adaptarParaRol(ticket, rol) {
  if (rol !== 'cliente') return ticket;
  const t = { ...ticket, comentarioAdmin: null };
  if (!ESTADOS_VISIBLES_CLIENTE.includes(t.estado)) {
    t.diagnostico = null; t.costoPropuesto = null; t.costoOficial = null; t.aplicaGarantia = null;
  }
  if (t.estado !== 'resuelto') t.solucion = null;
  return t;
}

async function obtenerTicket(id, cliente = db) {
  const { rows } = await cliente.query(`${SELECT_TICKET} WHERE t.id = $1`, [id]);
  return rows[0];
}

// Carga el ticket y comprueba que el usuario tenga relación con él.
// Con { lectura: true } el técnico también puede ver los tickets disponibles (solo consulta).
async function ticketAccesible(req, { lectura = false } = {}) {
  const ticket = await obtenerTicket(v.id(req.params.id));
  if (!ticket) throw noEncontrado('El ticket no existe.');
  const { id, rol } = req.usuario;
  const esDuenio = rol === 'cliente' && ticket.clienteId === id;
  const disponible = lectura && !ticket.tecnicoId && ticket.estado === 'registrado' && ticket.clienteAceptoRevisionPago;
  const esTecnico = rol === 'tecnico' && (ticket.tecnicoId === id || disponible);
  if (rol !== 'administrador' && !esDuenio && !esTecnico) throw noEncontrado('El ticket no existe.');
  return ticket;
}

// ---------------------------------------------------------------- listado
router.get('/', async (req, res) => {
  const { id, rol } = req.usuario;
  let filtro = '';
  const params = [];
  if (rol === 'cliente') {
    filtro = 'WHERE t.cliente_id = $1';
    params.push(id);
  } else if (rol === 'tecnico') {
    // Sus tickets + los nuevos que ya pueden tomarse (garantía vigente o costo de revisión aceptado).
    filtro = `WHERE t.tecnico_id = $1
              OR (t.estado = 'registrado' AND t.tecnico_id IS NULL AND t.cliente_acepto_revision_pago)`;
    params.push(id);
  }
  const { rows } = await db.query(`${SELECT_TICKET} ${filtro} ORDER BY t.fecha_creacion DESC, t.id DESC`, params);
  res.json({ tickets: rows.map((t) => adaptarParaRol(t, rol)) });
});

// ---------------------------------------------------------------- crear (cliente)
router.post('/', requiereRol('cliente'), async (req, res) => {
  const b = req.body;

  // El producto viene del catálogo (productoId) o, si no aparece en la lista, se escribe a mano.
  let producto, categoria, productoId = null;
  if (b.productoId !== undefined && b.productoId !== null && b.productoId !== '') {
    const { rows } = await db.query('SELECT id, nombre, categoria FROM productos WHERE id = $1 AND activo', [v.id(b.productoId)]);
    if (!rows[0]) throw badRequest('El producto seleccionado no está disponible.');
    ({ id: productoId, nombre: producto, categoria } = rows[0]);
  } else {
    producto = v.texto(b.producto, 'El producto', 2, 150);
    categoria = v.categoria(b.categoria);
  }

  const datos = {
    producto,
    categoria,
    serie: v.serie(b.numeroSerie),
    boleta: v.boleta(b.numeroBoleta),
    fecha: v.fechaCompra(b.fechaCompra),
    descripcion: v.parrafo(b.descripcionFalla, 'La descripción de la falla', 10, 2000),
    foto: v.imagen(b.evidencia),
  };
  const vencida = v.diasDesde(datos.fecha) > 365;

  const ticketId = await db.tx(req.usuario.id, async (cx) => {
    const { rows } = await cx.query(
      `INSERT INTO tickets (codigo, cliente_id, producto, categoria, numero_serie, numero_boleta, fecha_compra,
                            descripcion_falla, gravedad, garantia_vencida, cliente_acepto_revision_pago, producto_id)
       VALUES ('TCK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('tickets_codigo_seq')::text, 4, '0'),
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [req.usuario.id, datos.producto, datos.categoria, datos.serie, datos.boleta, datos.fecha,
        datos.descripcion, vencida ? 'media' : 'baja', vencida, !vencida, productoId]
    );
    if (datos.foto) {
      await cx.query("INSERT INTO evidencias (ticket_id, tipo, url_archivo) VALUES ($1, 'foto', $2)", [rows[0].id, datos.foto]);
    }
    return rows[0].id;
  });

  res.status(201).json({ ticket: adaptarParaRol(await obtenerTicket(ticketId), 'cliente') });
});

// ---------------------------------------------------------------- foto del daño
router.get('/:id/evidencia', async (req, res) => {
  const ticket = await ticketAccesible(req, { lectura: true });
  const { rows } = await db.query(
    "SELECT url_archivo FROM evidencias WHERE ticket_id = $1 AND tipo = 'foto' ORDER BY id DESC LIMIT 1",
    [ticket.id]
  );
  const m = rows[0] && /^data:(image\/[a-z]+);base64,(.+)$/.exec(rows[0].url_archivo);
  if (!m) throw noEncontrado('Este ticket no tiene foto.');
  res.set({ 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(m[2], 'base64'));
});

// ---------------------------------------------------------------- acciones del cliente
// Responde al aviso de "garantía vencida": acepta pagar la revisión o cancela la solicitud.
router.post('/:id/garantia', requiereRol('cliente'), async (req, res) => {
  const acepta = v.booleano(req.body.acepta, 'La respuesta');
  const ticket = await ticketAccesible(req);

  const { rowCount } = await db.tx(req.usuario.id, (cx) => cx.query(
    `UPDATE tickets SET cliente_acepto_revision_pago = $2,
                        estado = CASE WHEN $2 THEN estado ELSE 'cancelado'::estado_ticket END
     WHERE id = $1 AND estado = 'registrado' AND garantia_vencida AND NOT cliente_acepto_revision_pago`,
    [ticket.id, acepta]
  ));
  if (!rowCount) throw conflicto('Esta solicitud ya no admite esa respuesta.');
  res.json({ ticket: adaptarParaRol(await obtenerTicket(ticket.id), 'cliente') });
});

// Cancelar: solo mientras ningún técnico la haya tomado.
router.post('/:id/cancelar', requiereRol('cliente'), async (req, res) => {
  const ticket = await ticketAccesible(req);
  const { rowCount } = await db.tx(req.usuario.id, (cx) => cx.query(
    "UPDATE tickets SET estado = 'cancelado' WHERE id = $1 AND estado = 'registrado' AND tecnico_id IS NULL",
    [ticket.id]
  ));
  if (!rowCount) throw conflicto('Solo puedes cancelar solicitudes que aún no fueron tomadas por un técnico.');
  res.json({ ticket: adaptarParaRol(await obtenerTicket(ticket.id), 'cliente') });
});

router.post('/:id/respuesta-presupuesto', requiereRol('cliente'), async (req, res) => {
  const acepta = v.booleano(req.body.acepta, 'La respuesta');
  const ticket = await ticketAccesible(req);

  await db.tx(req.usuario.id, async (cx) => {
    const { rowCount } = await cx.query(
      `UPDATE tickets SET estado = $2::estado_ticket
       WHERE id = $1 AND estado = 'presupuesto_enviado'`,
      [ticket.id, acepta ? 'reparacion_aceptada' : 'reparacion_rechazada']
    );
    if (!rowCount) throw conflicto('Este presupuesto ya no está pendiente de respuesta.');
    await cx.query('UPDATE diagnosticos SET cliente_acepto = $2 WHERE ticket_id = $1', [ticket.id, acepta]);
  });
  res.json({ ticket: adaptarParaRol(await obtenerTicket(ticket.id), 'cliente') });
});

// ---------------------------------------------------------------- acciones del técnico
// Tomar una orden: el UPDATE condicional evita que dos técnicos tomen el mismo ticket.
router.post('/:id/tomar', requiereRol('tecnico'), async (req, res) => {
  const id = v.id(req.params.id);
  const { rowCount } = await db.tx(req.usuario.id, (cx) => cx.query(
    `UPDATE tickets SET estado = 'en_revision', tecnico_id = $2
     WHERE id = $1 AND estado = 'registrado' AND tecnico_id IS NULL AND cliente_acepto_revision_pago`,
    [id, req.usuario.id]
  ));
  if (!rowCount) throw conflicto('Este ticket ya no está disponible.');
  res.json({ ticket: await obtenerTicket(id) });
});

router.post('/:id/diagnostico', requiereRol('tecnico'), async (req, res) => {
  const ticket = await ticketAccesible(req);
  const hallazgos = v.parrafo(req.body.diagnostico, 'El diagnóstico', 10, 2000);
  const aplicaGarantia = v.booleano(req.body.aplicaGarantia, 'La opción de garantía');
  if (aplicaGarantia && ticket.garantiaVencida) throw badRequest('No puedes aplicar garantía: la garantía de este producto está vencida.');
  const costo = aplicaGarantia ? 0 : v.costo(req.body.costo);

  await db.tx(req.usuario.id, async (cx) => {
    const { rowCount } = await cx.query(
      `UPDATE tickets SET estado = 'pendiente_aprobacion_admin', comentario_admin = NULL
       WHERE id = $1 AND tecnico_id = $2 AND estado IN ('en_revision', 'revisar_precio_tecnico')`,
      [ticket.id, req.usuario.id]
    );
    if (!rowCount) throw conflicto('No puedes registrar un presupuesto en el estado actual del ticket.');
    await cx.query(
      `INSERT INTO diagnosticos (ticket_id, tecnico_id, hallazgos, aplica_garantia, costo_estimado)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ticket_id) DO UPDATE
         SET hallazgos = EXCLUDED.hallazgos, aplica_garantia = EXCLUDED.aplica_garantia,
             costo_estimado = EXCLUDED.costo_estimado, costo_oficial = NULL, fecha_diagnostico = now()`,
      [ticket.id, req.usuario.id, hallazgos, aplicaGarantia, costo]
    );
  });
  res.json({ ticket: await obtenerTicket(ticket.id) });
});

router.post('/:id/finalizar', requiereRol('tecnico'), async (req, res) => {
  const ticket = await ticketAccesible(req);
  const solucion = v.parrafo(req.body.solucion, 'La solución aplicada', 10, 2000);

  await db.tx(req.usuario.id, async (cx) => {
    const { rowCount } = await cx.query(
      `UPDATE tickets SET estado = 'resuelto'
       WHERE id = $1 AND tecnico_id = $2 AND estado = 'reparacion_aceptada'`,
      [ticket.id, req.usuario.id]
    );
    if (!rowCount) throw conflicto('Solo puedes finalizar reparaciones aceptadas por el cliente.');
    await cx.query('UPDATE diagnosticos SET solucion_aplicada = $2 WHERE ticket_id = $1', [ticket.id, solucion]);
  });
  res.json({ ticket: await obtenerTicket(ticket.id) });
});

// ---------------------------------------------------------------- chat
router.post('/:id/mensajes', requiereRol('cliente', 'tecnico'), async (req, res) => {
  const ticket = await ticketAccesible(req);
  if (!ticket.tecnicoId) throw conflicto('El chat se habilita cuando un técnico toma la solicitud.');
  if (['cancelado', 'reparacion_rechazada', 'resuelto'].includes(ticket.estado)) {
    throw conflicto('Este ticket ya está cerrado.');
  }
  const texto = v.parrafo(req.body.texto, 'El mensaje', 1, 1000);
  await db.query('INSERT INTO mensajes (ticket_id, usuario_id, texto) VALUES ($1, $2, $3)', [ticket.id, req.usuario.id, texto]);
  res.status(201).json({ ticket: adaptarParaRol(await obtenerTicket(ticket.id), req.usuario.rol) });
});

module.exports = router;
module.exports.obtenerTicket = obtenerTicket;
