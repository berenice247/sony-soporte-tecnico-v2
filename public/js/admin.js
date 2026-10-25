// Panel de administración: tickets (aprobar y asignar), catálogo de productos y usuarios.
(async function () {
  'use strict';
  const { api, esc, toast, modal, confirmar, badgeEstado, soles, acciones, chips, agruparPorCategoria, CATEGORIAS, infoCategoria } = App;
  const $ = (id) => document.getElementById(id);

  const yo = await App.exigirRol('administrador');
  let tickets = [], productos = [], usuarios = [], tecnicos = [];
  let pestana = 'tickets', filtroEstado = 'todos', filtroRol = 'todos';

  const CERRADOS = ['resuelto', 'cancelado', 'reparacion_rechazada'];
  const sinAsignar = (t) => t.estado === 'registrado' && !t.tecnicoId && t.clienteAceptoRevisionPago;
  const porAprobar = (t) => t.estado === 'pendiente_aprobacion_admin';
  const cerrado = (t) => CERRADOS.includes(t.estado);
  const enProceso = (t) => !cerrado(t) && !porAprobar(t) && !sinAsignar(t);

  const GRUPOS = { 'sin-asignar': sinAsignar, 'por-aprobar': porAprobar, proceso: enProceso, cerrados: cerrado };

  // ---------- Pestañas ----------
  function pintarPestanas() {
    $('chipsPestanas').innerHTML = chips([
      { valor: 'tickets', texto: 'Tickets' },
      { valor: 'catalogo', texto: 'Catálogo de productos' },
      { valor: 'equipo', texto: 'Equipo y usuarios' },
    ], pestana, 'pestana');
    $('panelTickets').classList.toggle('hidden', pestana !== 'tickets');
    $('panelCatalogo').classList.toggle('hidden', pestana !== 'catalogo');
    $('panelEquipo').classList.toggle('hidden', pestana !== 'equipo');
  }
  $('chipsPestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pestana]');
    if (!b) return;
    pestana = b.dataset.pestana;
    pintarPestanas();
    if (pestana === 'catalogo' && !productos.length) cargarProductos();
    if (pestana === 'equipo' && !usuarios.length) cargarUsuarios();
  });

  // ---------- Tickets ----------
  function filtrados() {
    const texto = $('buscador').value.trim().toLowerCase();
    const cat = $('filtroCategoria').value;
    return tickets.filter((t) => (filtroEstado === 'todos' || GRUPOS[filtroEstado](t))
      && (cat === 'todas' || t.categoria === cat)
      && (!texto || [t.codigo, t.producto, t.numeroBoleta, t.clienteNombre].some((x) => x.toLowerCase().includes(texto))));
  }

  function pintarFila(t) {
    const pendiente = porAprobar(t);
    const precio = t.costoPropuesto === null || t.costoPropuesto === undefined
      ? '<span class="text-slate-400">—</span>'
      : `<span class="font-bold text-slate-900">${t.aplicaGarantia ? 'Garantía' : soles(t.costoPropuesto)}</span>`;
    let accion = '<span class="text-xs italic text-slate-400">Sin acciones</span>';
    if (pendiente) {
      accion = `<div class="flex justify-end gap-1.5">
        <button data-accion="aprobar" data-id="${t.id}" class="btn-success btn-sm">Aprobar</button>
        <button data-accion="observar" data-id="${t.id}" class="btn-warn btn-sm">Observar</button></div>`;
    } else if (sinAsignar(t)) {
      accion = `<button data-accion="asignar" data-id="${t.id}" class="btn-info btn-sm">Asignar técnico</button>`;
    }
    return `
      <tr class="${pendiente ? 'bg-amber-50/50' : ''}">
        <td>
          <p class="font-bold text-sony">${esc(t.codigo)}</p>
          <p class="font-medium text-slate-800">${esc(t.producto)}</p>
          <p class="text-xs text-slate-500">${esc(t.clienteNombre)} · Boleta ${esc(t.numeroBoleta)}${t.tecnicoNombre ? ` · Téc. ${esc(t.tecnicoNombre)}` : ''}</p>
          ${pendiente && t.diagnostico ? `<p class="mt-1 line-clamp-2 max-w-md text-xs text-slate-600" title="${esc(t.diagnostico)}"><strong>Diagnóstico:</strong> ${esc(t.diagnostico)}</p>` : ''}
        </td>
        <td>${badgeEstado(t.estado)}</td>
        <td>${precio}</td>
        <td class="text-right">${accion}</td>
      </tr>`;
  }

  const tablaTickets = (filas) => `
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="tabla w-full min-w-[640px] text-sm">
        <thead><tr><th>Ticket</th><th>Estado</th><th>Presupuesto</th><th class="text-right">Acción</th></tr></thead>
        <tbody class="divide-y divide-slate-100">${filas}</tbody>
      </table></div></div>`;

  function pintar() {
    $('statTotal').textContent = tickets.length;
    $('statPorAprobar').textContent = tickets.filter(porAprobar).length;
    $('statProceso').textContent = tickets.filter((t) => !cerrado(t)).length;
    $('statResueltos').textContent = tickets.filter((t) => t.estado === 'resuelto').length;

    const n = (g) => tickets.filter(GRUPOS[g]).length;
    $('chipsTickets').innerHTML = chips([
      { valor: 'todos', texto: 'Todos', n: tickets.length },
      { valor: 'sin-asignar', texto: 'Sin asignar', n: n('sin-asignar') },
      { valor: 'por-aprobar', texto: 'Por aprobar', n: n('por-aprobar') },
      { valor: 'proceso', texto: 'En proceso', n: n('proceso') },
      { valor: 'cerrados', texto: 'Cerrados', n: n('cerrados') },
    ], filtroEstado);

    const lista = filtrados();
    $('subtitulo').textContent = `${lista.length} de ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`;
    $('listaTickets').innerHTML = lista.length
      ? agruparPorCategoria(lista, pintarFila, tablaTickets)
      : '<div class="card-pad py-10 text-center text-sm text-slate-500">No hay tickets que coincidan.</div>';
  }

  async function cargarTickets() {
    try {
      tickets = (await api('GET', '/tickets')).tickets;
      pintar();
    } catch (err) {
      $('listaTickets').innerHTML = `<div class="notice-bad">${esc(err.message)}</div>`;
    }
  }

  async function cargarTecnicos() {
    try {
      tecnicos = (await api('GET', '/admin/tecnicos')).tecnicos;
      $('listaTecnicos').innerHTML = tecnicos.length
        ? tecnicos.map((t) => `
            <li class="flex items-center justify-between gap-3 py-3">
              <div class="min-w-0"><p class="truncate font-semibold text-slate-800">${esc(t.nombres)} ${esc(t.apellidos)}</p><p class="truncate text-xs text-slate-500">${esc(t.correo)}</p></div>
              <span class="badge-gray shrink-0">${t.ticketsActivos} activo${t.ticketsActivos === 1 ? '' : 's'}</span>
            </li>`).join('')
        : '<li class="py-3 text-slate-500">Aún no hay técnicos.</li>';
    } catch (err) {
      $('listaTecnicos').innerHTML = `<li class="notice-bad">${esc(err.message)}</li>`;
    }
  }

  const reemplazar = (ticket) => { tickets = tickets.map((t) => (t.id === ticket.id ? ticket : t)); pintar(); };

  acciones($('listaTickets'), {
    aprobar: async ({ id }) => {
      const t = tickets.find((x) => x.id === Number(id));
      const ok = await confirmar({
        titulo: 'Aprobar presupuesto',
        descripcion: `Se enviará al cliente ${t.aplicaGarantia ? 'sin costo (garantía)' : `un presupuesto de ${soles(t.costoPropuesto)}`}.`,
        textoOk: 'Aprobar y enviar', claseOk: 'btn-success',
      });
      if (!ok) return;
      reemplazar((await api('POST', `/admin/tickets/${id}/aprobar`)).ticket);
      toast('Presupuesto aprobado y enviado al cliente.');
    },
    observar: async ({ id }) => {
      const datos = await modal({
        titulo: 'Observar presupuesto',
        descripcion: 'Indica al técnico qué debe ajustar. El ticket volverá a su bandeja.',
        textoOk: 'Enviar observación', claseOk: 'btn-warn',
        campos: [{ name: 'comentario', label: 'Motivo', tipo: 'textarea', min: 5, max: 500, required: true }],
      });
      if (!datos) return;
      reemplazar((await api('POST', `/admin/tickets/${id}/observar`, datos)).ticket);
      toast('Observación enviada al técnico.', 'info');
    },
    asignar: async ({ id }) => {
      const t = tickets.find((x) => x.id === Number(id));
      if (!tecnicos.length) throw new Error('Primero registra un técnico en la pestaña "Equipo y usuarios".');
      const datos = await modal({
        titulo: 'Asignar técnico',
        descripcion: `${t.codigo} · ${t.producto}`,
        textoOk: 'Asignar', claseOk: 'btn-info',
        campos: [{ name: 'tecnicoId', label: 'Técnico', tipo: 'select', required: true,
          opciones: tecnicos.map((x) => ({ valor: x.id, texto: `${x.nombres} ${x.apellidos} · ${x.ticketsActivos} activo${x.ticketsActivos === 1 ? '' : 's'}` })) }],
      });
      if (!datos) return;
      reemplazar((await api('POST', `/admin/tickets/${id}/asignar`, { tecnicoId: Number(datos.tecnicoId) })).ticket);
      toast('Ticket asignado.');
      cargarTecnicos();
    },
  });

  $('chipsTickets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (b) { filtroEstado = b.dataset.filtro; pintar(); }
  });
  $('buscador').addEventListener('input', pintar);
  $('filtroCategoria').addEventListener('change', pintar);

  // ---------- Catálogo de productos ----------
  const camposProducto = (p = {}) => [
    { name: 'nombre', label: 'Nombre del producto', tipo: 'texto', required: true, valor: p.nombre || '' },
    { name: 'categoria', label: 'Categoría', tipo: 'select', required: true, valor: p.categoria || 'Consolas / Gaming',
      opciones: Object.keys(CATEGORIAS).map((c) => ({ valor: c, texto: CATEGORIAS[c].nombre })) },
    { name: 'modelo', label: 'Modelo (opcional)', tipo: 'texto', max: 80, valor: p.modelo || '' },
    { name: 'descripcion', label: 'Descripción (opcional)', tipo: 'textarea', max: 500, valor: p.descripcion || '' },
  ];

  const pintarProducto = (p) => `
    <li class="flex flex-wrap items-center justify-between gap-3 p-4 ${p.activo ? '' : 'opacity-60'}">
      <div class="min-w-0">
        <p class="font-semibold text-slate-800">${esc(p.nombre)} ${p.activo ? '' : '<span class="badge-gray">Desactivado</span>'}</p>
        <p class="text-xs text-slate-500">${p.modelo ? `Modelo ${esc(p.modelo)}` : 'Sin modelo'}${p.descripcion ? ` · ${esc(p.descripcion)}` : ''}</p>
      </div>
      <div class="flex gap-1.5">
        <button data-accion="editar-producto" data-id="${p.id}" class="btn-ghost btn-sm">Editar</button>
        <button data-accion="estado-producto" data-id="${p.id}" class="${p.activo ? 'btn-danger-ghost' : 'btn-success'} btn-sm">${p.activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    </li>`;

  function pintarProductos() {
    $('listaProductos').innerHTML = productos.length
      ? agruparPorCategoria(productos, pintarProducto, (html) => `<ul class="card divide-y divide-slate-100">${html}</ul>`)
      : '<div class="card-pad py-10 text-center text-sm text-slate-500">El catálogo está vacío. Agrega el primer producto.</div>';
  }
  async function cargarProductos() {
    try { productos = (await api('GET', '/admin/productos')).productos; pintarProductos(); }
    catch (err) { $('listaProductos').innerHTML = `<div class="notice-bad">${esc(err.message)}</div>`; }
  }

  $('btnNuevoProducto').addEventListener('click', async () => {
    try {
      const datos = await modal({ titulo: 'Agregar producto', textoOk: 'Guardar', claseOk: 'btn-primary', campos: camposProducto() });
      if (!datos) return;
      await api('POST', '/admin/productos', datos);
      toast('Producto agregado.');
      cargarProductos();
    } catch (err) { toast(err.message, 'error'); }
  });

  acciones($('listaProductos'), {
    'editar-producto': async ({ id }) => {
      const p = productos.find((x) => x.id === Number(id));
      const datos = await modal({ titulo: 'Editar producto', textoOk: 'Guardar cambios', claseOk: 'btn-primary', campos: camposProducto(p) });
      if (!datos) return;
      await api('PUT', `/admin/productos/${id}`, datos);
      toast('Producto actualizado.');
      cargarProductos();
    },
    'estado-producto': async ({ id }) => {
      const p = productos.find((x) => x.id === Number(id));
      await api('POST', `/admin/productos/${id}/estado`, { activo: !p.activo });
      toast(p.activo ? 'Producto desactivado.' : 'Producto activado.', 'info');
      cargarProductos();
    },
  });

  // ---------- Usuarios ----------
  const ROLES = { cliente: 'Clientes', tecnico: 'Técnicos', administrador: 'Administradores' };

  function pintarUsuarios() {
    const n = (r) => usuarios.filter((u) => u.rol === r).length;
    $('chipsRol').innerHTML = chips([
      { valor: 'todos', texto: 'Todos', n: usuarios.length },
      ...Object.entries(ROLES).map(([valor, texto]) => ({ valor, texto, n: n(valor) })),
    ], filtroRol, 'rol');
    const lista = usuarios.filter((u) => filtroRol === 'todos' || u.rol === filtroRol);
    $('tablaUsuarios').innerHTML = lista.length
      ? lista.map((u) => `
          <tr>
            <td><p class="font-semibold text-slate-800">${esc(u.nombres)} ${esc(u.apellidos)}</p><p class="text-xs text-slate-500">${esc(u.correo)} · desde ${esc(u.fechaRegistro)}</p></td>
            <td><span class="badge-gray">${esc(ROLES[u.rol] || u.rol)}</span></td>
            <td>${u.activo ? '<span class="badge-green">Activo</span>' : '<span class="badge-red">Desactivado</span>'}</td>
            <td class="text-right">${u.id === yo.id
        ? '<span class="text-xs italic text-slate-400">Tu cuenta</span>'
        : `<button data-accion="estado-usuario" data-id="${u.id}" class="${u.activo ? 'btn-danger-ghost' : 'btn-success'} btn-sm">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="py-8 text-center text-slate-500">No hay usuarios en este filtro.</td></tr>';
  }
  async function cargarUsuarios() {
    try { usuarios = (await api('GET', '/admin/usuarios')).usuarios; pintarUsuarios(); }
    catch (err) { $('tablaUsuarios').innerHTML = `<tr><td colspan="4"><div class="notice-bad">${esc(err.message)}</div></td></tr>`; }
  }
  $('chipsRol').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rol]');
    if (b) { filtroRol = b.dataset.rol; pintarUsuarios(); }
  });
  acciones($('tablaUsuarios'), {
    'estado-usuario': async ({ id }) => {
      const u = usuarios.find((x) => x.id === Number(id));
      const ok = await confirmar({
        titulo: u.activo ? 'Desactivar cuenta' : 'Activar cuenta',
        descripcion: `${u.nombres} ${u.apellidos} ${u.activo ? 'ya no podrá iniciar sesión.' : 'podrá volver a iniciar sesión.'}`,
        textoOk: u.activo ? 'Desactivar' : 'Activar', claseOk: u.activo ? 'btn-primary' : 'btn-success',
      });
      if (!ok) return;
      await api('POST', `/admin/usuarios/${id}/estado`, { activo: !u.activo });
      toast(u.activo ? 'Cuenta desactivada.' : 'Cuenta activada.', 'info');
      await Promise.all([cargarUsuarios(), cargarTecnicos()]);
    },
  });

  // ---------- Alta de técnicos ----------
  $('nuevoTecnicoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const error = $('errorTecnico');
    error.classList.add('hidden');
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      const { tecnico } = await api('POST', '/admin/tecnicos', {
        nombres: $('tecNombres').value,
        apellidos: $('tecApellidos').value,
        correo: $('tecCorreo').value,
        password: $('tecPassword').value,
      });
      form.reset();
      toast(`Técnico ${tecnico.nombres} registrado.`);
      cargarTecnicos();
      cargarUsuarios();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      boton.disabled = false;
    }
  });

  pintarPestanas();
  await Promise.all([cargarTickets(), cargarTecnicos()]);
  setInterval(() => { if (!document.hidden && !document.querySelector('[role=dialog]')) cargarTickets(); }, 20000);
})();
