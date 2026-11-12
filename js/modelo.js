// ============================================================
// modelo.js — Reglas de negocio: qué está vencido, qué es de hoy,
// qué estoy esperando de otros, orden de prioridad, etc.
// ============================================================
import * as store from './store.js';
import { hoy, addDias, diffDias, inicioSemana } from './util.js';
import { ESTADOS_ABIERTOS, DISCIPLINAS } from './catalogo.js';

export const esAbierto = (p) => ESTADOS_ABIERTOS.includes(p.estado || 'Pendiente');
export const pendientes = () => store.todos('pendientes');
export const abiertos = () => pendientes().filter(esAbierto);
export const esVencido = (p, H = hoy()) => esAbierto(p) && !!p.fecha && p.fecha < H;
export const esDeHoy = (p, H = hoy()) => esAbierto(p) && p.fecha === H;
/** Lo que delegué o estoy esperando de un tercero. */
export const esEsperando = (p) => esAbierto(p) && (p.estado === 'Esperando a tercero' || !!p.responsable);
export const enInbox = (p) => esAbierto(p) && !!p.inbox;

const PESO_PRIO = { alta: 0, media: 1, baja: 2 };
/** Orden: vencidos/fecha más cercana primero, luego hora, luego prioridad. */
export function ordenar(a, b) {
  const fa = a.fecha || '9999-99-99', fb = b.fecha || '9999-99-99';
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ha = a.hora || '99:99', hb = b.hora || '99:99';
  if (ha !== hb) return ha < hb ? -1 : 1;
  const pa = PESO_PRIO[a.prioridad || 'media'], pb = PESO_PRIO[b.prioridad || 'media'];
  if (pa !== pb) return pa - pb;
  return (a.creado || '') < (b.creado || '') ? -1 : 1;
}

export const vencidos = () => abiertos().filter((p) => esVencido(p)).sort(ordenar);
export const deHoy = () => abiertos().filter((p) => esDeHoy(p)).sort(ordenar);
export const proximos = (dias = 7) => {
  const H = hoy(), lim = addDias(H, dias);
  return abiertos().filter((p) => p.fecha && p.fecha > H && p.fecha <= lim).sort(ordenar);
};
export const esperando = () => abiertos().filter(esEsperando).sort(ordenar);
export const inbox = () => abiertos().filter(enInbox).sort((a, b) => (a.creado < b.creado ? 1 : -1));

export const reunionesDe = (fecha) => store.todos('reuniones').filter((r) => r.fecha === fecha).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

export const personas = () => store.todos('personas').sort((a, b) => a.nombre.localeCompare(b.nombre));
export const proyectos = (soloActivos = false) =>
  store.todos('proyectos').filter((p) => !soloActivos || p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));

export const nombrePersona = (id) => store.nombrePersona(id);
export const proyecto = (id) => (id ? store.obtener('proyectos', id) : null);

/** Disciplinas configuradas (Ajustes) o las del catálogo. */
export function disciplinas() {
  const c = store.config().disciplinas;
  if (Array.isArray(c) && c.length) return c;
  return DISCIPLINAS;
}

/** Contexto que necesita el parser. */
export const contextoParser = () => ({ personas: personas(), proyectos: proyectos(), disciplinas: disciplinas() });

/** Indicadores para el tablero. */
export function indicadores() {
  const H = hoy();
  const todos = pendientes();
  const ab = todos.filter(esAbierto);
  // Cumplimiento: cerrados en los últimos 30 días que se cerraron a tiempo
  const hace30 = addDias(H, -30);
  const cerrados = todos.filter((p) => p.estado === 'Hecho' && p.cerrado && p.cerrado.slice(0, 10) >= hace30);
  const aTiempo = cerrados.filter((p) => !p.fecha || p.cerrado.slice(0, 10) <= p.fecha);
  // Antigüedad de los abiertos (días desde que se crearon)
  const buckets = { '0–7 d': 0, '8–14 d': 0, '15–30 d': 0, '> 30 d': 0 };
  for (const p of ab) {
    const dias = p.creado ? diffDias(H, p.creado.slice(0, 10)) : 0;
    if (dias <= 7) buckets['0–7 d']++;
    else if (dias <= 14) buckets['8–14 d']++;
    else if (dias <= 30) buckets['15–30 d']++;
    else buckets['> 30 d']++;
  }
  const semana = inicioSemana(H);
  return {
    abiertos: ab.length,
    vencidos: ab.filter((p) => esVencido(p, H)).length,
    hoy: ab.filter((p) => esDeHoy(p, H)).length,
    esperando: ab.filter(esEsperando).length,
    cerradosSemana: todos.filter((p) => p.estado === 'Hecho' && p.cerrado && p.cerrado.slice(0, 10) >= semana).length,
    cumplimiento: cerrados.length ? Math.round((aTiempo.length / cerrados.length) * 100) : null,
    cerrados30: cerrados.length,
    antiguedad: buckets,
    porProyecto: proyectos().map((pr) => ({
      id: pr.id, nombre: pr.nombre, color: pr.color,
      abiertos: ab.filter((p) => p.proyectoId === pr.id).length,
      vencidos: ab.filter((p) => p.proyectoId === pr.id && esVencido(p, H)).length,
    })).filter((x) => x.abiertos),
    porPersona: [{ id: '', nombre: store.config().miNombre || 'Yo' }, ...personas()].map((pe) => ({
      id: pe.id, nombre: pe.nombre,
      abiertos: ab.filter((p) => (p.responsable || '') === pe.id).length,
      vencidos: ab.filter((p) => (p.responsable || '') === pe.id && esVencido(p, H)).length,
    })).filter((x) => x.abiertos),
  };
}
