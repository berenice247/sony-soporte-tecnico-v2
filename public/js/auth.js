// Pantalla de acceso: inicio de sesión y registro de clientes.
(function () {
  'use strict';
  const { api, esc } = App;
  const $ = (id) => document.getElementById(id);

  const RUTAS = { cliente: '/cliente.html', tecnico: '/tecnico.html', administrador: '/admin.html' };

  // Si ya hay una sesión activa, se entra directo al panel.
  api('GET', '/auth/sesion').then(({ usuario }) => { if (usuario) location.replace(RUTAS[usuario.rol]); }).catch(() => {});

  function mostrarTab(tab) {
    const login = tab === 'login';
    $('loginForm').classList.toggle('hidden', !login);
    $('registerForm').classList.toggle('hidden', login);
    $('tabLogin').setAttribute('aria-selected', String(login));
    $('tabRegistro').setAttribute('aria-selected', String(!login));
    $('tabLogin').className = `rounded-md py-2 transition ${login ? 'bg-sony text-white' : 'text-slate-400 hover:text-white'}`;
    $('tabRegistro').className = `rounded-md py-2 transition ${!login ? 'bg-sony text-white' : 'text-slate-400 hover:text-white'}`;
    error('');
  }
  function error(texto) {
    $('mensaje').textContent = texto;
    $('mensaje').classList.toggle('hidden', !texto);
  }

  async function enviar(form, ruta, cuerpo) {
    const boton = form.querySelector('[type=submit]');
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Un momento…';
    error('');
    try {
      const { usuario } = await api('POST', ruta, cuerpo);
      location.href = RUTAS[usuario.rol];
    } catch (err) {
      error(err.message);
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  $('tabLogin').addEventListener('click', () => mostrarTab('login'));
  $('tabRegistro').addEventListener('click', () => mostrarTab('registro'));

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const correo = $('correo').value.trim();
    const password = $('password').value;
    if (!correo || !password) return error('Ingresa tu correo y contraseña.');
    enviar(e.target, '/auth/login', { correo, password });
  });

  // Indicador en vivo de las reglas de contraseña (el servidor las vuelve a validar).
  $('regPassword').addEventListener('input', (e) => {
    const v = e.target.value;
    const cumple = { largo: v.length >= 8, letra: /[A-Za-z]/.test(v), numero: /\d/.test(v) };
    document.querySelectorAll('[data-regla]').forEach((li) => {
      const ok = cumple[li.dataset.regla];
      li.className = ok ? 'text-emerald-400' : 'text-slate-500';
      li.textContent = `${ok ? '✓' : '•'} ${li.textContent.slice(2)}`;
    });
  });

  $('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    enviar(e.target, '/auth/registro', {
      nombres: $('regNombres').value,
      apellidos: $('regApellidos').value,
      correo: $('regCorreo').value,
      password: $('regPassword').value,
    });
  });

  // Cuentas de prueba: el servidor solo las envía si DEMO_MODE=true.
  api('GET', '/auth/demo').then(({ cuentas }) => {
    if (!cuentas.length) return;
    $('demo').classList.remove('hidden');
    $('demoLista').innerHTML = cuentas.map((c) =>
      `<li><button type="button" data-correo="${esc(c.correo)}" data-password="${esc(c.password)}" class="w-full text-left hover:text-white">
         <span class="text-sony">${esc(c.rol)}:</span> ${esc(c.correo)}</button></li>`).join('');
    $('demoLista').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-correo]');
      if (!b) return;
      mostrarTab('login');
      $('correo').value = b.dataset.correo;
      $('password').value = b.dataset.password;
    });
  }).catch(() => {});

  mostrarTab('login');
})();
