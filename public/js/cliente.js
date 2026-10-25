(async function () {
  'use strict';
  const { api, esc, toast, confirmar, badgeEstado, badgeGravedad, soles, fechaHora, acciones, chips, agruparPorCategoria, lineaTiempo } = App;
  const $ = (id) => document.getElementById(id);

  const usuario = await App.exigirRol('cliente');
  const lista = $('listaTickets');
  let tickets = [];
  let filtro = 'todas';
  const historialAbierto = new Set();

  // ---------- Progreso ----------
  const PASOS = ['Recepción', 'Diagnóstico', 'Aprobación', 'Finalizado'];
  const AVANCE = {
    registrado:                 { pasos: 1, tiempo: (t) => (t.gravedad === 'alta' ? '~24 h hábiles (urgente)' : '2 a 3 días hábiles') },
    en_revision:                { pasos: 2, tiempo: () => '~24 h para el dictamen técnico' },
    pendiente_aprobacion_admin: { pasos: 3, tiempo: () => '~12 h para validar costos' },
    revisar_precio_tecnico:     { pasos: 3, tiempo: () => '~12 h para reajustar el presupuesto' },
    presupuesto_enviado:        { pasos: 3, tiempo: () => 'Tu decisión inicia la reparación' },
    reparacion_aceptada:        { pasos: 3, tiempo: () => '2 a 4 días para reparar y probar' },
    resuelto:                   { pasos: 4, tiempo: () => 'Listo para recoger' },
    reparacion_rechazada:       { pasos: 3, tiempo: () => 'Cancelado por ti', detenido: true },
    cancelado:                  { pasos: 1, tiempo: () => 'Solicitud cancelada', detenido: true },
  };

  function pintarProgreso(t) {
    const a = AVANCE[t.estado] || AVANCE.registrado;
    const pasos = PASOS.map((p, i) => `<div class="${i < a.pasos ? (a.detenido && i === a.pasos - 1 ? 'done stopped' : 'done') : ''}">${p}</div>`).join('');
    return `<div class="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        ${badgeEstado(t.estado)}
        <span class="text-slate-500">Atención estimada: <strong class="text-slate-800">${esc(a.tiempo(t))}</strong></span>
      </div>
      <div class="steps">${pasos}</div>
    </div>`;
  }

  function pintarAvisos(t) {
    const avisos = [];
    if (t.estado === 'registrado' && t.garantiaVencida && !t.clienteAceptoRevisionPago) {
      avisos.push(`<div class="notice-warn space-y-3">
        <p><strong>Garantía vencida.</strong> Tu boleta tiene más de 1 año, por eso la revisión y la reparación tendrán costo tras el diagnóstico técnico.</p>
        <div class="flex flex-wrap gap-2">
          <button data-accion="garantia-si" data-id="${t.id}" class="btn-primary btn-sm">Acepto revisión con costo</button>
          <button data-accion="garantia-no" data-id="${t.id}" class="btn-ghost btn-sm">Cancelar solicitud</button>
        </div></div>`);
    }
    if (t.estado === 'presupuesto_enviado') {
      avisos.push(`<div class="notice-info space-y-3">
        <p class="font-semibold">Presupuesto validado por Sony</p>
        <p class="text-2xl font-extrabold text-sky-950">${t.costoOficial ? soles(t.costoOficial) : 'Sin costo (cubierto por garantía)'}</p>
        <p class="whitespace-pre-wrap break-words"><strong>Diagnóstico:</strong> ${esc(t.diagnostico)}</p>
        <div class="flex flex-wrap gap-2">
          <button data-accion="presupuesto-si" data-id="${t.id}" class="btn-success btn-sm">Aceptar reparación</button>
          <button data-accion="presupuesto-no" data-id="${t.id}" class="btn-ghost btn-sm">Rechazar</button>
        </div></div>`);
    }
    if (t.estado === 'resuelto' && t.solucion) {
      avisos.push(`<div class="notice-ok"><strong>Solución aplicada:</strong> <span class="whitespace-pre-wrap break-words">${esc(t.solucion)}</span></div>`);
    }
    return avisos.join('');
  }

  function pintarChat(t) {
    const cerrado = ['cancelado', 'reparacion_rechazada', 'resuelto'].includes(t.estado);
    if (!t.tecnicoId) return '<p class="text-xs text-slate-500">El chat se habilitará cuando un técnico tome tu solicitud.</p>';
    const mensajes = t.mensajes.length
      ? t.mensajes.map((m) => `
          <div class="max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.remitente === 'CLIENTE' ? 'ml-auto bg-sony-soft' : 'bg-slate-100'}">
            <p class="mb-0.5 flex justify-between gap-3 text-[11px] text-slate-500"><strong>${esc(m.nombre)}</strong><time>${esc(fechaHora(m.fecha))}</time></p>
            <p class="whitespace-pre-wrap break-words text-slate-800">${esc(m.texto)}</p>
          </div>`).join('')
      : '<p class="text-xs text-slate-500">Aún no hay mensajes.</p>';
    return `
      <div class="flex max-h-60 flex-col gap-2 overflow-y-auto">${mensajes}</div>
      ${cerrado ? '' : `
      <form data-form-chat data-id="${t.id}" class="mt-3 flex gap-2">
        <label for="chat-${t.id}" class="sr-only">Mensaje para el técnico</label>
        <input id="chat-${t.id}" type="text" required maxlength="1000" class="input" placeholder="Escribe un mensaje…" autocomplete="off">
        <button type="submit" class="btn-primary btn-sm">Enviar</button>
      </form>`}`;
  }

  function pintarTicket(t) {
    return `
    <article class="card-pad space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="flex flex-wrap items-center gap-2 text-xs"><span class="font-bold text-sony">${esc(t.codigo)}</span>${badgeGravedad(t.gravedad)}</p>
          <h3 class="mt-1 text-lg font-bold text-slate-900">${esc(t.producto)}</h3>
          <p class="text-xs text-slate-500">Boleta ${esc(t.numeroBoleta)} · Serie ${esc(t.numeroSerie)} · Registrado el ${esc(t.fechaCreacion)}</p>
        </div>
        ${t.estado === 'registrado' && !t.tecnicoId ? `<button data-accion="cancelar" data-id="${t.id}" class="btn-danger-ghost btn-sm">Cancelar solicitud</button>` : ''}
      </header>

      ${pintarProgreso(t)}
      ${pintarAvisos(t)}

      <div class="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-100">
        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Falla reportada</p>
        <p class="whitespace-pre-wrap break-words text-slate-700">${esc(t.descripcionFalla)}</p>
        ${t.tieneEvidencia ? `<a href="/api/tickets/${t.id}/evidencia" target="_blank" rel="noopener" class="mt-3 inline-block">
            <img src="/api/tickets/${t.id}/evidencia" alt="Foto del daño" loading="lazy" class="h-24 rounded-lg object-cover ring-1 ring-slate-200"></a>` : ''}
      </div>

      <details data-hist="${t.id}" class="rounded-xl border border-line p-3" ${historialAbierto.has(t.id) ? 'open' : ''}>
        <summary class="cursor-pointer text-sm font-bold text-slate-800">Historial del ticket</summary>
        <div class="mt-3">${lineaTiempo(t.historial)}</div>
      </details>

      <section aria-label="Chat con el técnico" class="rounded-xl border border-slate-200 p-3">
        <h4 class="mb-2 text-sm font-bold text-slate-800">Chat con el técnico${t.tecnicoNombre ? ` · <span class="font-medium text-slate-500">${esc(t.tecnicoNombre)}</span>` : ''}</h4>
        ${pintarChat(t)}
      </section>
    </article>`;
  }

  const CERRADOS = ['resuelto', 'cancelado', 'reparacion_rechazada'];
  const grupo = (t) => {
    if (CERRADOS.includes(t.estado)) return 'final';
    const esperaCliente = t.estado === 'presupuesto_enviado'
      || (t.estado === 'registrado' && t.garantiaVencida && !t.clienteAceptoRevisionPago);
    return esperaCliente ? 'respuesta' : 'curso';
  };

  function pintar() {
    const n = (g) => tickets.filter((t) => grupo(t) === g).length;
    $('chipsEstado').innerHTML = chips([
      { valor: 'todas', texto: 'Todas', n: tickets.length },
      { valor: 'respuesta', texto: 'Requieren tu respuesta', n: n('respuesta') },
      { valor: 'curso', texto: 'En curso', n: n('curso') },
      { valor: 'final', texto: 'Finalizadas', n: n('final') },
    ], filtro);
    $('resumen').textContent = tickets.length
      ? `${tickets.length} solicitud${tickets.length === 1 ? '' : 'es'} · ${n('respuesta') + n('curso')} en curso`
      : 'Aún no tienes solicitudes';

    const visibles = filtro === 'todas' ? tickets : tickets.filter((t) => grupo(t) === filtro);
    App.conservarEntradas(lista, () => {
      if (visibles.length) { lista.innerHTML = agruparPorCategoria(visibles, pintarTicket, (html) => `<div class="space-y-4">${html}</div>`); return; }
      lista.innerHTML = tickets.length
        ? '<div class="card-pad py-10 text-center text-sm text-slate-500">No tienes solicitudes en este filtro.</div>'
        : `<div class="card-pad py-12 text-center">
             <p class="text-4xl" aria-hidden="true">🛠️</p>
             <p class="mt-3 font-semibold text-slate-800">Todavía no tienes solicitudes</p>
             <p class="mt-1 text-sm text-slate-500">Completa el formulario para registrar tu primer equipo.</p>
           </div>`;
    });
  }

  $('chipsEstado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (b) { filtro = b.dataset.filtro; pintar(); }
  });
  // Recuerda qué historiales están abiertos para que no se cierren al refrescar la lista.
  lista.addEventListener('toggle', (e) => {
    const id = Number(e.target.dataset?.hist);
    if (id) e.target.open ? historialAbierto.add(id) : historialAbierto.delete(id);
  }, true);

  async function cargar() {
    try {
      tickets = (await api('GET', '/tickets')).tickets;
      pintar();
    } catch (err) {
      lista.innerHTML = `<div class="notice-bad">${esc(err.message)}</div>`;
    }
  }

  function reemplazar(ticket) {
    tickets = tickets.map((t) => (t.id === ticket.id ? ticket : t));
    pintar();
  }

  // ---------- Acciones sobre tickets ----------
  acciones(lista, {
    'garantia-si': async ({ id }) => { reemplazar((await api('POST', `/tickets/${id}/garantia`, { acepta: true })).ticket); toast('Gracias, un técnico atenderá tu solicitud.'); },
    'garantia-no': async ({ id }) => {
      if (!(await confirmar({ titulo: '¿Cancelar la solicitud?', descripcion: 'La solicitud quedará cancelada.', textoOk: 'Sí, cancelar', claseOk: 'btn-primary' }))) return;
      reemplazar((await api('POST', `/tickets/${id}/garantia`, { acepta: false })).ticket);
      toast('Solicitud cancelada.', 'info');
    },
    'cancelar': async ({ id }) => {
      if (!(await confirmar({ titulo: '¿Cancelar la solicitud?', descripcion: 'Solo puedes cancelarla mientras ningún técnico la haya tomado.', textoOk: 'Sí, cancelar' }))) return;
      reemplazar((await api('POST', `/tickets/${id}/cancelar`)).ticket);
      toast('Solicitud cancelada.', 'info');
    },
    'presupuesto-si': async ({ id }) => {
      if (!(await confirmar({ titulo: 'Aceptar la reparación', descripcion: 'Autorizas al técnico a iniciar la reparación con el costo indicado.', textoOk: 'Aceptar', claseOk: 'btn-success' }))) return;
      reemplazar((await api('POST', `/tickets/${id}/respuesta-presupuesto`, { acepta: true })).ticket);
      toast('Reparación aceptada. ¡Gracias!');
    },
    'presupuesto-no': async ({ id }) => {
      if (!(await confirmar({ titulo: 'Rechazar la reparación', descripcion: 'La solicitud se cerrará sin reparar el equipo.', textoOk: 'Rechazar' }))) return;
      reemplazar((await api('POST', `/tickets/${id}/respuesta-presupuesto`, { acepta: false })).ticket);
      toast('Has rechazado el presupuesto.', 'info');
    },
  });

  // ---------- Chat ----------
  lista.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form-chat]');
    if (!form) return;
    e.preventDefault();
    const campo = form.querySelector('input');
    const texto = campo.value.trim();
    if (!texto) return;
    campo.disabled = true;
    try {
      const { ticket } = await api('POST', `/tickets/${form.dataset.id}/mensajes`, { texto });
      campo.value = '';
      reemplazar(ticket);
      $(`chat-${ticket.id}`)?.focus();
    } catch (err) {
      toast(err.message, 'error');
      campo.disabled = false;
    }
  });

  // ---------- Catálogo de productos ----------
  async function cargarCatalogo() {
    const { productos } = await api('GET', '/catalogo');
    const grupos = {};
    productos.forEach((p) => { (grupos[p.categoria] = grupos[p.categoria] || []).push(p); });
    $('productoId').innerHTML = '<option value="">Selecciona tu producto…</option>'
      + Object.entries(grupos).map(([cat, items]) => `<optgroup label="${esc(App.infoCategoria(cat).nombre)}">${
        items.map((p) => `<option value="${p.id}">${esc(p.nombre)}${p.modelo ? ` (${esc(p.modelo)})` : ''}</option>`).join('')}</optgroup>`).join('')
      + '<option value="otro">Otro producto Sony (no aparece en la lista)</option>';
  }
  $('productoId').addEventListener('change', (e) => {
    const otro = e.target.value === 'otro';
    $('bloqueOtro').classList.toggle('hidden', !otro);
    $('producto').required = otro;
  });
  const datosProducto = () => ($('productoId').value === 'otro'
    ? { producto: $('producto').value, categoria: $('categoria').value }
    : { productoId: Number($('productoId').value) });

  // ---------- Notificaciones ----------
  const textoNotif = (m) => m.replace(/cambió de estado a: (\w+)/, (_, e) => `cambió a: ${(App.ESTADOS[e] || {}).texto || e}`);
  let panelAbierto = false;

  async function cargarNotificaciones() {
    try {
      const { notificaciones, sinLeer } = await api('GET', '/notificaciones');
      $('contadorNotif').textContent = sinLeer;
      $('contadorNotif').classList.toggle('hidden', !sinLeer);
      $('panelNotif').innerHTML = notificaciones.length
        ? notificaciones.map((n) => `
            <div class="rounded-lg p-2 text-xs ${n.leido ? 'text-slate-500' : 'bg-sony-soft font-medium text-slate-800'}">
              <p>${esc(textoNotif(n.mensaje))}</p><time class="text-[11px] text-slate-500">${esc(fechaHora(n.fecha))}</time>
            </div>`).join('')
        : '<p class="p-3 text-xs text-slate-500">No tienes notificaciones.</p>';
    } catch { /* se reintenta en la siguiente actualización */ }
  }
  async function alternarPanel(abrir) {
    panelAbierto = abrir;
    $('panelNotif').classList.toggle('hidden', !abrir);
    $('btnCampana').setAttribute('aria-expanded', String(abrir));
    if (!abrir && Number($('contadorNotif').textContent) > 0) { // al cerrar, se marcan como leídas
      await api('POST', '/notificaciones/leer').catch(() => {});
      await cargarNotificaciones();
    }
  }
  $('btnCampana').addEventListener('click', () => alternarPanel(!panelAbierto));
  document.addEventListener('click', (e) => { if (panelAbierto && !e.target.closest('#btnCampana, #panelNotif')) alternarPanel(false); });

  // ---------- Formulario de nueva solicitud ----------
  const form = $('ticketForm');
  let fotoComprimida = null;
  $('fechaCompra').max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('descripcionFalla').addEventListener('input', (e) => { $('contador').textContent = e.target.value.length; });

  $('fotoEvidencia').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    fotoComprimida = null;
    $('vistaPrevia').classList.add('hidden');
    if (!archivo) return;
    try {
      fotoComprimida = await App.comprimirImagen(archivo);
      $('vistaPrevia').src = fotoComprimida;
      $('vistaPrevia').classList.remove('hidden');
    } catch (err) {
      e.target.value = '';
      toast(err.message, 'error');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('errorForm');
    error.classList.add('hidden');
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const { ticket } = await api('POST', '/tickets', {
        ...datosProducto(),
        numeroSerie: $('numeroSerie').value,
        numeroBoleta: $('numeroBoleta').value,
        fechaCompra: $('fechaCompra').value,
        descripcionFalla: $('descripcionFalla').value,
        evidencia: fotoComprimida,
      });
      form.reset();
      $('bloqueOtro').classList.add('hidden');
      $('producto').required = false;
      fotoComprimida = null;
      $('vistaPrevia').classList.add('hidden');
      $('contador').textContent = '0';
      tickets = [ticket, ...tickets];
      pintar();
      toast(`Solicitud ${ticket.codigo} registrada.`);
      if (ticket.garantiaVencida) toast('Tu garantía está vencida: confirma el costo de revisión en la tarjeta de la solicitud.', 'info');
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Enviar solicitud';
    }
  });

  // Actualiza solo cada 20 s para ver cambios de estado y mensajes nuevos.
  await Promise.all([cargar(), cargarNotificaciones(), cargarCatalogo().catch(() => {})]);
  setInterval(() => { if (!document.hidden && !document.querySelector('[role=dialog]')) { cargar(); cargarNotificaciones(); } }, 20000);
})();
