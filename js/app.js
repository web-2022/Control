// ============================================================
// app.js — Punto de entrada: arranque, rutas, navegación,
// atajos de teclado, estado de sincronización y alertas.
// ============================================================
import * as store from './store.js';
import * as M from './modelo.js';
import * as V from './vistas.js';
import * as MD from './modales.js';
import { vistaDiario } from './diario.js';
import { iniciarAuto, alCambiarEstado, sincronizar } from './sync.js';
import { cargarDemo } from './demo.js';
import { cerrarModalSuperior, hayModal, enSilencio, toast } from './ui.js';
import { ic } from './iconos.js';
import { hoy, debounce } from './util.js';
import { vozDisponible } from './voz.js';

const $ = (s) => document.querySelector(s);
let limpiarVista = null;

// ---------------- Rutas ----------------
const RUTAS = {
  hoy: () => V.vistaHoy(),
  inbox: () => V.vistaInbox(),
  pendientes: () => V.vistaPendientes(),
  reuniones: () => V.vistaReuniones(),
  reunion: (id) => V.vistaReunion(id),
  equipo: () => V.vistaEquipo(),
  persona: (id) => V.vistaPersona(id),
  proyectos: () => V.vistaProyectos(),
  proyecto: (id) => V.vistaProyecto(id),
  revision: () => V.vistaRevision(),
  diario: () => vistaDiario(),
  ajustes: () => V.vistaAjustes(),
  mas: () => V.vistaMas(),
};

function rutaActual() {
  const h = location.hash.replace(/^#\/?/, '') || 'hoy';
  const [camino, consulta = ''] = h.split('?');
  const [nombre, param] = camino.split('/');
  const q = Object.fromEntries(new URLSearchParams(consulta));
  return { nombre: RUTAS[nombre] ? nombre : 'hoy', param: param ? decodeURIComponent(param) : null, q };
}

/** Dibuja la vista actual conservando foco y desplazamiento. */
function render(cambioDeRuta = false) {
  const { nombre, param, q } = rutaActual();
  if (cambioDeRuta && nombre === 'pendientes' && Object.keys(q).length) V.aplicarConsulta(q);
  const cont = $('#vista');
  const scroll = cambioDeRuta ? 0 : window.scrollY;
  const activo = document.activeElement;
  const focoId = !cambioDeRuta && activo && cont.contains(activo) ? (activo.id || activo.dataset?.filtro || null) : null;
  const selIni = focoId && 'selectionStart' in activo ? activo.selectionStart : null;

  limpiarVista?.();
  const v = RUTAS[nombre](param);
  cont.innerHTML = v.html;
  document.title = `${v.titulo} · Control`;
  v.montar?.(cont, () => render(false));
  limpiarVista = cont._limpiar || null;
  cont._limpiar = null;

  // Navegación activa
  const base = { reunion: 'reuniones', persona: 'equipo', proyecto: 'proyectos' }[nombre] || nombre;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('activo', a.dataset.nav === base || (a.dataset.nav === 'mas' && ['equipo', 'proyectos', 'revision', 'ajustes', 'diario'].includes(base))));
  actualizarContadores();

  window.scrollTo(0, scroll);
  if (focoId) {
    const el = document.getElementById(focoId) || cont.querySelector(`[data-filtro="${focoId}"]`);
    if (el) { el.focus(); if (selIni !== null) try { el.setSelectionRange(selIni, selIni); } catch { /* select */ } }
  }
}

const renderDiferido = debounce(() => render(false), 60);

function actualizarContadores() {
  const n = M.inbox().length;
  const v = M.vencidos().length;
  document.querySelectorAll('[data-badge="inbox"]').forEach((b) => { b.textContent = n || ''; b.hidden = !n; });
  document.querySelectorAll('[data-badge="vencidos"]').forEach((b) => { b.textContent = v || ''; b.hidden = !v; });
  if ('setAppBadge' in navigator) { (v ? navigator.setAppBadge(v) : navigator.clearAppBadge()).catch(() => {}); }
}

// ---------------- Acciones globales (delegación) ----------------
function enlazarAcciones() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (b) {
      const { acc, id } = b.dataset;
      if (acc === 'hecho') { e.preventDefault(); MD.alternarHecho(id); }
      else if (acc === 'abrir') { e.preventDefault(); MD.editarPendiente(id); }
      else if (acc === 'posponer') { e.preventDefault(); MD.posponer(id, Number(b.dataset.dias)); }
      else if (acc === 'comentar') { e.preventDefault(); MD.comentar(id); }
      return;
    }
    const h = e.target.closest('[data-href]');
    if (h) location.hash = h.dataset.href;
  });
  document.addEventListener('keydown', (e) => {
    // Enter sobre una fila enfocada la abre
    if (e.key === 'Enter' && e.target.matches?.('.fila-cuerpo')) { MD.editarPendiente(e.target.dataset.id); return; }
    if (e.key === 'Escape') { if (cerrarModalSuperior()) e.preventDefault(); return; }
    const escribiendo = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
    if (escribiendo || hayModal() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); MD.abrirCaptura(); }
    else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); MD.abrirCaptura({ voz: true }); }
    else if (e.key === '/') { e.preventDefault(); $('#buscar-global').focus(); }
    else if (e.key === 'g') { esperarSegunda(); }
  });
}
// Atajos "g h" (hoy), "g p" (pendientes), "g r" (reuniones), "g i" (inbox)
function esperarSegunda() {
  const fn = (e) => {
    const destino = { h: 'hoy', p: 'pendientes', r: 'reuniones', i: 'inbox', e: 'equipo', y: 'proyectos' }[e.key];
    if (destino) location.hash = `#/${destino}`;
    document.removeEventListener('keydown', fn, true);
  };
  document.addEventListener('keydown', fn, true);
  setTimeout(() => document.removeEventListener('keydown', fn, true), 1200);
}

