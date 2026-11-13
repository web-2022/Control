// ============================================================
// compartir.js — Botón "Compartir": envía el enlace de la app.
// Quien lo abre ve la página de bienvenida y entra con su Google.
// ============================================================
import { modal, copiar } from './ui.js';
import { ic } from './iconos.js';
import { URL_APP } from './config.js';
import { esc } from './util.js';

const TEXTO = 'Te comparto Control: una app para gestionar y controlar tus proyectos, pendientes y reuniones en tiempo real (captura por voz, seguimiento al equipo, cierre del día). Entra con tu cuenta de Google:';

export async function compartirApp() {
  if (navigator.share) {
    try { await navigator.share({ title: 'Control', text: TEXTO, url: URL_APP }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const msg = `${TEXTO} ${URL_APP}`;
  modal('Compartir Control', `
    <p>Envía este enlace a tu colega. Al abrirlo verá la página de bienvenida y entrará con su propia cuenta de Google; sus datos quedan en su Drive, separados de los tuyos.</p>
    <div class="enlace-compartir"><input readonly value="${esc(URL_APP)}" aria-label="Enlace"><button class="btn btn-pri" data-copiar>${ic('copiar')} Copiar</button></div>
    <div class="acciones-modal">
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>
      <a class="btn" href="mailto:?subject=${encodeURIComponent('Te comparto Control')}&body=${encodeURIComponent(msg)}">Correo</a>
    </div>`, (el) => {
    el.querySelector('[data-copiar]').onclick = () => copiar(msg);
  });
}

export function iniciarCompartir() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-compartir]')) { e.preventDefault(); compartirApp(); }
  });
}
