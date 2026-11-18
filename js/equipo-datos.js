// ============================================================
// equipo-datos.js — Datos del equipo en línea (jefe, líderes e
// ingenieros) que se comparten a través del servidor del equipo
// (apps-script/Equipo.gs, en el Drive del jefe).
//
// - Copia local en IndexedDB ("control-equipo"): funciona sin internet.
// - Los cambios esperan en una cola y se suben al sincronizar.
// - Cada persona recibe solo lo que puede ver (lo decide el servidor).
// ============================================================
import * as G from './google.js';
import * as store from './store.js';
import { uid, nowIso, hoy, debounce, fechaLocal, pad } from './util.js';

const TABLAS = ['tareas', 'miembros', 'planes'];
const CLAVE = 'control.equipo';
const CLAVE_COLA = 'control.equipo.cola';
const datos = Object.fromEntries(TABLAS.map((t) => [t, new Map()]));
const oyentes = new Set();
let db = null;
let estado = 'sin'; // sin | ok | sync | solicitud | inactivo | reauth | offline | error
let mensaje = '';
let enCurso = null;

// ---------------- Configuración local ----------------
export function cfg() { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; } }
function guardarCfg(c) { localStorage.setItem(CLAVE, JSON.stringify({ ...cfg(), ...c })); }
const cola = () => { try { return JSON.parse(localStorage.getItem(CLAVE_COLA) || '{}'); } catch { return {}; } };
const guardarCola = (o) => localStorage.setItem(CLAVE_COLA, JSON.stringify(o));

export const configurado = () => !!cfg().url;
export const activo = () => configurado() && cfg().estado === 'activo';
export const miEmail = () => (cfg().email || store.config().googleEmail || '').toLowerCase();
export const miRol = () => (activo() ? cfg().rol || 'ingeniero' : '');
export const esJefe = () => miRol() === 'jefe';
export const veEquipo = () => miRol() === 'jefe' || miRol() === 'lider';
export const configEquipo = () => ({ horaPlan: '9', dias: '1,2,3,4,5', correoRecordatorio: 'si', correoAsignacion: 'si', correoResumen: 'si', nombreEquipo: 'Mi equipo', ...(cfg().config || {}) });
export const estadoEquipo = () => ({ estado, mensaje, pendientes: Object.keys(cola()).length });

export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function emitir(tipo) { for (const fn of oyentes) { try { fn(tipo); } catch (e) { console.error(e); } } }
function ponerEstado(e, m = '') { estado = e; mensaje = m; emitir('estado'); }