// ---------------- Indicador de sincronización ----------------
function pintarSync(es) {
  const el = $('#sync');
  el.className = `sync sync-${es.estado}`;
  el.title = es.mensaje || '';
  el.querySelector('span').textContent = {
    local: 'Local', ok: 'Sincronizado', pendiente: `${es.pendientes} por subir`, sync: 'Sincronizando…', error: 'Error de sync', offline: 'Sin conexión',
  }[es.estado] || es.estado;
}

// ---------------- Alertas (notificaciones) ----------------
function revisarAlertas() {
  const cfg = store.config();
  if (!cfg.notificaciones || !('Notification' in window) || Notification.permission !== 'granted') return;
  const H = hoy();
  const ahora = new Date();
  const min = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const aviso = Number(cfg.avisoMin) || 15;
  let avisados = {};
  try { avisados = JSON.parse(localStorage.getItem('control.avisados') || '{}'); } catch { /* */ }
  const avisar = (clave, titulo, cuerpo, url) => {
    if (avisados[clave]) return;
    avisados[clave] = H;
    const op = { body: cuerpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: clave, data: { url } };
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(titulo, op)).catch(() => new Notification(titulo, op));
  };
  // Resumen de vencidos una vez al día
  const venc = M.vencidos();
  if (venc.length) avisar(`venc-${H}`, `${venc.length} pendientes vencidos`, venc.slice(0, 4).map((p) => '• ' + p.titulo).join('\n'), '#/pendientes?rango=vencidos');
  // Pendientes con hora y reuniones próximas
  for (const p of M.deHoy().filter((x) => x.hora)) {
    const d = min(p.hora) - ahoraMin;
    if (d >= 0 && d <= aviso) avisar(`p-${p.id}-${p.fecha}-${p.hora}`, `⏰ ${p.titulo}`, `Hoy a las ${p.hora}`, '#/hoy');
  }
  for (const r of M.reunionesDe(H).filter((x) => x.hora && x.estado === 'Programada')) {
    const d = min(r.hora) - ahoraMin;
    if (d >= 0 && d <= aviso) avisar(`r-${r.id}-${r.fecha}-${r.hora}`, `📅 ${r.titulo}`, `Empieza a las ${r.hora}`, `#/reunion/${r.id}`);
  }
  // Limpiar avisos antiguos
  for (const k of Object.keys(avisados)) if (avisados[k] < H) delete avisados[k];
  localStorage.setItem('control.avisados', JSON.stringify(avisados));
}

// ---------------- Arranque ----------------
async function iniciar() {
  const cfg = store.config();
  document.documentElement.dataset.tema = cfg.tema || 'auto';
  await store.iniciar();

  // Primera vez sin datos ni conexión: cargar ejemplo para explorar
  const vacio = store.TABLAS.every((t) => store.todos(t).length === 0);
  if (vacio && !cfg.apiUrl && !localStorage.getItem('control.iniciado')) {
    await cargarDemo();
  }
  localStorage.setItem('control.iniciado', '1');

  // Interfaz fija
  $('#fab-mas').addEventListener('click', () => MD.abrirCaptura());
  $('#fab-voz').addEventListener('click', () => MD.abrirCaptura({ voz: true }));
  if (!vozDisponible()) $('#fab-voz').classList.add('sin-voz');
  $('#sync').addEventListener('click', () => { if (store.config().apiUrl) sincronizar(); else location.hash = '#/ajustes'; });
  const buscar = $('#buscar-global');
  buscar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      V.aplicarConsulta({ reset: true });
      V.setBusqueda(buscar.value.trim());
      V.aplicarConsulta({ vista: 'lista' });
      buscar.blur();
      if (location.hash.startsWith('#/pendientes')) render(false); else location.hash = '#/pendientes';
    }
  });

  enlazarAcciones();
  window.addEventListener('hashchange', () => render(true));
  store.suscribir((tipo) => {
    if (tipo === 'cambio' && !enSilencio()) renderDiferido();
    if (tipo === 'cambio') actualizarContadores();
  });
  alCambiarEstado(pintarSync);
  render(true);
  iniciarAuto();

  // Atajos desde el ícono de la app (manifest shortcuts) o enlaces ?capturar=1 / ?voz=1
  const qs = new URLSearchParams(location.search);
  if (qs.has('voz')) MD.abrirCaptura({ voz: true });
  else if (qs.has('capturar')) MD.abrirCaptura();
  if (qs.has('voz') || qs.has('capturar')) history.replaceState(null, '', location.pathname + location.hash);

  setInterval(revisarAlertas, 60000);
  setTimeout(revisarAlertas, 3000);
  // Al cambiar de día, refrescar (vencidos, hoy)
  let dia = hoy();
  setInterval(() => { if (hoy() !== dia) { dia = hoy(); render(false); } }, 60000);

  // Service worker (PWA offline)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Hay una versión nueva de Control', {
              texto: 'Actualizar',
              fn: () => {
                navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
                nw.postMessage('activar');
              },
            }, 15000);
          }
        });
      });
    }).catch((e) => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.url) location.hash = e.data.url; });
  }
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('vista').innerHTML = `<div class="vacio vacio-grande"><b>No se pudo iniciar la app</b><span>${String(e.message || e)}</span></div>`;
});

export { ic };
