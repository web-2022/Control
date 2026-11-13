// ============================================================
// componentes.js — Fragmentos HTML reutilizables (filas, chips, selects).
// ============================================================
import { esc, fmtFecha, hoy, fmtMomento } from './util.js';
import { ic } from './iconos.js';
import * as M from './modelo.js';
import { ESTADOS, PRIORIDADES, ORIGENES, FASES } from './catalogo.js';
import * as store from './store.js';

/** Fila de un pendiente con check, datos y botones de posponer. */
export function filaPendiente(p, op = {}) {
  const H = hoy();
  const venc = M.esVencido(p, H);
  const hecho = p.estado === 'Hecho' || p.estado === 'Cancelado';
  const pr = M.proyecto(p.proyectoId);
  const chips = [];
  if (p.fecha) chips.push(`<span class="chip ${venc ? 'chip-rojo' : p.fecha === H ? 'chip-ambar' : ''}">${ic('reloj')}${esc(fmtFecha(p.fecha, H))}${p.hora ? ' · ' + esc(p.hora) : ''}</span>`);
  if (p.responsable && !op.sinPersona) chips.push(`<span class="chip">${ic('usuario')}${esc(M.nombrePersona(p.responsable).split(' ')[0])}</span>`);
  if (pr && !op.sinProyecto) chips.push(`<span class="chip"><i class="punto" style="background:${esc(pr.color || '#888')}"></i>${esc(pr.codigo || pr.nombre)}</span>`);
  if (p.estado && p.estado !== 'Pendiente' && !hecho) chips.push(`<span class="chip chip-estado est-${esc(p.estado.split(' ')[0].toLowerCase())}">${esc(p.estado)}</span>`);
  if (p.disciplina && !op.compacto) chips.push(`<span class="chip chip-tenue">${esc(p.disciplina)}</span>`);
  if (p.inbox && !op.sinInbox) chips.push(`<span class="chip chip-azul">${ic('inbox')}Inbox</span>`);
  return `
  <div class="fila prio-${esc(p.prioridad || 'media')} ${venc ? 'es-vencido' : ''} ${hecho ? 'es-hecho' : ''}" data-id="${esc(p.id)}" ${op.arrastrable ? 'draggable="true"' : ''}>
    <button class="chk ${hecho ? 'marcado' : ''}" data-acc="hecho" data-id="${esc(p.id)}" aria-label="${hecho ? 'Reabrir' : 'Marcar como hecho'}" title="${hecho ? 'Reabrir' : 'Marcar como hecho'}">${ic('check')}</button>
    <div class="fila-cuerpo" data-acc="abrir" data-id="${esc(p.id)}" tabindex="0" role="button">
      <div class="fila-tit">${p.prioridad === 'alta' ? `<span class="flag" title="Prioridad alta">${ic('bandera')}</span>` : ''}${esc(p.titulo || '(sin título)')}</div>
      ${chips.length ? `<div class="fila-meta">${chips.join('')}</div>` : ''}
      ${!op.compacto && M.ultimoComentario(p) ? `<div class="fila-com" title="${M.comentarios(p).length} comentarios">${ic('lista')}<time>${esc(fmtMomento(M.ultimoComentario(p).t))}</time><span>${esc(M.ultimoComentario(p).texto)}</span>${M.comentarios(p).length > 1 ? `<b>+${M.comentarios(p).length - 1}</b>` : ''}</div>` : ''}
    </div>
    ${hecho || op.sinPosponer ? '' : `<div class="fila-acc">
      <button class="mini" data-acc="comentar" data-id="${esc(p.id)}" title="Agregar comentario / avance">${ic('lista')}</button>
      <button class="mini" data-acc="posponer" data-dias="1" data-id="${esc(p.id)}" title="Posponer 1 día">+1d</button>
      <button class="mini" data-acc="posponer" data-dias="7" data-id="${esc(p.id)}" title="Posponer 1 semana">+1s</button>
    </div>`}
  </div>`;
}

/** Lista de pendientes con mensaje si está vacía. */
/** Secciones que el usuario expandió con "Mostrar más" (se mantiene mientras navega). */
export const expandidos = new Map();

/**
 * Lista de pendientes. Para no hacer lenta la app con miles de registros,
 * muestra los primeros 40 y un botón "Mostrar más".
 */
export function listaPendientes(lista, vacio = 'Nada por aquí', op = {}) {
  if (!lista.length) return `<div class="vacio">${esc(vacio)}</div>`;
  const clave = op.clave || `${lista.length}:${lista[0].id}`;
  const lim = expandidos.get(clave) || op.limite || 40;
  const visibles = lista.slice(0, lim);
  const resto = lista.length - visibles.length;
  return `<div class="lista">${visibles.map((p) => filaPendiente(p, op)).join('')}${resto > 0
    ? `<button class="mas-items" data-expandir="${esc(clave)}" data-lim="${lim + 100}">Mostrar ${Math.min(100, resto)} más <span>(${resto} restantes)</span></button>` : ''}</div>`;
}

/** Sección con título y contador. */
export function seccion(titulo, contenido, op = {}) {
  return `<section class="seccion ${op.clase || ''}">
    <h3 class="seccion-tit">${op.icono ? ic(op.icono) : ''}${esc(titulo)}${op.n !== undefined ? `<span class="contador ${op.colorN || ''}">${op.n}</span>` : ''}${op.extra || ''}</h3>
    ${contenido}
  </section>`;
}

// ---------------- Opciones para <select> ----------------
const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`;

export const optsPersonas = (sel, op = {}) =>
  (op.vacio ? opt('*', op.vacio, sel) : '')
  + opt('', (store.config().miNombre || 'Yo') + ' (yo)', sel)
  + M.personas().map((p) => opt(p.id, p.nombre, sel)).join('');

export const optsProyectos = (sel, op = {}) =>
  opt(op.vacioValor ?? '', op.vacio || '— Sin proyecto —', sel)
  + M.proyectos().map((p) => opt(p.id, p.nombre, sel)).join('');

export const optsEstados = (sel) => ESTADOS.map((e) => opt(e, e, sel)).join('');
export const optsPrioridad = (sel) => PRIORIDADES.map((e) => opt(e, e[0].toUpperCase() + e.slice(1), sel)).join('');
export const optsOrigen = (sel) => ORIGENES.map((e) => opt(e, e, sel)).join('');
export const optsFases = (sel, vacio = '— Fase —') => opt('', vacio, sel) + FASES.map((e) => opt(e, e, sel)).join('');
export const optsDisciplinas = (sel, vacio = '— Disciplina —') =>
  opt('', vacio, sel) + M.disciplinas().map((d) => opt(d.nombre, d.nombre, sel)).join('');

/** Barra horizontal simple para indicadores. */
export function barra(etiqueta, valor, max, op = {}) {
  const pct = max && valor ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  const pctV = max && op.rojo ? Math.round((op.rojo / max) * 100) : 0;
  return `<div class="barra-fila" ${op.href ? `data-href="${esc(op.href)}"` : ''}>
    <span class="barra-et">${op.color ? `<i class="punto" style="background:${esc(op.color)}"></i>` : ''}${esc(etiqueta)}</span>
    <span class="barra-pista"><span class="barra-val" style="width:${pct}%"></span>${pctV ? `<span class="barra-rojo" style="width:${pctV}%"></span>` : ''}</span>
    <span class="barra-num">${valor}${op.rojo ? ` <em>${op.rojo} venc.</em>` : ''}</span>
  </div>`;
}

/** Iniciales para avatar. */
export const iniciales = (nombre) => (nombre || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
