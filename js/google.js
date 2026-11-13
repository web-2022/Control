// ============================================================
// google.js — "Continuar con Google": inicio de sesión y
// sincronización DIRECTA con una hoja en el Drive del usuario.
//
// - Sin Apps Script ni token: la app pide permiso con Google
//   Identity Services y crea sola la hoja "Control – Mis datos".
// - Permiso drive.file: la app solo puede ver los archivos que ella
//   misma creó. No ve el resto del Drive del usuario.
// - Cada usuario tiene su propia hoja; nadie más la ve.
// ============================================================
import * as store from './store.js';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, NOMBRE_HOJA } from './config.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const CLAVE_TOKEN = 'control.gtoken';

export const HOJAS = {
  pendientes: 'Pendientes', reuniones: 'Reuniones', acuerdos: 'Acuerdos',
  personas: 'Personas', proyectos: 'Proyectos', diario: 'Diario',
};
// Columnas de cada hoja. Los campos que no estén aquí van en "_extra" (JSON).
export const COLUMNAS = {
  pendientes: ['id', 'titulo', 'estado', 'prioridad', 'fecha', 'hora', 'responsable', 'proyectoId', 'disciplina', 'fase', 'origen', 'solicitante', 'descripcion', 'notas', 'comentarios', 'inbox', 'reunionId', 'creado', 'cerrado', 'historial', 'deleted', 'updatedAt', '_extra'],
  reuniones: ['id', 'titulo', 'fecha', 'hora', 'duracion', 'proyectoId', 'participantes', 'objetivo', 'minuta', 'estado', 'enlace', 'creado', 'deleted', 'updatedAt', '_extra'],
  acuerdos: ['id', 'reunionId', 'texto', 'responsable', 'fecha', 'pendienteId', 'creado', 'deleted', 'updatedAt', '_extra'],
  personas: ['id', 'nombre', 'rol', 'disciplina', 'email', 'telefono', 'empresa', 'creado', 'deleted', 'updatedAt', '_extra'],
  proyectos: ['id', 'nombre', 'codigo', 'cliente', 'fase', 'color', 'avance', 'disciplinas', 'hitos', 'descripcion', 'activo', 'creado', 'deleted', 'updatedAt', '_extra'],
  diario: ['id', 'fecha', 'comentario', 'hechos', 'avances', 'movidos', 'quedaron', 'pendientesAbiertos', 'cerradoA', 'creado', 'deleted', 'updatedAt', '_extra'],
};

/** Error que indica que hay que volver a iniciar sesión (token vencido). */
export class NecesitaLogin extends Error {
  constructor(m = 'Sesión de Google vencida') { super(m); this.name = 'NecesitaLogin'; }
}

export const configurado = () => !!GOOGLE_CLIENT_ID;

// ---------------- Token de acceso ----------------
let token = null;
let expira = 0;
try {
  const g = JSON.parse(localStorage.getItem(CLAVE_TOKEN) || 'null');
  if (g && g.e > Date.now()) { token = g.t; expira = g.e; }
} catch { /* sin token guardado */ }

export const tokenValido = () => !!token && Date.now() < expira - 60000;
export const minutosRestantes = () => Math.max(0, Math.round((expira - Date.now()) / 60000));

function guardarToken(t, segundos) {
  token = t;
  expira = Date.now() + (Number(segundos) || 3600) * 1000;
  localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ t: token, e: expira }));
}
function borrarToken() { token = null; expira = 0; localStorage.removeItem(CLAVE_TOKEN); }

// ---------------- Librería de Google (GIS) ----------------
let gis = null;
/** Carga la librería de Google una sola vez (conviene precargarla antes del clic). */
export function cargarGIS() {
  if (gis) return gis;
  gis = new Promise((ok, mal) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { gis = null; mal(new Error('No se pudo cargar Google. Revisa tu conexión.')); };
    document.head.appendChild(s);
  });
  return gis;
}

let cliente = null;
/**
 * Pide un token de acceso. Llamarla dentro de un clic del usuario
 * (si no, el navegador puede bloquear la ventana de Google).
 * prompt: '' = sin preguntar si ya dio permiso; 'select_account' = elegir cuenta.
 */
