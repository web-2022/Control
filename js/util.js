// ============================================================
// util.js — Funciones auxiliares puras (sin DOM).
// Se usan tanto en el navegador como en las pruebas con Node.
// Las fechas se guardan SIEMPRE como texto 'AAAA-MM-DD' (hora local)
// y las horas como 'HH:MM'. Así Google Sheets no las altera.
// ============================================================

/** Id único corto, ordenable por tiempo. */
export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Normaliza texto: minúsculas y sin tildes (para buscar/comparar). */
export const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Igual que norm() pero conserva la LONGITUD exacta del texto,
 * carácter por carácter. El parser lo necesita para poder borrar del
 * texto original lo que encontró en el texto normalizado.
 */
export const normMismaLongitud = (s) =>
  s.split('').map((c) => (c.normalize('NFD')[0] || c).toLowerCase()[0]).join('');

export const pad = (n) => String(n).padStart(2, '0');

/** Date -> 'AAAA-MM-DD' en hora local. */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'AAAA-MM-DD' -> Date (medianoche local). */
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const hoy = () => ymd(new Date());

/** Suma n días a una fecha 'AAAA-MM-DD'. */
export const addDias = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/** Diferencia en días (a - b). */
export const diffDias = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);

/** Lunes de la semana de la fecha dada. */
export const inicioSemana = (s) => {
  const d = parseYmd(s);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return ymd(d);
};

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha amigable: Hoy, Mañana, Ayer, 'vie 14 nov'. */
export const fmtFecha = (s, ref = hoy()) => {
  if (!s) return '';
  const dd = diffDias(s, ref);
  if (dd === 0) return 'Hoy';
  if (dd === 1) return 'Mañana';
  if (dd === -1) return 'Ayer';
  const d = parseYmd(s);
  const base = `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() !== parseYmd(ref).getFullYear() ? `${base} ${d.getFullYear()}` : base;
};

/** 'jueves 12 de noviembre de 2026' */
export const fmtFechaLarga = (s) => {
  const d = parseYmd(s);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]} de ${d.getFullYear()}`;
};

export const nowIso = () => new Date().toISOString();

/** Escapa HTML para insertar texto del usuario de forma segura. */
export const esc = (s) =>
  (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Primera letra en mayúscula. */
export const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Agrupa una lista por la clave que devuelve fn. */
export const agrupar = (lista, fn) =>
  lista.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});

/** Retrasa la ejecución de fn hasta que pasen ms sin llamadas. */
export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/** Fecha local 'AAAA-MM-DD' de una marca de tiempo ISO (p. ej. cerrado, comentarios). */
export const fechaLocal = (iso) => (iso ? ymd(new Date(iso)) : '');

/** Siguiente día hábil (salta sábado y domingo). */
export const siguienteHabil = (s) => {
  let f = addDias(s, 1);
  while ([0, 6].includes(parseYmd(f).getDay())) f = addDias(f, 1);
  return f;
};

/** '12/11 18:30' */
export const fmtMomento = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
