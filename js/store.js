// ============================================================
// store.js — Almacén local de datos (offline-first).
//
// - Todo se guarda en IndexedDB del navegador (funciona sin internet).
// - En memoria se mantiene una copia para que la app sea instantánea.
// - Cada cambio queda en la "bandeja de salida" (outbox) hasta que
//   sync.js lo sube a Google Sheets.
// - Nunca se borra físicamente: se marca deleted = true (borrado lógico),
//   así el borrado también se sincroniza.
// ============================================================
import { uid, nowIso } from './util.js';

export const TABLAS = ['pendientes', 'reuniones', 'acuerdos', 'personas', 'proyectos', 'diario', 'movimientos', 'cuentas'];

const DB_NOMBRE = 'control-db';
const CLAVE_CONFIG = 'control.config';
const CLAVE_OUTBOX = 'control.outbox';

let db = null;
const datos = Object.fromEntries(TABLAS.map((t) => [t, new Map()]));
const oyentes = new Set();

// ---------------- IndexedDB (envoltorio mínimo) ----------------
function abrirDB() {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB_NOMBRE, 4); // v2: diario · v3: movimientos · v4: cuentas (Caja)
    req.onupgradeneeded = () => {
      for (const t of TABLAS) if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}
function idbTodos(tabla) {
  return new Promise((ok, mal) => {
    const req = db.transaction(tabla).objectStore(tabla).getAll();
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}
function idbPoner(tabla, registros) {
  return new Promise((ok, mal) => {
    const tx = db.transaction(tabla, 'readwrite');
    const st = tx.objectStore(tabla);
    for (const r of registros) st.put(r);
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
}
function idbVaciar(tabla) {
  return new Promise((ok, mal) => {
    const tx = db.transaction(tabla, 'readwrite');
    tx.objectStore(tabla).clear();
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
}

// ---------------- Configuración (localStorage) ----------------
const CONFIG_DEFECTO = {
  apiUrl: '', token: '', miNombre: '', lastSync: '', tema: 'auto',
  notificaciones: false, avisoMin: 15, disciplinas: null, demo: false,
  modo: '', googleEmail: '', googleNombre: '', sheetId: '', sheetUrl: '',
  cajaCuentas: null, cajaPresupuestos: null, cajaCuentaDefecto: '', tipoCambio: '',
};
export function config() {
  try { return { ...CONFIG_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}') }; }
  catch { return { ...CONFIG_DEFECTO }; }
}
export function guardarConfig(cambios) {
  const c = { ...config(), ...cambios };
  localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c));
  emitir('config');
  return c;
}

// ---------------- Bandeja de salida ----------------
// Mapa "tabla:id" -> updatedAt del registro pendiente de subir.
export function outbox() {
  try { return JSON.parse(localStorage.getItem(CLAVE_OUTBOX) || '{}'); } catch { return {}; }
}
function guardarOutbox(o) { localStorage.setItem(CLAVE_OUTBOX, JSON.stringify(o)); }
function encolar(tabla, r) {
  const o = outbox();
  o[`${tabla}:${r.id}`] = r.updatedAt;
  guardarOutbox(o);
}
/** Quita de la cola lo que ya se subió (si no cambió mientras tanto). */
export function confirmarSubidos(lista) {
  const o = outbox();
  for (const { tabla, id, updatedAt } of lista) if (o[`${tabla}:${id}`] === updatedAt) delete o[`${tabla}:${id}`];
  guardarOutbox(o);
  emitir('outbox');
}
export const pendientesDeSubir = () => Object.keys(outbox()).length;
/** Pone un registro en la cola de subida sin modificarlo. */
export const marcarParaSubir = (tabla, r) => encolar(tabla, r);

// ---------------- Eventos ----------------
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function emitir(tipo, detalle) { for (const fn of oyentes) { try { fn(tipo, detalle); } catch (e) { console.error(e); } } }

// ---------------- API pública ----------------
export async function iniciar() {
  db = await abrirDB();
  for (const t of TABLAS) {
    for (const r of await idbTodos(t)) datos[t].set(r.id, r);
  }
}

/** Registros vigentes (no borrados) de una tabla. */
export const todos = (tabla) => [...datos[tabla].values()].filter((r) => !r.deleted);
export const obtener = (tabla, id) => { const r = datos[tabla].get(id); return r && !r.deleted ? r : null; };
/** Incluye borrados (para sincronizar). */
export const crudo = (tabla, id) => datos[tabla].get(id);

/**
 * Crea o actualiza un registro. Devuelve el registro guardado.
 * opciones.historial: texto a añadir al historial (solo pendientes).
 */
export async function guardar(tabla, registro, opciones = {}) {
  const ahora = nowIso();
  const previo = registro.id ? datos[tabla].get(registro.id) : null;
  const r = { ...(previo || {}), ...registro };
  if (!r.id) r.id = uid();
  if (!r.creado) r.creado = ahora;
  r.updatedAt = ahora;
  if (tabla === 'pendientes') registrarHistorial(previo, r, opciones.historial);
  datos[tabla].set(r.id, r);
  await idbPoner(tabla, [r]);
  encolar(tabla, r);
  emitir('cambio', { tabla, registro: r });
  return r;
}

/** Guarda varios registros de una vez (más rápido para datos de ejemplo). */
export async function guardarVarios(tabla, lista) {
  const ahora = nowIso();
  const res = lista.map((x) => ({ creado: ahora, ...x, id: x.id || uid(), updatedAt: ahora }));
  for (const r of res) { datos[tabla].set(r.id, r); encolar(tabla, r); }
  await idbPoner(tabla, res);
  emitir('cambio', { tabla });
  return res;
}

export async function borrar(tabla, id) {
  const r = datos[tabla].get(id);
  if (!r) return;
  await guardar(tabla, { id, deleted: true });
}

/** Aplica registros que vienen del servidor (gana el más reciente). */
export async function aplicarRemotos(tabla, lista) {
  const o = outbox();
  const aGuardar = [];
  for (const rem of lista) {
    if (!rem || !rem.id) continue;
    const loc = datos[tabla].get(rem.id);
    // Si hay un cambio local sin subir y es más nuevo, se conserva el local.
    if (loc && o[`${tabla}:${rem.id}`] && (loc.updatedAt || '') >= (rem.updatedAt || '')) continue;
    if (loc && (loc.updatedAt || '') >= (rem.updatedAt || '')) continue; // igual o más nuevo: nada que hacer
    delete rem._srv;
    datos[tabla].set(rem.id, rem);
    aGuardar.push(rem);
  }
  if (aGuardar.length) {
    await idbPoner(tabla, aGuardar);
    emitir('cambio', { tabla, remoto: true });
  }
  return aGuardar.length;
}

/** Borra TODOS los datos locales (no toca Google Sheets). */
export async function vaciarTodo() {
  for (const t of TABLAS) { datos[t].clear(); await idbVaciar(t); }
  guardarOutbox({});
  guardarConfig({ lastSync: '', demo: false });
  emitir('cambio', { tabla: '*' });
}

/** Exporta todo (respaldo JSON). */
export function exportarTodo() {
  return {
    app: 'Control', version: 1, exportado: nowIso(),
    datos: Object.fromEntries(TABLAS.map((t) => [t, [...datos[t].values()]])),
  };
}

/** Restaura un respaldo JSON (se fusiona, gana el más reciente). */
export async function importarTodo(json) {
  if (!json || !json.datos) throw new Error('Archivo de respaldo no válido');
  let total = 0;
  for (const t of TABLAS) {
    const lista = json.datos[t] || [];
    const nuevos = lista.filter((r) => {
      const loc = datos[t].get(r.id);
      return !loc || (loc.updatedAt || '') < (r.updatedAt || '');
    });
    for (const r of nuevos) { datos[t].set(r.id, r); encolar(t, r); }
    if (nuevos.length) await idbPoner(t, nuevos);
    total += nuevos.length;
  }
  emitir('cambio', { tabla: '*' });
  return total;
}

// ---------------- Historial de cambios de un pendiente ----------------
const CAMPOS_HIST = { estado: 'Estado', fecha: 'Fecha', responsable: 'Responsable', prioridad: 'Prioridad', proyectoId: 'Proyecto', titulo: 'Título' };
function registrarHistorial(previo, r, nota) {
  const h = Array.isArray(r.historial) ? [...r.historial] : [];
  const cuando = nowIso();
  if (!previo) {
    h.push({ t: cuando, m: 'Creado' });
  } else if (!r.deleted) {
    for (const [k, etiqueta] of Object.entries(CAMPOS_HIST)) {
      if ((previo[k] ?? '') !== (r[k] ?? '')) {
        let antes = previo[k] ?? '', despues = r[k] ?? '';
        if (k === 'responsable') { antes = nombrePersona(antes); despues = nombrePersona(despues); }
        if (k === 'proyectoId') { antes = obtener('proyectos', antes)?.nombre || '—'; despues = obtener('proyectos', despues)?.nombre || '—'; }
        h.push({ t: cuando, m: `${etiqueta}: ${antes || '—'} → ${despues || '—'}` });
      }
    }
  }
  if (nota) h.push({ t: cuando, m: nota });
  r.historial = h.slice(-50); // límite para no inflar la hoja
  // Fecha de cierre automática
  const cerrado = r.estado === 'Hecho' || r.estado === 'Cancelado';
  if (cerrado && !r.cerrado) r.cerrado = cuando;
  if (!cerrado) r.cerrado = '';
}

export function nombrePersona(id) {
  if (!id) return config().miNombre || 'Yo';
  return obtener('personas', id)?.nombre || id;
}