export async function pedirToken(prompt = '') {
  if (!configurado()) throw new Error('Falta configurar el inicio de sesión con Google (Client ID).');
  await cargarGIS();
  return new Promise((ok, mal) => {
    if (!cliente) {
      cliente = window.google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_SCOPES, callback: () => {} });
    }
    cliente.callback = (r) => {
      if (r.error) { mal(new Error(r.error_description || r.error)); return; }
      if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/drive.file')) {
        mal(new Error('Debes permitir que Control cree y use su hoja en tu Google Drive (marca la casilla de Drive).'));
        return;
      }
      guardarToken(r.access_token, r.expires_in);
      ok(token);
    };
    cliente.error_callback = (e) => mal(new Error(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google' : (e?.message || 'No se pudo iniciar sesión')));
    const op = { prompt };
    const email = store.config().googleEmail;
    if (email) op.hint = email;
    cliente.requestAccessToken(op);
  });
}

/** Inicio de sesión completo: token + datos del usuario. */
export async function iniciarSesion() {
  await pedirToken('select_account');
  const yo = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  return { email: yo.email, nombre: yo.name || '', foto: yo.picture || '' };
}

export function cerrarSesion() {
  try { if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {}); } catch { /* */ }
  borrarToken();
}

// ---------------- Llamadas a las APIs de Google ----------------
async function api(url, op = {}) {
  if (!tokenValido()) throw new NecesitaLogin();
  const resp = await fetch(url, {
    ...op,
    headers: { Authorization: `Bearer ${token}`, ...(op.body ? { 'Content-Type': 'application/json' } : {}), ...(op.headers || {}) },
  });
  if (resp.status === 401) { borrarToken(); throw new NecesitaLogin(); }
  const txt = await resp.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!resp.ok) {
    const e = new Error(json.error?.message || `Error ${resp.status} de Google`);
    e.status = resp.status;
    throw e;
  }
  return json;
}
const enc = encodeURIComponent;

// ---------------- Hoja del usuario ----------------
let hojasVerificadas = false;

