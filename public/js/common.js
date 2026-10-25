// Utilidades compartidas por todas las pantallas (sin dependencias).
(function () {
  'use strict';

  // ---------- Seguridad: todo texto que viene del usuario se escapa antes de pintarlo ----------
  const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);

  // ---------- API ----------
  async function api(metodo, ruta, cuerpo) {
    let res;
    try {
      res = await fetch(`/api${ruta}`, {
        method: metodo,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
      });
    } catch {
      throw Object.assign(new Error('No hay conexión con el servidor. Revisa tu internet.'), { status: 0 });
    }
    let datos = null;
    try { datos = await res.json(); } catch { /* sin cuerpo JSON */ }
    if (!res.ok) {
      if (res.status === 401 && !location.pathname.endsWith('index.html') && location.pathname !== '/') {
        location.href = '/index.html';
      }
      throw Object.assign(new Error(datos?.error || 'Ocurrió un error inesperado.'), { status: res.status });
    }
    return datos;
  }

  // ---------- Avisos (reemplazan a alert) ----------
  function toast(mensaje, tipo = 'ok') {
    let zona = document.getElementById('toasts');
    if (!zona) {
      zona = document.createElement('div');
      zona.id = 'toasts';
      zona.className = 'fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2';
      zona.setAttribute('aria-live', 'polite');
      document.body.appendChild(zona);
    }
    const colores = { ok: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-gray-800' };
    const el = document.createElement('div');
    el.className = `${colores[tipo] || colores.info} rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg`;
    el.textContent = mensaje;
    zona.appendChild(el);
    setTimeout(() => el.remove(), tipo === 'error' ? 6000 : 3500);
  }

  // ---------- Ventana modal con campos opcionales (reemplaza a confirm/prompt) ----------
  // campos: [{ name, label, tipo: 'textarea'|'number'|'checkbox'|'select'|'texto', min, max, required, valor, ayuda, deshabilitado, opciones }]
  function modal({ titulo, descripcion = '', campos = [], textoOk = 'Aceptar', claseOk = 'btn-primary', textoCancelar = 'Cancelar' }) {
    return new Promise((resolver) => {
      const previo = document.activeElement;
      const fondo = document.createElement('div');
      fondo.className = 'fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center';
      const html = campos.map((c) => {
        const id = `campo-${c.name}`;
        if (c.tipo === 'checkbox') {
          return `<label class="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" id="${id}" name="${esc(c.name)}" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-sony" ${c.valor ? 'checked' : ''} ${c.deshabilitado ? 'disabled' : ''}>
                    <span>${esc(c.label)}${c.ayuda ? `<span class="field-hint block">${esc(c.ayuda)}</span>` : ''}</span>
                  </label>`;
        }
        const control = c.tipo === 'select'
          ? `<select id="${id}" name="${esc(c.name)}" class="input" ${c.required ? 'required' : ''}>${c.opciones.map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(c.valor) ? 'selected' : ''}>${esc(o.texto)}</option>`).join('')}</select>`
          : c.tipo === 'texto'
            ? `<input id="${id}" name="${esc(c.name)}" type="text" class="input" maxlength="${c.max ?? 150}" value="${esc(c.valor ?? '')}" ${c.required ? 'required' : ''}>`
            : c.tipo === 'textarea'
              ? `<textarea id="${id}" name="${esc(c.name)}" rows="4" class="input" ${c.required ? 'required' : ''} minlength="${c.min ?? 0}" maxlength="${c.max ?? 2000}">${esc(c.valor ?? '')}</textarea>`
              : `<input id="${id}" name="${esc(c.name)}" type="number" step="0.01" min="${c.min ?? 0}" max="${c.max ?? 99999.99}" class="input" value="${esc(c.valor ?? '')}" ${c.required ? 'required' : ''}>`;
        return `<div><label for="${id}" class="field-label">${esc(c.label)}</label>${control}${c.ayuda ? `<p class="field-hint">${esc(c.ayuda)}</p>` : ''}</div>`;
      }).join('');
      fondo.innerHTML = `
        <form class="card w-full max-w-md space-y-4 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" novalidate>
          <div><h2 id="modal-titulo" class="text-lg font-bold text-slate-900">${esc(titulo)}</h2>
               ${descripcion ? `<p class="mt-1 text-sm text-slate-600">${esc(descripcion)}</p>` : ''}</div>
          ${html}
          <p class="hidden text-sm font-medium text-red-600" data-error role="alert"></p>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn-ghost btn-sm" data-cancelar>${esc(textoCancelar)}</button>
            <button type="submit" class="${claseOk} btn-sm">${esc(textoOk)}</button>
          </div>
        </form>`;
      document.body.appendChild(fondo);

      const form = fondo.querySelector('form');
      const error = fondo.querySelector('[data-error]');
      const cerrar = (valor) => { fondo.remove(); document.removeEventListener('keydown', alTeclear); previo?.focus?.(); resolver(valor); };
      const alTeclear = (e) => { if (e.key === 'Escape') cerrar(null); };
      document.addEventListener('keydown', alTeclear);
      fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(null); });
      fondo.querySelector('[data-cancelar]').addEventListener('click', () => cerrar(null));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const valores = {};
        for (const c of campos) {
          const el = form.elements[c.name];
          if (c.tipo === 'checkbox') { valores[c.name] = el.checked; continue; }
          const v = el.value.trim();
          if (c.required && !v) return mostrarError(`${c.label}: este campo es obligatorio.`);
          if (c.tipo === 'number') {
            const n = Number(v.replace(',', '.'));
            if (!Number.isFinite(n) || n < (c.min ?? 0)) return mostrarError(`${c.label}: ingresa un número mayor o igual a ${c.min ?? 0}.`);
            valores[c.name] = n;
          } else {
            if (c.min && v.length < c.min) return mostrarError(`${c.label}: escribe al menos ${c.min} caracteres.`);
            valores[c.name] = v;
          }
        }
        cerrar(valores);
      });
      function mostrarError(texto) { error.textContent = texto; error.classList.remove('hidden'); }

      (form.querySelector('textarea, input:not([disabled])') || form.querySelector('[type=submit]')).focus();
    });
  }

  const confirmar = (opciones) => modal({ textoOk: 'Confirmar', ...opciones }).then((r) => r !== null);

  // ---------- Formato ----------
  const ESTADOS = {
    registrado:                 { texto: 'Recepción registrada',         clase: 'badge-gray'   },
    en_revision:                { texto: 'En diagnóstico técnico',       clase: 'badge-blue'   },
    pendiente_aprobacion_admin: { texto: 'Presupuesto en revisión',      clase: 'badge-violet' },
    revisar_precio_tecnico:     { texto: 'Ajuste de presupuesto',        clase: 'badge-amber'  },
    presupuesto_enviado:        { texto: 'Esperando tu respuesta',       clase: 'badge-amber'  },
    reparacion_aceptada:        { texto: 'Reparación en proceso',        clase: 'badge-blue'   },
    reparacion_rechazada:       { texto: 'Reparación rechazada',         clase: 'badge-red'    },
    resuelto:                   { texto: 'Resuelto',                     clase: 'badge-green'  },
    cancelado:                  { texto: 'Cancelado',                    clase: 'badge-red'    },
  };
  const badgeEstado = (estado, textoPropio) => {
    const e = ESTADOS[estado] || { texto: estado, clase: 'badge-gray' };
    return `<span class="${e.clase}">${esc(textoPropio || e.texto)}</span>`;
  };
  const GRAVEDAD = { alta: 'badge-red', media: 'badge-amber', baja: 'badge-green' };
  const badgeGravedad = (g) => `<span class="${GRAVEDAD[g] || 'badge-gray'}">Prioridad ${esc(g || 'baja')}</span>`;
  const soles = (n) => `S/ ${Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fechaHora = (iso) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  // ---------- Sesión ----------
  const RUTAS = { cliente: '/cliente.html', tecnico: '/tecnico.html', administrador: '/admin.html' };

  async function exigirRol(rol) {
    try {
      const { usuario } = await api('GET', '/auth/me');
      if (usuario.rol !== rol) { location.replace(RUTAS[usuario.rol] || '/index.html'); return new Promise(() => {}); }
      document.querySelectorAll('[data-nombre-usuario]').forEach((el) => { el.textContent = `${usuario.nombres} ${usuario.apellidos}`; });
      document.querySelectorAll('[data-cerrar-sesion]').forEach((b) => b.addEventListener('click', cerrarSesion));
      return usuario;
    } catch {
      location.replace('/index.html');
      return new Promise(() => {});
    }
  }

  async function cerrarSesion() {
    try { await api('POST', '/auth/logout'); } finally { location.href = '/index.html'; }
  }

  // ---------- Imágenes: se reducen en el navegador antes de subirlas (evita fotos de 5 MB) ----------
  function comprimirImagen(archivo, ladoMax = 1280, calidad = 0.8) {
    return new Promise((resolver, rechazar) => {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return rechazar(new Error('Elige una imagen JPG, PNG o WEBP.'));
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(url);
        resolver(lienzo.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  // Escucha clics en elementos con data-accion dentro de un contenedor (no hay onclick en el HTML).
  function acciones(contenedor, manejadores) {
    contenedor.addEventListener('click', async (e) => {
      const boton = e.target.closest('[data-accion]');
      if (!boton || !contenedor.contains(boton)) return;
      const fn = manejadores[boton.dataset.accion];
      if (!fn) return;
      boton.disabled = true;
      try { await fn(boton.dataset, boton); } catch (err) { toast(err.message, 'error'); } finally { boton.disabled = false; }
    });
  }

  // Vuelve a pintar un contenedor sin perder lo que el usuario estaba escribiendo (chat, etc.).
  function conservarEntradas(contenedor, pintar) {
    const guardado = {};
    contenedor.querySelectorAll('input[id], textarea[id]').forEach((el) => { guardado[el.id] = el.value; });
    const enfocado = document.activeElement && contenedor.contains(document.activeElement) ? document.activeElement.id : null;
    pintar();
    for (const [id, valor] of Object.entries(guardado)) {
      const el = document.getElementById(id);
      if (el && valor) el.value = valor;
    }
    if (enfocado) document.getElementById(enfocado)?.focus();
  }

  // ---------- Orden: categorías, filtros y línea de tiempo ----------
  const CATEGORIAS = {
    'Consolas / Gaming': { icono: '🎮', nombre: 'Gaming / PlayStation' },
    'Televisores':       { icono: '📺', nombre: 'TV y video' },
    'Audio':             { icono: '🎧', nombre: 'Audio y sonido' },
    'Fotografía':        { icono: '📷', nombre: 'Cámaras / fotografía' },
  };
  const infoCategoria = (c) => CATEGORIAS[c] || { icono: '📦', nombre: c || 'Otros' };

  // Agrupa una lista por categoría (orden fijo) y pinta cada grupo con su título y contador.
  function agruparPorCategoria(lista, pintarItem, envoltorio = (html) => `<div class="space-y-4">${html}</div>`) {
    const extras = [...new Set(lista.map((x) => x.categoria).filter((c) => !CATEGORIAS[c]))];
    return [...Object.keys(CATEGORIAS), ...extras].map((cat) => {
      const items = lista.filter((x) => x.categoria === cat);
      if (!items.length) return '';
      const { icono, nombre } = infoCategoria(cat);
      return `<section class="space-y-3" aria-label="${esc(nombre)}">
        <h3 class="cat-titulo"><span aria-hidden="true">${icono}</span> ${esc(nombre)} <span class="badge-gray">${items.length}</span></h3>
        ${envoltorio(items.map(pintarItem).join(''))}
      </section>`;
    }).join('');
  }

  // Botones de filtro. opciones: [{ valor, texto, n }]; cada botón lleva data-<nombre>="valor".
  const chips = (opciones, activo, nombre = 'filtro') => opciones.map((o) =>
    `<button type="button" class="chip" data-${nombre}="${esc(o.valor)}" aria-pressed="${o.valor === activo}">${esc(o.texto)}${o.n !== undefined ? ` <span class="n">${o.n}</span>` : ''}</button>`).join('');

  // Historial de estados como línea de tiempo.
  const lineaTiempo = (historial = []) => historial.length
    ? `<ol class="relative ml-2 space-y-3 border-l border-line pl-4">${historial.map((h) => `
        <li class="relative text-xs"><span class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-sony"></span>
          <p class="font-semibold text-slate-800">${esc((ESTADOS[h.estado] || { texto: h.estado }).texto)}</p>
          <time class="text-slate-500">${esc(fechaHora(h.fecha))}</time></li>`).join('')}</ol>`
    : '<p class="text-xs text-slate-500">Sin movimientos todavía.</p>';

  window.App = { ESTADOS, CATEGORIAS, infoCategoria, agruparPorCategoria, chips, lineaTiempo, conservarEntradas, esc, api, toast, modal, confirmar, badgeEstado, badgeGravedad, soles, fechaHora, exigirRol, cerrarSesion, comprimirImagen, acciones };
})();
