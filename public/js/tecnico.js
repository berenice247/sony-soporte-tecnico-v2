// Panel del técnico: tomar órdenes, registrar diagnóstico y presupuesto, finalizar y chatear.
(async function () {
  'use strict';
  const { api, esc, toast, modal, badgeEstado, badgeGravedad, soles, fechaHora, acciones, chips, agruparPorCategoria } = App;
  const $ = (id) => document.getElementById(id);

  const usuario = await App.exigirRol('tecnico');
  const contenedor = $('tablaTickets');
  let tickets = [];
  let vista = 'mias';
  let filtroEstado = 'todas';

  const BORDE = { alta: 'border-l-sony', media: 'border-l-amber-500', baja: 'border-l-emerald-500' };
  const CERRADOS = ['resuelto', 'cancelado', 'reparacion_rechazada'];
  const esMio = (t) => t.tecnicoId === usuario.id;
  const porAtender = (t) => esMio(t) && ['en_revision', 'revisar_precio_tecnico', 'reparacion_aceptada'].includes(t.estado);
  const grupo = (t) => (CERRADOS.includes(t.estado) ? 'final' : porAtender(t) ? 'atender' : 'espera');

  function pintarChat(t) {
    const mensajes = t.mensajes.length
      ? t.mensajes.map((m) => `
          <div class="max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.remitente === 'TECNICO' ? 'ml-auto bg-sky-50' : 'bg-slate-100'}">
            <p class="mb-0.5 flex justify-between gap-3 text-[11px] text-slate-500"><strong>${esc(m.nombre)}</strong><time>${esc(fechaHora(m.fecha))}</time></p>
            <p class="whitespace-pre-wrap break-words text-slate-800">${esc(m.texto)}</p>
          </div>`).join('')
      : '<p class="text-xs text-slate-500">Aún no hay mensajes.</p>';
    return `
      <details class="rounded-xl border border-slate-200 p-3" ${t.mensajes.length ? 'open' : ''}>
        <summary class="cursor-pointer text-sm font-bold text-slate-800">Chat con el cliente (${t.mensajes.length})</summary>
        <div class="mt-3 flex max-h-60 flex-col gap-2 overflow-y-auto">${mensajes}</div>
        ${CERRADOS.includes(t.estado) ? '' : `
        <form data-form-chat data-id="${t.id}" class="mt-3 flex gap-2">
          <label for="chat-${t.id}" class="sr-only">Mensaje para el cliente</label>
          <input id="chat-${t.id}" type="text" required maxlength="1000" class="input" placeholder="Escribe un mensaje…" autocomplete="off">
          <button type="submit" class="btn-info btn-sm">Enviar</button>
        </form>`}
      </details>`;
  }

  function pintarAcciones(t) {
    if (t.estado === 'registrado' && !t.tecnicoId) {
      return `<button data-accion="tomar" data-id="${t.id}" class="btn-info btn-sm">Tomar orden y revisar</button>`;
    }
    if (!esMio(t)) return '';
    if (['en_revision', 'revisar_precio_tecnico'].includes(t.estado)) {
      return `<button data-accion="presupuesto" data-id="${t.id}" class="btn-info btn-sm">${t.diagnostico ? 'Modificar presupuesto' : 'Registrar diagnóstico y presupuesto'}</button>`;
    }
    if (t.estado === 'reparacion_aceptada') {
      return `<button data-accion="finalizar" data-id="${t.id}" class="btn-success btn-sm">Finalizar reparación</button>`;
    }
    return '';
  }

  function pintarTicket(t) {
    return `
    <article class="card-pad space-y-4 border-l-4 ${BORDE[t.gravedad] || ''}">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="flex flex-wrap items-center gap-2 text-xs"><span class="font-bold text-sony">${esc(t.codigo)}</span>${badgeGravedad(t.gravedad)}${t.garantiaVencida ? '<span class="badge-amber">Garantía vencida</span>' : '<span class="badge-green">En garantía</span>'}</p>
          <h3 class="mt-1 text-lg font-bold text-slate-900">${esc(t.producto)}</h3>
          <p class="text-xs text-slate-500">Cliente: ${esc(t.clienteNombre)} · Boleta ${esc(t.numeroBoleta)} · Compra ${esc(t.fechaCompra)} · Serie ${esc(t.numeroSerie)}</p>
        </div>
        ${badgeEstado(t.estado)}
      </header>

      ${t.estado === 'revisar_precio_tecnico' && t.comentarioAdmin ? `
        <div class="notice-warn"><strong>Observación del administrador:</strong> <span class="whitespace-pre-wrap break-words">${esc(t.comentarioAdmin)}</span></div>` : ''}

      <div class="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-100">
        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Falla reportada</p>
        <p class="whitespace-pre-wrap break-words text-slate-700">${esc(t.descripcionFalla)}</p>
        ${t.tieneEvidencia ? `<a href="/api/tickets/${t.id}/evidencia" target="_blank" rel="noopener" class="mt-3 inline-block">
            <img src="/api/tickets/${t.id}/evidencia" alt="Foto del daño" loading="lazy" class="h-24 rounded-lg object-cover ring-1 ring-slate-200"></a>` : ''}
      </div>

      ${t.diagnostico ? `
        <div class="notice-info space-y-1">
          <p class="whitespace-pre-wrap break-words"><strong>Diagnóstico:</strong> ${esc(t.diagnostico)}</p>
          <p><strong>Costo propuesto:</strong> ${t.aplicaGarantia ? 'Cubierto por garantía' : soles(t.costoPropuesto)}</p>
          ${t.solucion ? `<p class="whitespace-pre-wrap break-words"><strong>Solución:</strong> ${esc(t.solucion)}</p>` : ''}
        </div>` : ''}

      ${esMio(t) ? pintarChat(t) : ''}

      <footer class="flex flex-wrap gap-2 border-t border-slate-100 pt-3">${pintarAcciones(t)}</footer>
    </article>`;
  }

  function filtrados() {
    const texto = $('buscador').value.trim().toLowerCase();
    const gravedad = $('filtroGravedad').value;
    return tickets.filter((t) => {
      const enVista = vista === 'mias'
        ? esMio(t) && (filtroEstado === 'todas' || grupo(t) === filtroEstado)
        : !t.tecnicoId && t.estado === 'registrado';
      return enVista
        && (gravedad === 'todas' || t.gravedad === gravedad)
        && (!texto || t.codigo.toLowerCase().includes(texto) || t.producto.toLowerCase().includes(texto));
    });
  }

  function pintar() {
    $('statDisponibles').textContent = tickets.filter((t) => !t.tecnicoId && t.estado === 'registrado').length;
    $('statActivas').textContent = tickets.filter((t) => esMio(t) && !CERRADOS.includes(t.estado)).length;
    $('statPendientes').textContent = tickets.filter(porAtender).length;

    document.querySelectorAll('#tabs [data-vista]').forEach((b) => {
      const activa = b.dataset.vista === vista;
      b.setAttribute('aria-selected', String(activa));
      b.className = `rounded-md px-4 py-1.5 transition ${activa ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;
    });

    const mias = tickets.filter(esMio);
    const n = (g) => mias.filter((t) => grupo(t) === g).length;
    $('chipsEstado').classList.toggle('hidden', vista !== 'mias');
    $('chipsEstado').innerHTML = chips([
      { valor: 'todas', texto: 'Todas', n: mias.length },
      { valor: 'atender', texto: 'Por atender', n: n('atender') },
      { valor: 'espera', texto: 'En espera', n: n('espera') },
      { valor: 'final', texto: 'Finalizadas', n: n('final') },
    ], filtroEstado);

    const lista = filtrados();
    App.conservarEntradas(contenedor, () => {
      contenedor.innerHTML = lista.length
        ? agruparPorCategoria(lista, pintarTicket)
        : `<div class="card-pad py-12 text-center">
             <p class="font-semibold text-slate-800">${vista === 'mias' ? 'No tienes órdenes que coincidan' : 'No hay órdenes disponibles'}</p>
             <p class="mt-1 text-sm text-slate-500">${vista === 'mias' ? 'Toma una orden desde la pestaña "Disponibles".' : 'Vuelve más tarde o cambia los filtros.'}</p>
           </div>`;
    });
  }

  async function cargar() {
    try {
      tickets = (await api('GET', '/tickets')).tickets;
      pintar();
    } catch (err) {
      contenedor.innerHTML = `<div class="notice-bad">${esc(err.message)}</div>`;
    }
  }

  function reemplazar(ticket) {
    tickets = tickets.some((t) => t.id === ticket.id) ? tickets.map((t) => (t.id === ticket.id ? ticket : t)) : [ticket, ...tickets];
    pintar();
  }
  const buscar = (id) => tickets.find((t) => t.id === Number(id));

  acciones(contenedor, {
    tomar: async ({ id }) => {
      try {
        reemplazar((await api('POST', `/tickets/${id}/tomar`)).ticket);
        vista = 'mias';
        pintar();
        toast('Orden asignada a ti.');
      } catch (err) {
        await cargar(); // otro técnico pudo haberla tomado antes
        throw err;
      }
    },

    presupuesto: async ({ id }) => {
      const t = buscar(id);
      const datos = await modal({
        titulo: 'Diagnóstico técnico y presupuesto',
        descripcion: 'El presupuesto se enviará al administrador para su validación.',
        textoOk: 'Enviar a administración',
        claseOk: 'btn-info',
        campos: [
          { name: 'diagnostico', label: 'Diagnóstico del equipo', tipo: 'textarea', min: 10, max: 2000, required: true, valor: t.diagnostico || '' },
          { name: 'costo', label: 'Costo propuesto (S/)', tipo: 'number', min: 0, max: 99999.99, required: true, valor: t.costoPropuesto ?? 0 },
          { name: 'aplicaGarantia', label: 'Aplica garantía (sin costo)', tipo: 'checkbox', valor: t.aplicaGarantia || false,
            deshabilitado: t.garantiaVencida, ayuda: t.garantiaVencida ? 'No disponible: la garantía de este producto está vencida.' : '' },
        ],
      });
      if (!datos) return;
      reemplazar((await api('POST', `/tickets/${id}/diagnostico`, datos)).ticket);
      toast('Presupuesto enviado a administración.');
    },

    finalizar: async ({ id }) => {
      const datos = await modal({
        titulo: 'Conclusión del servicio técnico',
        descripcion: 'Describe las tareas realizadas y las piezas cambiadas para cerrar el ticket.',
        textoOk: 'Guardar y finalizar',
        claseOk: 'btn-success',
        campos: [{ name: 'solucion', label: 'Solución aplicada', tipo: 'textarea', min: 10, max: 2000, required: true }],
      });
      if (!datos) return;
      reemplazar((await api('POST', `/tickets/${id}/finalizar`, datos)).ticket);
      toast('Reparación finalizada.');
    },
  });

  contenedor.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form-chat]');
    if (!form) return;
    e.preventDefault();
    const campo = form.querySelector('input');
    const texto = campo.value.trim();
    if (!texto) return;
    campo.disabled = true;
    try {
      reemplazar((await api('POST', `/tickets/${form.dataset.id}/mensajes`, { texto })).ticket);
      document.getElementById(`chat-${form.dataset.id}`)?.focus();
    } catch (err) {
      toast(err.message, 'error');
      campo.disabled = false;
    }
  });

  $('chipsEstado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (b) { filtroEstado = b.dataset.filtro; pintar(); }
  });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]');
    if (b) { vista = b.dataset.vista; pintar(); }
  });
  $('buscador').addEventListener('input', pintar);
  $('filtroGravedad').addEventListener('change', pintar);

  await cargar();
  if (!tickets.some(esMio) && tickets.length) { vista = 'disponibles'; pintar(); }
  setInterval(() => { if (!document.hidden && !document.querySelector('[role=dialog]')) cargar(); }, 20000);
})();
