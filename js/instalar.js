// ============================================================
// instalar.js — Botón "Instalar app" (PWA).
// - Android / Chrome / Edge: usa el aviso de instalación del navegador.
// - iPhone / iPad (Safari): muestra los pasos "Compartir → Agregar a inicio".
// - Si la app ya está instalada (abierta desde el ícono), el botón se oculta.
// ============================================================
import { modal, toast } from './ui.js';

let aviso = null; // evento beforeinstallprompt guardado

export const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esSafariIOS = () => esIOS() && !/crios|fxios|edgios/i.test(navigator.userAgent);

/** ¿Tiene sentido mostrar el botón? */
export const puedeInstalar = () => !yaInstalada() && (!!aviso || esIOS() || /android/i.test(navigator.userAgent));

function actualizarBotones() {
  document.querySelectorAll('[data-instalar]').forEach((b) => { b.hidden = !puedeInstalar(); });
}

export function iniciarInstalacion() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // lo mostramos nosotros con el botón
    aviso = e;
    actualizarBotones();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    actualizarBotones();
    toast('✔ Control quedó instalada. Ábrela desde el ícono de tu pantalla.');
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-instalar]')) { e.preventDefault(); instalar(); }
  });
  actualizarBotones();
}
export { actualizarBotones };

export async function instalar() {
  if (yaInstalada()) { toast('La app ya está instalada'); return; }
  if (aviso) {
    aviso.prompt();
    const { outcome } = await aviso.userChoice;
    if (outcome === 'accepted') aviso = null;
    actualizarBotones();
    return;
  }
  // Sin aviso automático: mostrar pasos según el teléfono
  const ios = esIOS();
  modal('Instalar Control en tu celular', ios ? `
    ${esSafariIOS() ? '' : '<p class="aviso">En iPhone la instalación solo funciona desde <b>Safari</b>. Abre esta página en Safari.</p>'}
    <ol class="pasos-instalar">
      <li>Toca el botón <b>Compartir</b> <span class="tecla">⬆︎</span> (abajo en la barra de Safari).</li>
      <li>Desliza y elige <b>“Agregar a inicio”</b>.</li>
      <li>Pulsa <b>Agregar</b>. Aparecerá el ícono <b>Control</b> en tu pantalla.</li>
    </ol>
    <p class="nota">Desde el ícono se abre a pantalla completa, como una app normal, y funciona sin internet.</p>` : `
    <ol class="pasos-instalar">
      <li>Abre esta página en <b>Chrome</b>.</li>
      <li>Toca el menú <span class="tecla">⋮</span> (arriba a la derecha).</li>
      <li>Elige <b>“Instalar app”</b> o <b>“Agregar a pantalla principal”</b>.</li>
      <li>Confirma con <b>Instalar</b>. Aparecerá el ícono <b>Control</b> en tu pantalla.</li>
    </ol>
    <p class="nota">Si no ves la opción, recarga la página y espera unos segundos.</p>`,
  (el, cerrar) => {
    el.querySelector('.modal-cuerpo').insertAdjacentHTML('beforeend', '<div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri" data-ok>Entendido</button></div>');
    el.querySelector('[data-ok]').onclick = cerrar;
  });
}