// ---------------- IndexedDB ----------------
function abrir() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open('control-equipo', 1);
    r.onupgradeneeded = () => { for (const t of TABLAS) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
const tx = (t, modo, fn) => new Promise((ok, mal) => { const x = db.transaction(t, modo); fn(x.objectStore(t)); x.oncomplete = () => ok(); x.onerror = () => mal(x.error); });
const idbPoner = (t, regs) => (regs.length ? tx(t, 'readwrite', (st) => regs.forEach((r) => st.put(r))) : Promise.resolve());
const idbBorrar = (t, ids) => (ids.length ? tx(t, 'readwrite', (st) => ids.forEach((id) => st.delete(id))) : Promise.resolve());
const idbTodos = (t) => new Promise((ok, mal) => { const r = db.transaction(t).objectStore(t).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });

/** Normaliza lo que llega del servidor (todo viene como texto). */
function normalizar(t, r) {
  const o = { ...r };
  for (const k of ['deleted', 'visto']) o[k] = o[k] === true || o[k] === 'true';
  if (t === 'tareas') {
    if (typeof o.comentarios === 'string') { try { o.comentarios = o.comentarios ? JSON.parse(o.comentarios) : []; } catch { o.comentarios = []; } }
    if (!Array.isArray(o.comentarios)) o.comentarios = [];
    o.avance = Number(o.avance) || 0;
    o.estado = o.estado || 'pendiente';
  }
  delete o._srv;
  return o;
}

export async function iniciarEquipo() {
  if (!configurado()) return;
  db = await abrir();
  for (const t of TABLAS) for (const r of await idbTodos(t)) datos[t].set(r.id, r);
  estado = cfg().estado === 'activo' ? 'ok' : cfg().estado || 'sin';
  programar();
}

// ---------------- Lectura ----------------
/** Sugerencia aún sin tomar (o rechazada): no cuenta como pendiente de nadie. */
export const esSugerencia = (t) => t.sugerencia === 'pendiente' || t.sugerencia === 'rechazada';
export const tareas = () => [...datos.tareas.values()].filter((t) => !t.deleted && !esSugerencia(t));
export const sugerencias = () => [...datos.tareas.values()].filter((t) => !t.deleted && esSugerencia(t));
export const tarea = (id) => { const t = datos.tareas.get(id); return t && !t.deleted ? t : null; };
export const miembros = () => [...datos.miembros.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
export const activos = () => miembros().filter((m) => m.estado === 'activo');
export const solicitudes = () => miembros().filter((m) => m.estado === 'solicitud');
export const miembro = (email) => datos.miembros.get((email || '').toLowerCase()) || null;
export const nombreDe = (email) => miembro(email)?.nombre || (email || '').split('@')[0];
export const primerNombre = (email) => nombreDe(email).split(' ')[0];
export const plan = (email, fecha = hoy()) => datos.planes.get(`${email}|${fecha}`) || null;

/** Correos que puedo ver/asignar (igual que el servidor). */
export function visibles(email = miEmail()) {
  const yo = miembro(email);
  const act = activos();
  if (!yo) return [email];
  if (yo.rol === 'jefe') return act.map((m) => m.id);
  const r = [yo.id];
  if (yo.rol === 'lider') {
    const pila = [yo.id];
    while (pila.length) { const l = pila.shift(); for (const m of act) if (m.lider === l && !r.includes(m.id)) { r.push(m.id); if (m.rol === 'lider') pila.push(m.id); } }
  }
  return r;
}
/** Mi equipo (sin mí). */
export const miEquipo = () => visibles().filter((e) => e !== miEmail()).map(miembro).filter(Boolean);

/**
 * Estado del día de una persona.
 * Plan cargado = primera tarea propia creada hoy para hoy, o "Confirmar plan".
 */
export function estadoDia(email, fecha = hoy()) {
  const suyas = tareas().filter((t) => t.asignadoA === email);
  const delDia = suyas.filter((t) => t.fecha === fecha || (t.estado === 'hecho' && fechaLocal(t.completado) === fecha) || (t.estado !== 'hecho' && t.fecha && t.fecha < fecha && fecha === hoy()) || (!t.fecha && t.estado !== 'hecho' && fecha === hoy()));
  const propias = suyas.filter((t) => t.creadoPor === email && t.fecha === fecha && fechaLocal(t.creado) === fecha);
  const p = plan(email, fecha);
  const horas = propias.map((t) => t.creado);
  if (p?.enviado) horas.push(p.enviado);
  horas.sort();
  const hechas = delDia.filter((t) => t.estado === 'hecho');
  const ultima = suyas.map((t) => t.updatedAt || '').sort().pop() || '';
  return {
    planIso: horas[0] || '',
    total: delDia.length,
    hechas: hechas.length,
    curso: delDia.filter((t) => t.estado === 'curso').length,
    bloqueadas: suyas.filter((t) => t.estado === 'bloqueado').length,
    vencidas: suyas.filter((t) => t.estado !== 'hecho' && t.fecha && t.fecha < hoy()).length,
    nuevasSinVer: suyas.filter((t) => t.creadoPor !== email && !t.visto && t.estado !== 'hecho').length,
    cierre: p?.cierre || '',
    comentarioCierre: p?.comentario || '',
    ultima,
  };
}
/** ¿Ya pasó la hora límite del plan hoy? */
export function pasoHoraPlan(fecha = hoy()) {
  if (fecha !== hoy()) return fecha < hoy();
  return new Date().getHours() >= Number(configEquipo().horaPlan || 9);
}
export const esDiaLaborable = (fecha = hoy()) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return configEquipo().dias.split(',').map(Number).includes(new Date(y, m - 1, d).getDay());
};
export const horaCorta = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** ¿El plan se cargó a tiempo? 'ok' | 'tarde' | 'falta' | 'espera' */
export function semaforoPlan(email, fecha = hoy()) {
  const e = estadoDia(email, fecha);
  const limite = Number(configEquipo().horaPlan || 9);
  if (e.planIso) return fechaLocal(e.planIso) === fecha && new Date(e.planIso).getHours() < limite ? 'ok' : 'tarde';
  return pasoHoraPlan(fecha) ? 'falta' : 'espera';
}

// ---------------- Escritura ----------------
function encolar(t, r) { const o = cola(); o[`${t}:${r.id}`] = r.updatedAt; guardarCola(o); }

export async function guardarTarea(cambios) {
  const previo = cambios.id ? datos.tareas.get(cambios.id) : null;
  const ahora = nowIso();
  const r = { estado: 'pendiente', avance: 0, comentarios: [], prioridad: 'media', asignadoA: miEmail(), creadoPor: miEmail(), ...(previo || {}), ...cambios, updatedAt: ahora };
  if (!r.id) r.id = uid();
  if (!r.creado) r.creado = ahora;
  if (r.estado === 'hecho' && !r.completado) r.completado = ahora;
  if (r.estado !== 'hecho') r.completado = '';
  datos.tareas.set(r.id, r);
  await idbPoner('tareas', [r]);
  encolar('tareas', r);
  emitir('cambio');
  pronto();
  return r;
}
export async function comentarTarea(id, texto) {
  const t = datos.tareas.get(id);
  if (!t || !texto.trim()) return;
  const c = { ts: nowIso(), autor: miEmail(), texto: texto.trim().slice(0, 2000) };
  return guardarTarea({ id, comentarios: [...(t.comentarios || []), c] });
}
export const borrarTarea = (id) => guardarTarea({ id, deleted: true });
/** Respuesta a una sugerencia de un compañero. */
export function responderSugerencia(id, acepta, respuesta = '') {
  return guardarTarea({ id, sugerencia: acepta ? 'aceptada' : 'rechazada', respuesta: respuesta.slice(0, 500), visto: true, ...(acepta ? {} : { estado: 'pendiente' }) });
}

export async function guardarPlan(cambios, fecha = hoy()) {
  const id = `${miEmail()}|${fecha}`;
  const r = { ...(datos.planes.get(id) || { id, email: miEmail(), fecha, creado: nowIso() }), ...cambios, updatedAt: nowIso() };
  datos.planes.set(id, r);
  await idbPoner('planes', [r]);
  encolar('planes', r);
  emitir('cambio');
  pronto();
  return r;
}
/** Solo el jefe: crear/editar miembros (se aplica en el servidor). */
export async function guardarMiembro(m) {
  const id = (m.id || m.email || '').toLowerCase().trim();
  const r = { ...(datos.miembros.get(id) || {}), ...m, id, email: id, updatedAt: nowIso() };
  datos.miembros.set(id, r);
  await idbPoner('miembros', [r]);
  encolar('miembros', r);
  emitir('cambio');
  pronto();
  return r;
}
let configPorEnviar = null;
export function guardarConfigEquipo(c) {
  guardarCfg({ config: { ...configEquipo(), ...c } });
  configPorEnviar = { ...(configPorEnviar || {}), ...c };
  emitir('cambio');
  pronto();
}

// ---------------- Conexión ----------------
/** Conecta este dispositivo a un servidor de equipo (URL /exec). */
export async function conectar(url) {
  url = (url || '').trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) throw new Error('La dirección debe ser la URL de Apps Script que termina en /exec');
  if (cfg().url && cfg().url !== url) await olvidar(false);
  guardarCfg({ url, cursor: 0, huella: '', estado: 'conectando' });
  if (!db) db = await abrir();
  const r = await sincronizarEquipo({ lanzar: true });
  programar();
  return r;
}
/** Desconecta el equipo de este dispositivo (los datos siguen en el servidor). */
export async function olvidar(avisar = true) {
  localStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE_COLA);
  if (db) for (const t of TABLAS) { await idbBorrar(t, [...datos[t].keys()]); datos[t].clear(); }
  estado = 'sin';
  if (avisar) emitir('cambio');
}