/** Busca la hoja de la app en el Drive del usuario; si no existe, la crea. */
export async function asegurarHoja() {
  const cfg = store.config();
  if (cfg.sheetId) {
    try {
      const r = await api(`${DRIVE}/${cfg.sheetId}?fields=id,trashed`);
      if (!r.trashed) { await asegurarPestanas(cfg.sheetId); return cfg.sheetId; }
    } catch (e) { if (e instanceof NecesitaLogin) throw e; }
  }
  // ¿Ya la creó en otro dispositivo?
  const q = `appProperties has { key='controlApp' and value='1' } and trashed=false`;
  const lista = await api(`${DRIVE}?q=${enc(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive`);
  let id = lista.files?.[0]?.id;
  if (!id) id = await crearHoja();
  store.guardarConfig({ sheetId: id, sheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit` });
  await asegurarPestanas(id);
  return id;
}

async function crearHoja() {
  const tablas = Object.keys(HOJAS);
  const nueva = await api(SHEETS, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: NOMBRE_HOJA, locale: 'es_PE', timeZone: 'America/Lima' },
      sheets: tablas.map((t) => ({
        properties: { title: HOJAS[t], gridProperties: { rowCount: 500, columnCount: COLUMNAS[t].length + 5, frozenRowCount: 1 } },
      })),
    }),
  });
  const id = nueva.spreadsheetId;
  await api(`${SHEETS}/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: tablas.map((t) => ({ range: `${HOJAS[t]}!A1`, values: [COLUMNAS[t]] })) }),
  });
  // Encabezados en negrita y fondo oscuro (estético)
  const req = nueva.sheets.map((s) => ({
    repeatCell: {
      range: { sheetId: s.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.12, green: 0.16, blue: 0.22 } } },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  }));
  await api(`${SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: req }) }).catch(() => {});
  // Marca para reconocerla desde otros dispositivos
  await api(`${DRIVE}/${id}`, { method: 'PATCH', body: JSON.stringify({ appProperties: { controlApp: '1' } }) });
  return id;
}

/** Agrega pestañas que falten (por ejemplo, en versiones nuevas de la app). */
async function asegurarPestanas(id) {
  if (hojasVerificadas) return;
  const info = await api(`${SHEETS}/${id}?fields=sheets.properties.title`);
  const existentes = new Set((info.sheets || []).map((s) => s.properties.title));
  const faltan = Object.keys(HOJAS).filter((t) => !existentes.has(HOJAS[t]));
  if (faltan.length) {
    await api(`${SHEETS}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: faltan.map((t) => ({ addSheet: { properties: { title: HOJAS[t], gridProperties: { rowCount: 500, columnCount: COLUMNAS[t].length + 5, frozenRowCount: 1 } } } })) }),
    });
    await api(`${SHEETS}/${id}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: faltan.map((t) => ({ range: `${HOJAS[t]}!A1`, values: [COLUMNAS[t]] })) }),
    });
  }
  hojasVerificadas = true;
}

// ---------------- Conversión fila <-> registro ----------------
function aCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && v.length > 49000) return v.slice(0, 49000);
  return v;
}
function deCelda(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    try { return JSON.parse(s); } catch { return v; }
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
}
function aFila(r, enc) {
  const extras = {};
  for (const k of Object.keys(r)) if (!enc.includes(k) && k !== '_srv') extras[k] = r[k];
  return enc.map((k) => (k === '_extra' ? (Object.keys(extras).length ? JSON.stringify(extras) : '') : aCelda(r[k])));
}
function deFila(fila, enc) {
  const r = {};
  enc.forEach((k, i) => {
    const v = fila[i];
    if (v === '' || v === undefined || v === null) return;
    if (k === '_extra') { try { Object.assign(r, JSON.parse(v)); } catch { /* */ } return; }
    r[k] = deCelda(v);
  });
  return r;
}

// ---------------- Sincronización ----------------
/** Baja la hoja, mezcla con lo local (gana lo más reciente) y sube lo pendiente. */
export async function sincronizarGoogle() {
  const id = await asegurarHoja();
  const tablas = Object.keys(HOJAS);
  const lectura = await api(`${SHEETS}/${id}/values:batchGet?${tablas.map((t) => `ranges=${enc(HOJAS[t])}`).join('&')}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`);

  const remoto = {};
  const actualizarEnc = [];
  tablas.forEach((t, i) => {
    const filas = lectura.valueRanges?.[i]?.values || [];
    let encab = (filas[0] || []).map(String);
    const faltan = COLUMNAS[t].filter((c) => !encab.includes(c));
    if (!encab.length || faltan.length) {
      encab = [...encab, ...faltan];
      actualizarEnc.push({ range: `${HOJAS[t]}!A1`, values: [encab] });
    }
    const fila = {}, upd = {}, regs = [];
    filas.slice(1).forEach((f, j) => {
      const r = deFila(f, encab);
      if (!r.id) return;
      r.id = String(r.id);
      fila[r.id] = j + 2; // número de fila en la hoja
      upd[r.id] = String(r.updatedAt || '');
      regs.push(r);
    });
    remoto[t] = { encab, fila, upd, regs, ultima: filas.length };
  });
  if (actualizarEnc.length) {
    await api(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: actualizarEnc }) });
  }

  // 1. Aplicar lo remoto (otros dispositivos)
  for (const t of tablas) await store.aplicarRemotos(t, remoto[t].regs);

  // 2. Subir la bandeja de salida
  const cola = store.outbox();
  const cambios = [];
  const nuevos = {};
  const enviados = [];
  for (const clave of Object.keys(cola)) {
    const [t, rid] = clave.split(':');
    if (!remoto[t]) continue;
    const r = store.crudo(t, rid);
    if (!r) continue;
    enviados.push({ tabla: t, id: rid, updatedAt: r.updatedAt });
    const R = remoto[t];
    if (R.fila[rid]) {
      if ((R.upd[rid] || '') > (r.updatedAt || '')) continue; // la hoja tiene una versión más nueva
      cambios.push({ range: `${HOJAS[t]}!A${R.fila[rid]}`, values: [aFila(r, R.encab)] });
    } else {
      (nuevos[t] ||= []).push(aFila(r, R.encab));
    }
  }
  for (let i = 0; i < cambios.length; i += 300) {
    await api(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: cambios.slice(i, i + 300) }) });
  }
  for (const [t, filas] of Object.entries(nuevos)) {
    await api(`${SHEETS}/${id}/values/${enc(HOJAS[t] + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', body: JSON.stringify({ values: filas }),
    });
  }
  if (enviados.length) store.confirmarSubidos(enviados);
  store.guardarConfig({ lastSync: new Date().toISOString() });
  return { subidos: enviados.length };
}
