// Pruebas de la API contra una base de datos de PRUEBAS (se recrea el esquema).
// Uso:  DATABASE_URL=postgresql://... npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('dotenv').config();
process.env.LOGIN_MAX_INTENTOS = '1000'; // el límite real (10) se probaría aparte
const db = require('../database/db');
const app = require('../src/app');

let base;
let server;

// Cliente HTTP mínimo con "cookie jar" por usuario.
function sesion() {
  let cookie = '';
  return async (metodo, ruta, cuerpo, extra = {}) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...extra },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const tipo = res.headers.get('content-type') || '';
    return { status: res.status, body: tipo.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
}

const ticketValido = (extra = {}) => ({
  producto: 'PlayStation 5', categoria: 'Consolas / Gaming', numeroSerie: 'SN-123456',
  numeroBoleta: 'B001-004521', fechaCompra: new Date().toISOString().slice(0, 10),
  descripcionFalla: 'La consola no enciende desde ayer.', ...extra,
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.before(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
test.after(async () => { server.close(); await db.pool.end(); });

test('H-02/H-03: el rol sale de la base de datos y la contraseña no se filtra', async () => {
  const cliente = sesion();
  const login = await cliente('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.usuario.rol, 'cliente');
  assert.equal(JSON.stringify(login.body).includes('password'), false);
  assert.equal((await cliente('GET', '/api/admin/tecnicos')).status, 403);
  assert.equal((await sesion()('GET', '/api/tickets')).status, 401);
  assert.equal((await cliente('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'mala' })).status, 401);
});

test('H-04: contraseñas débiles o vacías se rechazan', async () => {
  const s = sesion();
  const base = { nombres: 'Ana', apellidos: 'Prueba', correo: 'ana@prueba.com' };
  for (const password of ['1', '   ', 'sololetras', '12345678', 'ab1']) {
    const r = await s('POST', '/api/auth/registro', { ...base, password });
    assert.equal(r.status, 400, `debió rechazar "${password}"`);
  }
  assert.equal((await s('POST', '/api/auth/registro', { ...base, password: 'Segura123' })).status, 201);
  assert.equal((await sesion()('POST', '/api/auth/registro', { ...base, password: 'Segura123' })).status, 409);
});

test('H-05/H-09: límites de longitud, fecha futura y formatos', async () => {
  const c = sesion();
  await c('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' });
  assert.equal((await c('POST', '/api/tickets', ticketValido({ descripcionFalla: 'x'.repeat(20000) }))).status, 400);
  assert.equal((await c('POST', '/api/tickets', ticketValido({ descripcionFalla: 'corta' }))).status, 400);
  assert.equal((await c('POST', '/api/tickets', ticketValido({ fechaCompra: '2030-01-01' }))).status, 400);
  assert.equal((await c('POST', '/api/tickets', ticketValido({ numeroBoleta: '???' }))).status, 400);
  assert.equal((await c('POST', '/api/tickets', ticketValido({ categoria: 'Otra' }))).status, 400);
});

test('H-06: imágenes inválidas o demasiado pesadas se rechazan con mensaje', async () => {
  const c = sesion();
  await c('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' });
  assert.equal((await c('POST', '/api/tickets', ticketValido({ evidencia: 'data:text/html;base64,PHNjcmlwdD4=' }))).status, 400);
  const pesada = 'data:image/png;base64,' + 'A'.repeat(2_900_000); // ≈ 2.2 MB reales
  assert.equal((await c('POST', '/api/tickets', ticketValido({ evidencia: pesada }))).status, 400);
  const enorme = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
  assert.equal((await c('POST', '/api/tickets', ticketValido({ evidencia: enorme }))).status, 413);
  const ok = await c('POST', '/api/tickets', ticketValido({ evidencia: PNG }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.ticket.tieneEvidencia, true);
  const foto = await c('GET', `/api/tickets/${ok.body.ticket.id}/evidencia`);
  assert.equal(foto.status, 200);

  // El técnico ve la foto mientras el ticket está disponible; otro cliente nunca.
  const tec = sesion(), otro = sesion();
  await tec('POST', '/api/auth/login', { correo: 'marco.delgado@sony.com', password: 'tecnico123' });
  await otro('POST', '/api/auth/login', { correo: 'carlos.mendoza@gmail.com', password: 'cliente123' });
  assert.equal((await tec('GET', `/api/tickets/${ok.body.ticket.id}/evidencia`)).status, 200);
  assert.equal((await otro('GET', `/api/tickets/${ok.body.ticket.id}/evidencia`)).status, 404);
  await tec('POST', `/api/tickets/${ok.body.ticket.id}/tomar`);
  const tec2 = sesion();
  await tec2('POST', '/api/auth/login', { correo: 'jorge.campos@sony.com', password: 'tecnico123' });
  assert.equal((await tec2('GET', `/api/tickets/${ok.body.ticket.id}/evidencia`)).status, 404);
});

test('H-01: el texto malicioso se guarda como texto (el frontend lo escapa) y CSP bloquea scripts inline', async () => {
  const c = sesion();
  await c('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' });
  const r = await c('POST', '/api/tickets', ticketValido({ descripcionFalla: '<img src=x onerror=alert(1)> no enciende' }));
  assert.equal(r.status, 201);
  const res = await fetch(base + '/index.html');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
});

test('flujo completo + H-07/H-08: permisos y validaciones por estado', async () => {
  const cliente = sesion(), otro = sesion(), tecnico = sesion(), tecnico2 = sesion(), admin = sesion();
  await cliente('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' });
  await otro('POST', '/api/auth/login', { correo: 'carlos.mendoza@gmail.com', password: 'cliente123' });
  await tecnico('POST', '/api/auth/login', { correo: 'marco.delgado@sony.com', password: 'tecnico123' });
  await tecnico2('POST', '/api/auth/login', { correo: 'jorge.campos@sony.com', password: 'tecnico123' });
  await admin('POST', '/api/auth/login', { correo: 'paula.nunez@sony.com', password: 'admin123' });

  const { body } = await cliente('POST', '/api/tickets', ticketValido());
  const id = body.ticket.id;
  assert.equal(body.ticket.estado, 'registrado');

  // Otro cliente no puede ver ni tocar el ticket.
  assert.equal((await otro('POST', `/api/tickets/${id}/cancelar`)).status, 404);
  assert.ok(!(await otro('GET', '/api/tickets')).body.tickets.some((t) => t.id === id));

  // Los técnicos no pueden operar un ticket sin tomarlo.
  assert.equal((await tecnico('POST', `/api/tickets/${id}/diagnostico`, { diagnostico: 'x'.repeat(20), aplicaGarantia: false, costo: 10 })).status, 404);

  // Solo un técnico lo toma; el segundo recibe conflicto.
  assert.equal((await tecnico('POST', `/api/tickets/${id}/tomar`)).status, 200);
  assert.equal((await tecnico2('POST', `/api/tickets/${id}/tomar`)).status, 409);
  assert.equal((await tecnico2('POST', `/api/tickets/${id}/diagnostico`, { diagnostico: 'x'.repeat(20), aplicaGarantia: false, costo: 10 })).status, 404);

  // El cliente ya no puede cancelar.
  assert.equal((await cliente('POST', `/api/tickets/${id}/cancelar`)).status, 409);

  // H-08: costo negativo / inválido.
  const diag = { diagnostico: 'Fuente de poder dañada por sobrevoltaje.', aplicaGarantia: false };
  assert.equal((await tecnico('POST', `/api/tickets/${id}/diagnostico`, { ...diag, costo: -250 })).status, 400);
  assert.equal((await tecnico('POST', `/api/tickets/${id}/diagnostico`, { ...diag, costo: 'abc' })).status, 400);
  assert.equal((await tecnico('POST', `/api/tickets/${id}/diagnostico`, { ...diag, costo: 250 })).status, 200);

  // El cliente no ve el presupuesto hasta que el admin lo apruebe.
  const antes = (await cliente('GET', '/api/tickets')).body.tickets.find((t) => t.id === id);
  assert.equal(antes.costoPropuesto, null);
  assert.equal(antes.diagnostico, null);

  // El cliente no puede aprobar ni aceptar antes de tiempo.
  assert.equal((await cliente('POST', `/api/admin/tickets/${id}/aprobar`)).status, 403);
  assert.equal((await cliente('POST', `/api/tickets/${id}/respuesta-presupuesto`, { acepta: true })).status, 409);

  // Admin pide ajuste y el técnico corrige.
  assert.equal((await admin('POST', `/api/admin/tickets/${id}/observar`, { comentario: 'Costo muy alto' })).status, 200);
  const t = (await tecnico('GET', '/api/tickets')).body.tickets.find((x) => x.id === id);
  assert.equal(t.comentarioAdmin, 'Costo muy alto');
  assert.equal((await tecnico('POST', `/api/tickets/${id}/diagnostico`, { ...diag, costo: 180 })).status, 200);
  assert.equal((await admin('POST', `/api/admin/tickets/${id}/aprobar`)).status, 200);

  const visto = (await cliente('GET', '/api/tickets')).body.tickets.find((x) => x.id === id);
  assert.equal(visto.estado, 'presupuesto_enviado');
  assert.equal(visto.costoOficial, 180);
  assert.equal(visto.comentarioAdmin, null);

  assert.equal((await cliente('POST', `/api/tickets/${id}/respuesta-presupuesto`, { acepta: true })).status, 200);
  assert.equal((await tecnico('POST', `/api/tickets/${id}/finalizar`, { solucion: 'Se reemplazó la fuente de poder.' })).status, 200);
  assert.equal((await cliente('POST', `/api/tickets/${id}/mensajes`, { texto: 'Gracias' })).status, 409);

  const { rows } = await db.query('SELECT count(*)::int AS n FROM historial_estados WHERE ticket_id = $1 AND usuario_id IS NOT NULL', [id]);
  assert.ok(rows[0].n >= 6, 'el historial registra quién hizo cada cambio');
});

test('garantía vencida: aviso al cliente y no se puede aplicar garantía', async () => {
  const cliente = sesion(), tecnico = sesion();
  await cliente('POST', '/api/auth/login', { correo: 'carlos.mendoza@gmail.com', password: 'cliente123' });
  await tecnico('POST', '/api/auth/login', { correo: 'marco.delgado@sony.com', password: 'tecnico123' });

  const { body } = await cliente('POST', '/api/tickets', ticketValido({ fechaCompra: '2022-01-10' }));
  const id = body.ticket.id;
  assert.equal(body.ticket.garantiaVencida, true);
  assert.equal(body.ticket.clienteAceptoRevisionPago, false);

  // Mientras no acepte pagar, el técnico ni lo ve ni lo toma.
  assert.ok(!(await tecnico('GET', '/api/tickets')).body.tickets.some((t) => t.id === id));
  assert.equal((await tecnico('POST', `/api/tickets/${id}/tomar`)).status, 409);

  assert.equal((await cliente('POST', `/api/tickets/${id}/garantia`, { acepta: true })).status, 200);
  assert.equal((await tecnico('POST', `/api/tickets/${id}/tomar`)).status, 200);
  const r = await tecnico('POST', `/api/tickets/${id}/diagnostico`, { diagnostico: 'Placa principal dañada.', aplicaGarantia: true });
  assert.equal(r.status, 400);
});

test('rechazo de origen distinto (CSRF)', async () => {
  const c = sesion();
  const r = await c('POST', '/api/auth/login', { correo: 'lucia.ramos@mail.com', password: 'cliente123' }, { Origin: 'https://sitio-malo.com' });
  assert.equal(r.status, 403);
});