async function llamar(cuerpo) {
  const token = G.tokenActual();
  if (!token) { const e = new Error('Reconecta con Google'); e.reauth = true; throw e; }
  const resp = await fetch(cfg().url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sin "preflight" (Apps Script no lo admite)
    body: JSON.stringify({ ...cuerpo, token, nombre: store.config().googleNombre || store.config().miNombre || '' }),
  });
  if (!resp.ok) throw new Error(`El servidor del equipo respondió ${resp.status}`);
  let json;
  try { json = await resp.json(); } catch { throw new Error('El servidor del equipo no respondió bien. ¿La implementación tiene acceso "Cualquier usuario"?'); }
  if (!json.ok) { const e = new Error(json.error || 'Error del servidor'); if (/^sesion/.test(json.error || '')) e.reauth = true; throw e; }
  return json;
}

export function sincronizarEquipo(op = {}) {
  if (enCurso) return enCurso;
  enCurso = _sync(op).finally(() => { enCurso = null; });
  return enCurso;
}

async function _sync({ lanzar = false } = {}) {
  if (!configurado()) return null;
  if (!navigator.onLine) { ponerEstado('offline', 'Sin conexión'); return null; }
  if (!G.tokenValido()) { ponerEstado('reauth', 'Reconecta con Google'); if (lanzar) { const e = new Error('Primero inicia sesión con Google'); e.reauth = true; throw e; } return null; }
  ponerEstado('sync', 'Sincronizando equipo…');
  const c = cola();
  const cambios = { tareas: [], planes: [], miembros: [] };
  for (const k of Object.keys(c)) {
    const [t, ...resto] = k.split(':');
    const r = datos[t]?.get(resto.join(':'));
    if (r) cambios[t].push({ ...r, comentarios: t === 'tareas' ? JSON.stringify(r.comentarios || []) : undefined });
  }
  const enviados = { ...c };
  try {
    const conf = configPorEnviar; configPorEnviar = null;
    const res = await llamar({ accion: conf ? 'config' : 'sync', config: conf || undefined, cursor: cfg().cursor || 0, huella: cfg().huella || '', cambios });
    guardarCfg({ email: res.email, estado: res.estado });
    if (res.estado !== 'activo') {
      ponerEstado(res.estado, res.estado === 'solicitud' ? 'Esperando aprobación del jefe' : 'Tu acceso al equipo está desactivado');
      emitir('cambio');
      return res;
    }
    // Quitar de la cola lo que se subió (si no cambió mientras tanto)
    const ahora = cola();
    for (const [k, v] of Object.entries(enviados)) if (ahora[k] === v) delete ahora[k];
    guardarCola(ahora);
    await aplicar(res);
    guardarCfg({ cursor: res.cursor, huella: res.huella, rol: res.rol, nombre: res.nombre, config: res.config, libroUrl: res.libroUrl || cfg().libroUrl || '', ultimaSync: nowIso() });
    ponerEstado(Object.keys(cola()).length ? 'pendiente' : 'ok');
    emitir('cambio');
    return res;
  } catch (e) {
    if (e.reauth) ponerEstado('reauth', e.message); else ponerEstado('error', e.message);
    if (lanzar) throw e;
    return null;
  }
}

