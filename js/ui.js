// ============================================================
// ui.js — Piezas de interfaz reutilizables: ventanas modales,
// avisos (toast), confirmaciones, copiar y descargar archivos.
// ============================================================
import { ic } from './iconos.js';
import { esc } from './util.js';

let pilaModales = [];

/**
 * Abre una ventana modal.
 * @param {string} titulo
 * @param {string} html     contenido
 * @param {(el, cerrar) => void} montar  para enlazar eventos
 * @param {object} op { ancho: 'normal'|'ancho', alCerrar }
 */
export function modal(titulo, html, montar, op = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ${op.ancho === 'ancho' ? 'modal-ancho' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="modal-cab">
        <h2>${esc(titulo)}</h2>
        <button class="icon-btn" data-cerrar aria-label="Cerrar">${ic('x')}</button>
      </header>
      <div class="modal-cuerpo">${html}</div>
    </div>`;
  document.body.appendChild(fondo);
  document.body.classList.add('con-modal');
  requestAnimationFrame(() => fondo.classList.add('visible'));

  const cerrar = () => {
    pilaModales = pilaModales.filter((m) => m !== cerrar);
    fondo.classList.remove('visible');
    setTimeout(() => {
      fondo.remove();
      if (!pilaModales.length) document.body.classList.remove('con-modal');
    }, 160);
    op.alCerrar?.();
  };
  pilaModales.push(cerrar);
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
  montar?.(fondo.querySelector('.modal'), cerrar);
  const foco = fondo.querySelector('[autofocus]');
  if (foco) setTimeout(() => foco.focus(), 60);
  return cerrar;
}

/** Cierra el modal superior (tecla Esc). Devuelve true si cerró alguno. */
export function cerrarModalSuperior() {
  const c = pilaModales[pilaModales.length - 1];
  if (c) { c(); return true; }
  return false;
}
export const hayModal = () => pilaModales.length > 0;

/** Aviso breve en la parte inferior. accion: { texto, fn } opcional (p. ej. Deshacer). */
export function toast(msg, accion, ms = 3500) {
  const cont = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${accion ? `<button class="toast-acc">${esc(accion.texto)}</button>` : ''}`;
  cont.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  const quitar = () => { t.classList.remove('visible'); setTimeout(() => t.remove(), 200); };
  if (accion) t.querySelector('.toast-acc').addEventListener('click', () => { accion.fn(); quitar(); });
  setTimeout(quitar, ms);
}

/** Confirmación con promesa. */
export function confirmar(msg, textoOk = 'Aceptar', peligro = false) {
  return new Promise((ok) => {
    let respondido = false;
    modal('Confirmar', `<p class="confirmar-msg">${esc(msg)}</p>
      <div class="acciones-modal"><button class="btn" data-no>Cancelar</button>
      <button class="btn ${peligro ? 'btn-peligro' : 'btn-pri'}" data-si autofocus>${esc(textoOk)}</button></div>`,
    (el, cerrar) => {
      el.querySelector('[data-no]').onclick = () => { respondido = true; ok(false); cerrar(); };
      el.querySelector('[data-si]').onclick = () => { respondido = true; ok(true); cerrar(); };
    }, { alCerrar: () => { if (!respondido) ok(false); } });
  });
}

/** Copia texto al portapapeles. */
export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado al portapapeles'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = texto; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('Copiado');
  }
}

/** Descarga un archivo generado en el navegador. */
export function descargar(nombre, contenido, tipo = 'text/plain') {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- Control del re-dibujado ---
// Cuando guardamos desde un campo que el usuario está escribiendo
// (p. ej. la minuta), no queremos redibujar la pantalla y perder el cursor.
let silencio = 0;
export async function sinRefrescar(fn) { silencio++; try { return await fn(); } finally { setTimeout(() => silencio--, 0); } }
export const enSilencio = () => silencio > 0;

/** Lee un formulario a objeto (respeta checkboxes y selects múltiples). */
export function leerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); }
      else o[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.multiple) o[el.name] = [...el.selectedOptions].map((x) => x.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}
