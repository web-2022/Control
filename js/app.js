// ============================================================
// app.js — Punto de entrada: arranque, rutas, navegación,
// atajos de teclado, estado de sincronización y alertas.
// ============================================================
import * as store from './store.js';
import * as M from './modelo.js';
import * as V from './vistas.js';
import * as MD from './modales.js';
import { expandidos } from './componentes.js';
import { vistaDiario } from './diario.js';
import { vistaCaja } from './caja.js';
import * as EQV from './equipo.js';
import * as EQ from './equipo-datos.js';
import { iniciarInstalacion, actualizarBotones } from './instalar.js';
import { vistaBienvenida } from './bienvenida.js';
import { iniciarCompartir } from './compartir.js';
import * as G from './google.js';
import { iniciarAlertas } from './alertas.js';
import { iniciarAuto, alCambiarEstado, sincronizar, estadoSync, reconectarGoogle, conectado } from './sync.js';
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
  caja: () => vistaCaja(),
  ajustes: () => V.vistaAjustes(),
  mas: () => V.vistaMas(),
  bienvenida: () => vistaBienvenida(),
  midia: () => EQV.vistaMiDia(),
  panel: (_, q) => EQV.vistaPanelJefe(q.vista),
  miembros: () => EQV.vistaMiembros(),
  unirse: (_, q) => EQV.vistaUnirse(q),
};

function rutaActual() {
  const inicio = EQ.configurado() && EQ.miRol() !== 'jefe' ? 'midia' : 'hoy';
  const h = location.hash.replace(/^#\/?/, '') || inicio;
  const [camino, consulta = ''] = h.split('?');
  const [nombre, param] = camino.split('/');
  const q = Object.fromEntries(new URLSearchParams(consulta));
  if (nombre === 'midia' && EQ.esJefe()) return { nombre: 'panel', param: null, q: { vista: 'midia' } };
  return { nombre: RUTAS[nombre] ? nombre : inicio, param: param ? decodeURIComponent(param) : null, q };
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
  const v = RUTAS[nombre](param, q);
  document.body.classList.toggle('modo-limpio', v.layout === 'limpio');
  cont.innerHTML = v.html;
  document.title = `${v.titulo} · Control`;
  v.montar?.(cont, () => render(false));
  limpiarVista = cont._limpiar || null;
  cont._limpiar = null;

  // Navegación activa
  const base = { reunion: 'reuniones', persona: 'equipo', proyecto: 'proyectos', miembros: 'panel' }[nombre] || nombre;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('activo', a.dataset.nav === base || (a.dataset.nav === 'mas' && ['equipo', 'proyectos', 'revision', 'ajustes', 'diario', 'caja', ...(EQ.veEquipo() ? [] : ['panel']), ...(EQ.miRol() === 'ingeniero' ? [] : ['midia'])].includes(base))));
  actualizarContadores();
  actualizarBotones();

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
  // Equipo en línea: mostrar u ocultar accesos y contadores
  // "Mi día" se muestra apenas se une (aunque esté esperando aprobación) para que vea su estado
  const enEquipo = EQ.configurado();
  const rol = EQ.miRol();
  document.querySelectorAll('[data-solo-equipo]').forEach((a) => {
    a.hidden = !enEquipo || (rol === 'jefe' && a.dataset.nav === 'midia');
  });
  document.querySelectorAll('[data-solo-lider]').forEach((a) => { a.hidden = !EQ.veEquipo(); });
  // Celular: ingeniero y líder tienen "Mi día" abajo (el líder en lugar de "Hoy"; el jefe conserva "Hoy")
  document.querySelectorAll('[data-solo-ingeniero]').forEach((a) => { a.hidden = !(enEquipo && rol !== 'jefe'); });
  document.querySelectorAll('.nav-inferior [data-sin-equipo]').forEach((a) => { a.hidden = enEquipo; });
  document.querySelectorAll('.nav-inferior [data-nav="hoy"]').forEach((a) => { a.hidden = rol === 'lider'; });
  const ce = EQV.contadoresEquipo();
  document.querySelectorAll('[data-badge="midia"]').forEach((b) => { b.textContent = ce.midia || ''; b.hidden = !ce.midia; });
  document.querySelectorAll('[data-badge="panel"]').forEach((b) => { b.textContent = ce.panel || ''; b.hidden = !ce.panel; });
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
    const x = e.target.closest('[data-expandir]');
    if (x) { e.preventDefault(); expandidos.set(x.dataset.expandir, Number(x.dataset.lim)); render(false); return; }
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
    local: 'Local', ok: 'Sincronizado', reauth: 'Reconectar', pendiente: `${es.pendientes} por subir`, sync: 'Sincronizando…', error: 'Error de sync', offline: 'Sin conexión',
  }[es.estado] || es.estado;
}

