// ============================================================
// sync.js — Sincronización con Google Sheets (vía Apps Script).
//
// Flujo:
//   1. SUBIR: envía los registros de la bandeja de salida.
//   2. BAJAR: pide al servidor lo que cambió desde la última vez
//      (por ejemplo, lo que editaste desde otro dispositivo).
// Se ejecuta: al abrir la app, 2 s después de cada cambio, al volver
// la conexión, al regresar a la pestaña y cada 60 s.
// Si no hay internet, los cambios esperan en la cola sin perderse.
// ============================================================
import * as store from './store.js';
import * as G from './google.js';

let estado = 'local';     // local | ok | pendiente | sync | error | offline | reauth
let mensaje = '';
let enCurso = null;
const oyentes = new Set();

export const estadoSync = () => ({ estado, mensaje, pendientes: store.pendientesDeSubir() });
export function alCambiarEstado(fn) { oyentes.add(fn); fn(estadoSync()); }
function poner(e, m = '') { estado = e; mensaje = m; for (const fn of oyentes) fn(estadoSync()); }

/** Llamada al Web App de Apps Script. */
export async function llamarApi(accion, extra = {}, cfg = store.config()) {
  if (!cfg.apiUrl) throw new Error('Falta la URL del Apps Script (Ajustes)');
  // Content-Type text/plain evita la verificación CORS "preflight",
  // que Apps Script no soporta.
  const resp = await fetch(cfg.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion, token: cfg.token, ...extra }),
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error del servidor');
  return json;
}

/** Sincroniza ahora. Si ya hay una en curso, devuelve la misma promesa. */
export function sincronizar() {
  if (enCurso) return enCurso;
  enCurso = _sincronizar().finally(() => { enCurso = null; });
  return enCurso;
}

/** ¿Hay alguna conexión configurada (Google o Apps Script)? */
export const conectado = (cfg = store.config()) => cfg.modo === 'google' || !!(cfg.apiUrl && cfg.token);

async function _sincronizar() {
  const cfg = store.config();
  if (!conectado(cfg)) { poner('local', 'Solo en este dispositivo'); return; }
  if (!navigator.onLine) { poner('offline', 'Sin conexión'); return; }
  if (cfg.modo === 'google') {
    if (!G.tokenValido()) { poner('reauth', 'Toca para reconectar con Google'); return; }
    poner('sync', 'Sincronizando…');
    try {
      await G.sincronizarGoogle();
      const p = store.pendientesDeSubir();
      poner(p ? 'pendiente' : 'ok', p ? `${p} por subir` : 'Sincronizado con Google');
    } catch (e) {
      console.warn('Sync Google', e);
      if (e instanceof G.NecesitaLogin) poner('reauth', 'Toca para reconectar con Google');
      else poner(navigator.onLine ? 'error' : 'offline', navigator.onLine ? `Error: ${e.message}` : 'Sin conexión');
    }
    return;
  }
  poner('sync', 'Sincronizando…');
  try {
    // 1. SUBIR
    const cola = store.outbox();
    const porTabla = {};
    const enviados = [];
    for (const clave of Object.keys(cola)) {
      const [tabla, id] = clave.split(':');
      const r = store.crudo(tabla, id);
      if (!r) continue;
      (porTabla[tabla] ||= []).push(r);
      enviados.push({ tabla, id, updatedAt: r.updatedAt });
    }
    if (enviados.length) {
      // En lotes de 200 para no superar límites de Apps Script
      const lotes = [];
      for (const [tabla, lista] of Object.entries(porTabla)) {
        for (let i = 0; i < lista.length; i += 200) lotes.push({ [tabla]: lista.slice(i, i + 200) });
      }
      for (const datos of lotes) await llamarApi('subir', { datos }, cfg);
      store.confirmarSubidos(enviados);
    }
    // 2. BAJAR
    const resp = await llamarApi('bajar', { desde: cfg.lastSync || '' }, cfg);
    for (const [tabla, lista] of Object.entries(resp.datos || {})) {
      if (store.TABLAS.includes(tabla)) await store.aplicarRemotos(tabla, lista);
    }
    store.guardarConfig({ lastSync: resp.horaServidor });
    const p = store.pendientesDeSubir();
    poner(p ? 'pendiente' : 'ok', p ? `${p} por subir` : 'Sincronizado');
  } catch (e) {
    console.warn('Sync', e);
    poner(navigator.onLine ? 'error' : 'offline', navigator.onLine ? `Error: ${e.message}` : 'Sin conexión');
  }
}

let temporizador = null;
/** Programa una sincronización en 2 s (agrupa varios cambios seguidos). */
export function programar() {
  clearTimeout(temporizador);
  if (conectado()) poner(estado === 'reauth' ? 'reauth' : 'pendiente', estado === 'reauth' ? mensaje : `${store.pendientesDeSubir()} por subir`);
  temporizador = setTimeout(sincronizar, 2000);
}

/** Reconecta con Google (llamar desde un clic) y sincroniza. */
export async function reconectarGoogle() {
  await G.pedirToken('');
  return sincronizar();
}

/** Marca todo lo local para subirlo (al conectar una hoja nueva). */
export async function encolarTodo() {
  for (const t of store.TABLAS) for (const r of store.todos(t)) store.marcarParaSubir(t, r);
}

/** Activa la sincronización automática. */
export function iniciarAuto() {
  store.suscribir((tipo, d) => { if (tipo === 'cambio' && !d?.remoto) programar(); });
  window.addEventListener('online', sincronizar);
  window.addEventListener('offline', () => poner('offline', 'Sin conexión'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 60000);
  sincronizar();
}