async function aplicar(res) {
  const pendientes = cola();
  // Miembros: siempre llega la lista completa
  const ids = new Set(res.miembros.map((m) => m.id));
  const quitar = [...datos.miembros.keys()].filter((id) => !ids.has(id) && !pendientes[`miembros:${id}`]);
  quitar.forEach((id) => datos.miembros.delete(id));
  await idbBorrar('miembros', quitar);
  const mm = res.miembros.filter((m) => !pendientes[`miembros:${m.id}`]).map((m) => normalizar('miembros', m));
  mm.forEach((m) => datos.miembros.set(m.id, m));
  await idbPoner('miembros', mm);
  for (const t of ['tareas', 'planes']) {
    const llegan = res[t].map((r) => normalizar(t, r));
    if (res.completo) {
      // Recarga completa: quitar lo que ya no me corresponde ver
      const ids2 = new Set(llegan.map((r) => r.id));
      const fuera = [...datos[t].keys()].filter((id) => !ids2.has(id) && !pendientes[`${t}:${id}`]);
      fuera.forEach((id) => datos[t].delete(id));
      await idbBorrar(t, fuera);
    }
    const poner = [];
    for (const r of llegan) {
      const loc = datos[t].get(r.id);
      if (loc && pendientes[`${t}:${r.id}`] && (loc.updatedAt || '') > (r.updatedAt || '')) continue;
      datos[t].set(r.id, r); poner.push(r);
    }
    await idbPoner(t, poner);
  }
}

// ---------------- Programación ----------------
const pronto = debounce(() => sincronizarEquipo(), 1500);
let programado = false;
function programar() {
  if (programado) return;
  programado = true;
  sincronizarEquipo();
  setInterval(() => { if (document.visibilityState === 'visible' && configurado()) sincronizarEquipo(); }, 90000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && configurado()) sincronizarEquipo(); });
  window.addEventListener('online', () => configurado() && sincronizarEquipo());
}

/** Enlace de invitación para compartir por WhatsApp/correo. */
export function enlaceInvitacion() {
  const base = location.origin + location.pathname;
  return `${base}#/unirse?u=${encodeURIComponent(cfg().url || '')}&j=${encodeURIComponent((nombreDe(miEmail()) || '').split(' ')[0])}`;
}