// ---------------- Arranque ----------------
async function iniciar() {
  const cfg = store.config();
  document.documentElement.dataset.tema = cfg.tema || 'auto';
  await store.iniciar();
  await EQ.iniciarEquipo().catch((e) => console.warn('Equipo', e));

  // Primera vez (sin datos ni conexión): página de bienvenida
  const vacio = store.TABLAS.every((t) => store.todos(t).length === 0);
  if (vacio && !conectado(cfg) && !localStorage.getItem('control.iniciado') && !location.hash.startsWith('#/unirse') && !localStorage.getItem('control.invitacion')) {
    location.hash = '#/bienvenida';
  } else if (!localStorage.getItem('control.iniciado')) {
    localStorage.setItem('control.iniciado', '1');
  }
  // Invitación pendiente (abrió el enlace, pero instaló la app o entró con Google por otro lado)
  try {
    const inv = JSON.parse(localStorage.getItem('control.invitacion') || 'null');
    if (inv?.u && !EQ.configurado() && !location.hash.startsWith('#/unirse')) location.hash = `#/unirse?u=${encodeURIComponent(inv.u)}&j=${encodeURIComponent(inv.j || '')}`;
    if (EQ.configurado()) localStorage.removeItem('control.invitacion');
  } catch { /* */ }
  // Precargar Google para que "reconectar" abra su ventana al primer toque
  if (cfg.modo === 'google' && G.configurado()) G.cargarGIS().catch(() => {});

  // Interfaz fija
  $('#fab-mas').addEventListener('click', () => MD.abrirCaptura());
  $('#fab-voz').addEventListener('click', () => MD.abrirCaptura({ voz: true }));
  if (!vozDisponible()) $('#fab-voz').classList.add('sin-voz');
  $('#sync').addEventListener('click', async () => {
    if (estadoSync().estado === 'reauth') {
      try { await reconectarGoogle(); toast('Reconectado con Google'); EQ.sincronizarEquipo(); } catch (e) { toast(e.message); }
    } else if (conectado()) sincronizar();
    else location.hash = '#/ajustes';
  });
  // Si la sesión de Google venció (dura ~1 h), reconectar al primer toque del usuario
  let ultimoIntento = 0;
  document.addEventListener('pointerdown', () => {
    if (store.config().modo === 'google' && estadoSync().estado === 'reauth' && G.configurado() && window.google?.accounts
      && Date.now() - ultimoIntento > 120000) {
      ultimoIntento = Date.now();
      reconectarGoogle().then(() => EQ.sincronizarEquipo()).catch(() => {});
    }
  }, { capture: true });
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
  iniciarInstalacion();
  iniciarCompartir();
  window.addEventListener('hashchange', () => render(true));
  store.suscribir((tipo) => {
    if (tipo === 'cambio' && !enSilencio()) renderDiferido();
    if (tipo === 'cambio') actualizarContadores();
  });
  alCambiarEstado(pintarSync);
  EQ.suscribir((tipo) => { if (!enSilencio() && (tipo === 'cambio' || /^(midia|panel|miembros)/.test(location.hash.slice(2)))) renderDiferido(); actualizarContadores(); });
  render(true);
  iniciarAuto();

  // Atajos desde el ícono de la app (manifest shortcuts) o enlaces ?capturar=1 / ?voz=1
  const qs = new URLSearchParams(location.search);
  if (qs.has('voz')) MD.abrirCaptura({ voz: true });
  else if (qs.has('capturar')) MD.abrirCaptura();
  if (qs.has('voz') || qs.has('capturar')) history.replaceState(null, '', location.pathname + location.hash);

  iniciarAlertas();
  // Al cambiar de día, refrescar (vencidos, hoy)
  let dia = hoy();
  setInterval(() => { if (hoy() !== dia) { dia = hoy(); render(false); } }, 60000);

  // Service worker (PWA offline)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Al llegar una versión nueva se recarga sola (si no estás escribiendo en un formulario)
    let recargando = false;
    const recargar = () => {
      if (recargando) return;
      if (document.querySelector('.modal, dialog[open]')) { setTimeout(recargar, 3000); return; }
      recargando = true; location.reload();
    };
    if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', recargar);
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      const revisar = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
      setInterval(revisar, 30 * 60 * 1000);
      if (reg.waiting) reg.waiting.postMessage('activar');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) { toast('Actualizando Control…'); nw.postMessage('activar'); }
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
