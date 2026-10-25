// Tema claro / oscuro: se aplica antes de pintar la página (sin parpadeo) y se recuerda en el navegador.
(function () {
  'use strict';
  const CLAVE = 'sony_tema';
  const leer = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
  const guardar = (t) => { try { localStorage.setItem(CLAVE, t); } catch { /* modo privado */ } };

  let actual = leer() === 'claro' ? 'claro' : 'oscuro'; // por defecto, oscuro
  document.documentElement.dataset.tema = actual;

  document.addEventListener('DOMContentLoaded', () => {
    const zona = document.querySelector('header [data-cerrar-sesion]')?.parentElement;
    if (!zona) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tema-btn';
    const pintar = () => {
      boton.textContent = actual === 'oscuro' ? '☀️ Claro' : '🌙 Oscuro';
      boton.setAttribute('aria-label', actual === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    };
    boton.addEventListener('click', () => {
      actual = actual === 'oscuro' ? 'claro' : 'oscuro';
      document.documentElement.dataset.tema = actual;
      guardar(actual);
      pintar();
    });
    pintar();
    zona.prepend(boton);
  });
})();
