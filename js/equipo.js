// ============================================================
// equipo.js — Pantallas del equipo en línea:
//   #/midia     Mi día: cada ingeniero carga sus pendientes de la
//               mañana, ve lo que le asignaron y cierra su día.
//   #/panel     Panel del equipo (jefe y líderes): plan de las 9:00,
//               avance, bloqueos y vencidos de cada persona; asignar.
//   #/miembros  Miembros y configuración (solo el jefe).
//   #/unirse    Enlace de invitación para un ingeniero nuevo.
// ============================================================
import * as EQ from './equipo-datos.js';
import * as store from './store.js';
import * as G from './google.js';
import { parsear } from './parser.js';
import { modal, toast, confirmar, copiar, leerForm } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, fmtFecha, fmtFechaLarga, fmtMomento, addDias, inicioSemana, fechaLocal, siguienteHabil } from './util.js';
import { iniciales } from './componentes.js';

const ESTADOS = {
  pendiente: { txt: 'Pendiente', ic: '○' },
  curso: { txt: 'En curso', ic: '◐' },
  bloqueado: { txt: 'Bloqueado', ic: '⛔' },
  hecho: { txt: 'Hecho', ic: '✓' },
};
const ROLES = { jefe: 'Jefe', lider: 'Líder', ingeniero: 'Ingeniero' };
const SIGUIENTE = { pendiente: 'curso', curso: 'hecho', bloqueado: 'curso', hecho: 'pendiente' };
const PRIO = { alta: 0, media: 1, baja: 2 };

const cab = (titulo, sub = '', acciones = '') => `
  <header class="vista-cab">
    <div><h1>${esc(titulo)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <div class="vista-acc">${acciones}</div>
  </header>`;

const hace = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return fmtFecha(fechaLocal(iso));
};
const ordenar = (a, b) => {
  const H = hoy();
  const va = a.fecha && a.fecha < H ? 0 : 1, vb = b.fecha && b.fecha < H ? 0 : 1;
  return va - vb || (ESTADOS[a.estado] && a.estado === 'bloqueado' ? -1 : 0) - (b.estado === 'bloqueado' ? -1 : 0)
    || (PRIO[a.prioridad] ?? 1) - (PRIO[b.prioridad] ?? 1) || (a.fecha || '9').localeCompare(b.fecha || '9') || (a.creado || '').localeCompare(b.creado || '');
};

// ---------------- Fila de una tarea ----------------
function filaTarea(t, op = {}) {
  const H = hoy();
  const venc = t.estado !== 'hecho' && t.fecha && t.fecha < H;
  const chips = [];
  if (t.fecha) chips.push(`<span class="chip ${venc ? 'chip-rojo' : t.fecha === H ? 'chip-ambar' : ''}">${ic('reloj')}${venc ? 'Venció ' : ''}${esc(fmtFecha(t.fecha, H))}</span>`);
  if (t.estado === 'curso') chips.push(`<span class="chip chip-azul">En curso${t.avance ? ` · ${t.avance}%` : ''}</span>`);
  if (t.estado === 'bloqueado') chips.push(`<span class="chip chip-rojo" title="${esc(t.motivo || '')}">⛔ Bloqueado${t.motivo ? ': ' + esc(t.motivo.slice(0, 40)) : ''}</span>`);
  if (op.para && t.asignadoA !== EQ.miEmail()) chips.push(`<span class="chip">${ic('usuario')}${esc(EQ.primerNombre(t.asignadoA))}</span>`);
  if (t.creadoPor && t.creadoPor !== t.asignadoA && t.asignadoA === EQ.miEmail()) chips.push(`<span class="chip chip-azul">De ${esc(EQ.primerNombre(t.creadoPor))}${!t.visto && t.estado !== 'hecho' ? ' · nuevo' : ''}</span>`);
  if (op.para && t.creadoPor === EQ.miEmail() && t.asignadoA !== EQ.miEmail()) chips.push(`<span class="chip chip-tenue">${t.visto ? '👁 Visto' : 'No visto aún'}</span>`);
  if (t.proyecto) chips.push(`<span class="chip chip-tenue">#${esc(t.proyecto)}</span>`);
  const ult = (t.comentarios || []).slice(-1)[0];
  return `
  <div class="fila eq-fila prio-${esc(t.prioridad || 'media')} ${venc ? 'es-vencido' : ''} ${t.estado === 'hecho' ? 'es-hecho' : ''}">
    <button class="eq-est est-${esc(t.estado)}" data-eq-estado="${esc(t.id)}" title="${esc(ESTADOS[t.estado]?.txt || '')} · tocar para cambiar">${ESTADOS[t.estado]?.ic || '○'}</button>
    <div class="fila-cuerpo" data-eq-abrir="${esc(t.id)}" tabindex="0" role="button">
      <div class="fila-tit">${t.prioridad === 'alta' ? `<span class="flag" title="Prioridad alta">${ic('bandera')}</span>` : ''}${esc(t.titulo || '(sin título)')}</div>
      ${chips.length ? `<div class="fila-meta">${chips.join('')}</div>` : ''}
      ${ult ? `<div class="fila-com">${ic('lista')}<time>${esc(EQ.primerNombre(ult.autor))} · ${esc(fmtMomento(ult.ts))}</time><span>${esc(ult.texto)}</span>${t.comentarios.length > 1 ? `<b>+${t.comentarios.length - 1}</b>` : ''}</div>` : ''}
    </div>
    ${t.estado === 'hecho' ? '' : `<div class="fila-acc">
      <button class="mini" data-eq-com="${esc(t.id)}" title="Comentar avance">${ic('lista')}</button>
      ${op.sinMover ? '' : `<button class="mini" data-eq-manana="${esc(t.id)}" title="Pasar al siguiente día hábil">+1d</button>`}
    </div>`}
  </div>`;
}
/** Fila de una sugerencia. modo: 'recibida' | 'enviada' | 'equipo' */
function filaSugerencia(t, modo) {
  const de = EQ.primerNombre(t.creadoPor), para = EQ.primerNombre(t.asignadoA);
  const dias = Math.floor((Date.now() - new Date(t.creado)) / 86400000);
  const estado = t.sugerencia === 'pendiente'
    ? (dias >= 1 ? `<span class="chip chip-rojo">Sin respuesta · ${dias} día${dias > 1 ? 's' : ''}</span>` : '<span class="chip chip-ambar">Esperando respuesta</span>')
    : t.sugerencia === 'rechazada' ? `<span class="chip chip-rojo">No le corresponde${t.respuesta ? ': ' + esc(t.respuesta.slice(0, 60)) : ''}</span>`
      : '<span class="chip chip-verde">✓ La tomó</span>';
  const acciones = modo === 'recibida'
    ? `<button class="btn btn-mini btn-pri" data-sug-tomar="${esc(t.id)}">Lo tomo</button><button class="btn btn-mini" data-sug-rechazar="${esc(t.id)}">No me corresponde</button>`
    : modo === 'equipo' ? `<button class="btn btn-mini" data-sug-asignar="${esc(t.id)}">Asignar</button>` : '';
  return `<div class="fila eq-fila eq-sug">
    <span class="eq-est eq-sug-ic" title="Sugerencia">💡</span>
    <div class="fila-cuerpo" data-eq-abrir="${esc(t.id)}" tabindex="0" role="button">
      <div class="fila-tit">${esc(t.titulo)}</div>
      <div class="fila-meta">
        ${modo === 'recibida' ? `<span class="chip chip-azul">Sugerido por ${esc(de)}</span>` : modo === 'enviada' ? `<span class="chip">${ic('usuario')}Para ${esc(para)}</span>` : `<span class="chip">${esc(de)} → ${esc(para)}</span>`}
        ${t.fecha ? `<span class="chip">${ic('reloj')}${esc(fmtFecha(t.fecha))}</span>` : ''}
        ${modo === 'recibida' ? '' : estado}
      </div>
      ${t.nota ? `<div class="fila-com"><span>${esc(t.nota)}</span></div>` : ''}
    </div>
    ${acciones ? `<div class="eq-sug-acc">${acciones}</div>` : ''}
  </div>`;
}
const listaSug = (l, modo) => `<div class="lista">${l.map((t) => filaSugerencia(t, modo)).join('')}</div>`;

const lista = (l, vacio, op) => (l.length ? `<div class="lista">${l.map((t) => filaTarea(t, op)).join('')}</div>` : `<div class="vacio">${esc(vacio)}</div>`);
const seccion = (titulo, n, cont, op = {}) => `<section class="seccion ${op.clase || ''}"><h3 class="seccion-tit">${op.icono ? ic(op.icono) : ''}${esc(titulo)}${n !== null ? `<span class="contador ${op.color || ''}">${n}</span>` : ''}${op.extra || ''}</h3>${cont}</section>`;

/** Acciones de las filas (delegación dentro de una vista o modal). */
function enlazarFilas(el) {
  if (el.__eqFilas) return; // el contenedor de la vista se reutiliza: enlazar una sola vez
  el.__eqFilas = true;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-eq-estado],[data-eq-abrir],[data-eq-com],[data-eq-manana],[data-sug-tomar],[data-sug-rechazar],[data-sug-asignar]');
    if (!b || !el.contains(b)) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.eqEstado) {
      const t = EQ.tarea(b.dataset.eqEstado);
      if (!t) return;
      const sig = SIGUIENTE[t.estado] || 'curso';
      await EQ.guardarTarea({ id: t.id, estado: sig, visto: t.asignadoA === EQ.miEmail() ? true : t.visto, ...(sig === 'hecho' ? { avance: 100 } : {}) });
      toast(sig === 'hecho' ? `✓ Hecho: ${t.titulo}` : `${ESTADOS[sig].txt}: ${t.titulo}`, sig === 'hecho' ? { texto: 'Deshacer', fn: () => EQ.guardarTarea({ id: t.id, estado: t.estado }) } : null);
    } else if (b.dataset.eqAbrir) editarTarea(b.dataset.eqAbrir);
    else if (b.dataset.eqCom) comentar(b.dataset.eqCom);
    else if (b.dataset.sugTomar) {
      const t = EQ.tarea(b.dataset.sugTomar);
      await EQ.responderSugerencia(t.id, true);
      toast(`Agregado a tus pendientes: ${t.titulo}`, { texto: 'Deshacer', fn: () => EQ.guardarTarea({ id: t.id, sugerencia: 'pendiente' }) });
    } else if (b.dataset.sugRechazar) rechazarSugerencia(b.dataset.sugRechazar);
    else if (b.dataset.sugAsignar) editarTarea(b.dataset.sugAsignar, {}, { reasignar: true });
    else if (b.dataset.eqManana) {
      const t = EQ.tarea(b.dataset.eqManana);
      const f = siguienteHabil(t.fecha && t.fecha > hoy() ? t.fecha : hoy());
      await EQ.guardarTarea({ id: t.id, fecha: f });
      toast(`Movido a ${fmtFecha(f)}`, { texto: 'Deshacer', fn: () => EQ.guardarTarea({ id: t.id, fecha: t.fecha }) });
    }
  });
}

// ---------------- Capturar (Mi día y Asignar) ----------------
/** Interpreta "texto @persona viernes !alta #proyecto". */
function interpretar(texto, asignarPorDefecto) {
  let proyecto = '';
  const mp = /(?:^|\s)#([\p{L}\p{N}_.-]+)/u.exec(texto);
  if (mp) { proyecto = mp[1]; texto = texto.replace(mp[0], ' '); }
  const conArroba = /(^|\s)@\S/.test(texto);
  const personas = EQ.activos().map((m) => ({ id: m.id, nombre: m.nombre }));
  const p = parsear(texto, { now: new Date(), personas, proyectos: [] });
  return {
    titulo: p.titulo || texto.trim(),
    fecha: p.fecha || hoy(),
    prioridad: p.prioridad || 'media',
    asignadoA: p.responsableId || asignarPorDefecto || EQ.miEmail(),
    conPersona: !!p.responsableId,
    conArroba,
    proyecto,
  };
}
async function capturar(texto, asignarPorDefecto, proyectoPorDefecto = '', revisar = false) {
  if (!texto.trim()) return null;
  const { conPersona, conArroba, ...d } = interpretar(texto, asignarPorDefecto);
  if (!d.proyecto && proyectoPorDefecto) d.proyecto = proyectoPorDefecto;
  // Usar el nombre ya existente del proyecto (Huaylla = huaylla = HUAYLLA)
  if (d.proyecto) d.proyecto = EQ.proyectosEquipo().find((p) => EQ.mismoProyecto(p, d.proyecto)) || d.proyecto;
  const yo = EQ.miEmail();
  const fueraDeMiEquipo = conPersona && d.asignadoA !== yo && !EQ.visibles().includes(d.asignadoA);
  if (revisar) {
    editarTarea(null, { ...d, asignadoA: conArroba && conPersona && !fueraDeMiEquipo ? d.asignadoA : '' }, { elegirResponsable: true });
    return null;
  }
  // A un compañero fuera de mi equipo no se le asigna: se le SUGIERE (con @nombre explícito)
  if (fueraDeMiEquipo && conArroba) {
    const t = await EQ.guardarTarea({ ...d, sugerencia: 'pendiente', visto: false });
    toast(`💡 Sugerencia enviada a ${EQ.primerNombre(t.asignadoA)}. Decide si la toma; su líder también lo verá.`, { texto: 'Editar', fn: () => editarTarea(t.id) }, 7000);
    return t;
  }
  if (fueraDeMiEquipo) d.asignadoA = asignarPorDefecto || yo; // "con Ana…" sin @: es tuyo
  // En el panel sin "@persona": elegir a quién se asigna
  if (asignarPorDefecto === null && (!conPersona || fueraDeMiEquipo)) { editarTarea(null, { ...d, asignadoA: '' }); return null; }
  const t = await EQ.guardarTarea({ ...d, visto: d.asignadoA === EQ.miEmail() });
  const para = t.asignadoA === EQ.miEmail() ? '' : ` → ${EQ.primerNombre(t.asignadoA)}`;
  toast(`＋ ${t.titulo}${para} · ${fmtFecha(t.fecha)}`, { texto: 'Editar', fn: () => editarTarea(t.id) }, 6000);
  return t;
}
export function revisarAsignacion(texto, proyecto = '') {
  return capturar(texto, null, proyecto, true);
}

function enlazarCaptura(el, sel, asignarPorDefecto, proyectoPorDefecto = () => '', dosPasos = false) {
  const inp = el.querySelector(sel);
  if (!inp) return;
  const continuar = el.querySelector('[data-revisar-asignacion]');
  const mic = el.querySelector(`[data-mic="${sel}"]`);
  const abrir = async (revisar) => {
    const v = inp.value;
    if (!v.trim()) { inp.focus(); return; }
    inp.value = '';
    await capturar(v, asignarPorDefecto, proyectoPorDefecto(), revisar);
  };
  inp.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || e.isComposing || mic?.disabled) return;
    e.preventDefault();
    await abrir(dosPasos && !/(^|\s)@\S/.test(inp.value));
  });
  continuar?.addEventListener('click', () => abrir(true));
  mic?.addEventListener('click', async () => {
    if (mic.disabled) return;
    mic.disabled = true;
    if (continuar) continuar.disabled = true;
    const ph = inp.placeholder;
    const terminar = () => {
      inp.placeholder = ph;
      mic.disabled = false;
      if (continuar) continuar.disabled = false;
    };
    const { escuchar, vozDisponible } = await import('./voz.js');
    if (!vozDisponible()) {
      terminar();
      toast('Usa el micrófono del teclado');
      inp.focus();
      return;
    }
    inp.placeholder = 'Escuchando…';
    escuchar({
      onParcial: (t) => { inp.value = t; },
      onFin: async (texto) => {
        terminar();
        if (!texto) return;
        inp.value = texto;
        if (!dosPasos) await abrir(false);
      },
      onError: (m) => { terminar(); toast(m); },
    });
  });
}

// ---------------- Editor de tarea ----------------
export function editarTarea(id, def = {}, op = {}) {
  const t = id ? EQ.tarea(id) : { estado: 'pendiente', prioridad: 'media', fecha: hoy(), asignadoA: EQ.miEmail(), comentarios: [], ...def };
  if (!t) { toast('Ese pendiente ya no está disponible'); return; }
  const yo = EQ.miEmail();
  const esSug = EQ.esSugerencia(t);
  const puedoReasignar = EQ.veEquipo() && (!id || EQ.visibles().includes(t.asignadoA) || (t.creadoPor === yo && !esSug));
  const elegirResponsable = !!op.elegirResponsable && puedoReasignar;
  const puedoBorrar = !id ? false : t.creadoPor === yo || (EQ.veEquipo() && t.asignadoA !== yo && EQ.visibles().includes(t.asignadoA));
  const opcionesPara = (t.asignadoA ? '' : '<option value="" selected disabled>— ¿A quién? —</option>') + EQ.visibles().map((e) => `<option value="${esc(e)}" ${e === t.asignadoA ? 'selected' : ''}>${esc(e === yo ? `Yo (${EQ.nombreDe(e)})` : EQ.nombreDe(e))}</option>`).join('');
  const proyectos = [...new Set(EQ.tareas().map((x) => x.proyecto).filter(Boolean))];
  const coms = (t.comentarios || []).map((c) => `<li><b>${esc(EQ.nombreDe(c.autor))}</b> <time>${esc(fmtMomento(c.ts))}</time><p>${esc(c.texto)}</p></li>`).join('');
  modal(elegirResponsable ? 'Asignar pendiente' : id ? 'Pendiente' : 'Nuevo pendiente', `
  <form class="form form-eq" data-estado="${esc(t.estado)}">
    <label class="campo campo-full"><span>¿Qué hay que hacer?</span><input name="titulo" required value="${esc(t.titulo || '')}" ${id || elegirResponsable ? '' : 'autofocus'}></label>
    ${esSug ? `<div class="aviso aviso-azul"><span>💡 <b>Sugerencia</b> de ${esc(EQ.nombreDe(t.creadoPor))} para ${esc(EQ.nombreDe(t.asignadoA))}${t.sugerencia === 'rechazada' ? ` · respondió: “${esc(t.respuesta || 'no le corresponde')}”` : ''}.${puedoReasignar ? ' Elige el responsable y guarda para asignarla.' : ''}</span></div>` : ''}
    ${id && !esSug && t.creadoPor !== t.asignadoA ? `<p class="nota">Asignado por <b>${esc(EQ.nombreDe(t.creadoPor))}</b> a <b>${esc(EQ.nombreDe(t.asignadoA))}</b> · ${esc(fmtMomento(t.creado))}</p>` : ''}
    <div class="fila-campos">
      ${puedoReasignar ? `<label class="campo"><span>Responsable</span><select name="asignadoA" ${elegirResponsable ? 'required autofocus' : ''}>${opcionesPara}</select></label>` : ''}
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${esc(t.fecha || '')}"></label>
      <label class="campo campo-corto"><span>Prioridad</span><select name="prioridad">${['alta', 'media', 'baja'].map((p) => `<option value="${p}" ${t.prioridad === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
    </div>
    <div class="segmentado seg-eq">
      ${Object.entries(ESTADOS).map(([k, v]) => `<label class="seg"><input type="radio" name="estado" value="${k}" ${t.estado === k ? 'checked' : ''}><span>${v.ic} ${v.txt}</span></label>`).join('')}
    </div>
    <label class="campo campo-full solo-bloqueado"><span>¿Qué lo bloquea? (lo verá tu jefe)</span><input name="motivo" value="${esc(t.motivo || '')}" placeholder="Ej.: falta data de geología"></label>
    <label class="campo campo-full solo-curso"><span>Avance: <b data-avance-txt>${Number(t.avance) || 0}%</b></span><input type="range" name="avance" min="0" max="100" step="10" value="${Number(t.avance) || 0}"></label>
    <div class="fila-campos">
      <label class="campo"><span>Proyecto</span><input name="proyecto" list="eq-proyectos" value="${esc(t.proyecto || '')}" placeholder="Opcional"><datalist id="eq-proyectos">${proyectos.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
    </div>
    <label class="campo campo-full"><span>Detalle</span><textarea name="nota" rows="2">${esc(t.nota || '')}</textarea></label>
    ${id ? `<div class="eq-coms"><h4 class="sub-tit">Comentarios y avances</h4>${coms ? `<ul>${coms}</ul>` : '<p class="nota">Aún no hay comentarios.</p>'}
      <label class="campo campo-full"><span>Agregar comentario</span><textarea name="comentario" rows="2" placeholder="Ej.: avancé 60%, mañana envío la versión final"></textarea></label></div>` : ''}
    <div class="acciones-modal">
      ${puedoBorrar ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span>
      <button class="btn btn-pri">${elegirResponsable ? 'Asignar' : 'Guardar'}</button>
    </div>
  </form>`, (el, cerrar) => {
    const f = el.querySelector('form');
    f.querySelectorAll('[name=estado]').forEach((r) => r.addEventListener('change', () => { f.dataset.estado = r.value; }));
    f.avance.addEventListener('input', () => { el.querySelector('[data-avance-txt]').textContent = `${f.avance.value}%`; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      const comentario = d.comentario; delete d.comentario;
      d.avance = Number(d.avance) || 0;
      if (d.estado === 'hecho') d.avance = 100;
      if (d.estado !== 'bloqueado') d.motivo = '';
      if (!puedoReasignar) delete d.asignadoA;
      else if (!d.asignadoA) { toast('Elige el responsable'); return; }
      if (esSug) {
        if (puedoReasignar) { d.sugerencia = 'asignada'; if (d.asignadoA !== t.asignadoA) d.visto = false; } // el líder decide: queda asignada
        else if (t.asignadoA === EQ.miEmail()) d.sugerencia = 'aceptada'; // la persona la tomó
      }
      const g = await EQ.guardarTarea({ ...(id ? { id } : {}), ...d, ...((d.asignadoA || t.asignadoA) === EQ.miEmail() ? { visto: true } : {}) });
      if (comentario) await EQ.comentarTarea(g.id, comentario);
      toast('Guardado');
      cerrar();
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (!await confirmar('¿Eliminar este pendiente?', 'Eliminar', true)) return;
      await EQ.borrarTarea(id);
      toast('Eliminado', { texto: 'Deshacer', fn: () => EQ.guardarTarea({ id, deleted: false }) });
      cerrar();
    });
  });
}

function rechazarSugerencia(id) {
  const t = EQ.tarea(id);
  if (!t) return;
  modal('No me corresponde', `<form class="form">
    <p class="nota"><b>${esc(t.titulo)}</b> · sugerido por ${esc(EQ.nombreDe(t.creadoPor))}</p>
    <label class="campo campo-full"><span>¿Por qué? ¿A quién le corresponde? (lo verán ${esc(EQ.primerNombre(t.creadoPor))} y tu líder)</span>
      <textarea name="respuesta" rows="2" required autofocus placeholder="Ej.: eso lo ve topografía (Luis)"></textarea></label>
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Enviar</button></div>
  </form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await EQ.responderSugerencia(id, false, leerForm(e.target).respuesta);
      toast('Respuesta enviada');
      cerrar();
    });
  });
}

function comentar(id) {
  const t = EQ.tarea(id);
  if (!t) return;
  modal('Comentar avance', `<form class="form">
    <p class="nota"><b>${esc(t.titulo)}</b></p>
    <label class="campo campo-full"><span>Comentario</span><textarea name="texto" rows="3" required autofocus placeholder="Ej.: avancé 60%, espero respuesta de geotecnia"></textarea></label>
    <div class="fila-campos">
      <label class="check-linea"><input type="checkbox" name="curso" ${t.estado === 'curso' ? 'checked' : ''}> En curso</label>
      <label class="check-linea"><input type="checkbox" name="bloq" ${t.estado === 'bloqueado' ? 'checked' : ''}> Estoy bloqueado</label>
    </div>
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Guardar</button></div>
  </form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      await EQ.comentarTarea(id, d.texto);
      const estado = d.bloq ? 'bloqueado' : d.curso ? 'curso' : t.estado === 'bloqueado' || t.estado === 'curso' ? 'pendiente' : t.estado;
      if (estado !== t.estado) await EQ.guardarTarea({ id, estado, motivo: d.bloq ? d.texto.slice(0, 120) : '' });
      toast('Comentario guardado');
      cerrar();
    });
  });
}

// ---------------- Barra de estado del equipo ----------------
function estadoSyncHtml() {
  const s = EQ.estadoEquipo();
  const txt = { ok: `Sincronizado ${hace(EQ.cfg().ultimaSync)}`, sync: 'Sincronizando…', pendiente: `${s.pendientes} cambios por subir`, reauth: 'Toca para reconectar con Google', offline: 'Sin conexión (se guardará al volver)', error: `Error: ${s.mensaje}` }[s.estado] || '';
  return txt ? `<button class="eq-sync eq-sync-${esc(s.estado)}" data-eq-sync>${ic('sync')} ${esc(txt)}</button>` : '';
}
async function alTocarSync() {
  const s = EQ.estadoEquipo();
  if (s.estado === 'reauth') {
    try { await G.pedirToken(); } catch (e) { toast(e.message); return; }
  }
  await EQ.sincronizarEquipo();
}

/** Pantalla cuando el equipo no está listo en este dispositivo. */
function noListo() {
  const c = EQ.cfg();
  if (!EQ.configurado()) return { titulo: 'Equipo', html: `${cab('Equipo en línea')}<div class="vacio vacio-grande">${ic('equipo')}<b>Aún no estás en un equipo</b><span>Si eres jefe, crea tu equipo en Ajustes. Si te invitaron, abre el enlace que te enviaron.</span><a class="btn btn-pri" href="#/ajustes">Ir a Ajustes</a></div>` };
  if (c.estado === 'solicitud') return {
    titulo: 'Equipo',
    html: `${cab('Equipo en línea')}<div class="vacio vacio-grande">${ic('espera')}<b>Tu solicitud está enviada</b><span>Tu jefe debe aprobarte (${esc(c.email || '')}). Cuando lo haga, aquí verás tu día.</span><button class="btn btn-pri" data-reintentar>Revisar de nuevo</button></div>`,
    montar(el) { el.querySelector('[data-reintentar]').onclick = async () => { try { await EQ.sincronizarEquipo({ lanzar: true }); if (EQ.activo()) toast('¡Ya estás en el equipo!'); else toast('Aún pendiente de aprobación'); } catch (e) { if (e.reauth) { try { await G.pedirToken(); await EQ.sincronizarEquipo(); } catch (x) { toast(x.message); } } else toast(e.message); } }; },
  };
  if (c.estado === 'inactivo') return { titulo: 'Equipo', html: `${cab('Equipo en línea')}<div class="vacio vacio-grande"><b>Tu acceso al equipo está desactivado</b><span>Habla con tu jefe.</span></div>` };
  return {
    titulo: 'Equipo',
    html: `${cab('Equipo en línea')}<div class="vacio vacio-grande">${ic('sync')}<b>Conectando con tu equipo…</b>${estadoSyncHtml()}</div>`,
    montar(el) { el.querySelector('[data-eq-sync]')?.addEventListener('click', alTocarSync); },
  };
}

// ============================================================
//  MI DÍA
// ============================================================
export function vistaMiDia() {
  if (!EQ.activo()) return noListo();
  const H = hoy();
  const yo = EQ.miEmail();
  const cfg = EQ.configEquipo();
  const hora = Number(cfg.horaPlan || 9);
  const mias = EQ.tareas().filter((t) => t.asignadoA === yo);
  const abiertas = mias.filter((t) => t.estado !== 'hecho');
  const nuevas = abiertas.filter((t) => t.creadoPor !== yo && !t.visto).sort(ordenar);
  const idsNuevas = new Set(nuevas.map((t) => t.id));
  const deHoy = abiertas.filter((t) => !idsNuevas.has(t.id) && (!t.fecha || t.fecha <= H)).sort(ordenar);
  const proximas = abiertas.filter((t) => !idsNuevas.has(t.id) && t.fecha && t.fecha > H).sort(ordenar);
  const hechasHoy = mias.filter((t) => t.estado === 'hecho' && fechaLocal(t.completado) === H).sort((a, b) => (b.completado || '').localeCompare(a.completado || ''));
  const ed = EQ.estadoDia(yo);
  const laborable = EQ.esDiaLaborable();
  const sem = EQ.semaforoPlan(yo);
  const delegadas = EQ.tareas().filter((t) => t.creadoPor === yo && t.asignadoA !== yo && t.estado !== 'hecho' && !t.sugerencia);
  const sugRecibidas = EQ.sugerencias().filter((t) => t.asignadoA === yo && t.sugerencia === 'pendiente');
  const hace7 = addDias(H, -7);
  const sugEnviadas = [...EQ.sugerencias(), ...EQ.tareas().filter((t) => t.sugerencia === 'aceptada' || t.sugerencia === 'asignada')]
    .filter((t) => t.creadoPor === yo && t.asignadoA !== yo && (t.sugerencia === 'pendiente' || fechaLocal(t.updatedAt) >= hace7))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  let banner = '';
  if (laborable && !ed.planIso) {
    banner = sem === 'falta'
      ? `<div class="aviso aviso-rojo">${ic('campana')}<span><b>Ya pasaron las ${hora}:00 y no cargas tu plan de hoy.</b> Escribe abajo tus pendientes del día (uno por línea, con Enter).</span></div>`
      : `<div class="aviso">${ic('campana')}<span><b>Buenos días.</b> Carga tus pendientes de hoy antes de las <b>${hora}:00</b>: escríbelos o díctalos abajo, uno por uno.</span></div>`;
  } else if (ed.planIso && laborable) {
    banner = `<div class="aviso aviso-verde">${ic('check')}<span>Plan del día cargado a las <b>${esc(EQ.horaCorta(ed.planIso))}</b>${sem === 'tarde' ? ' (después de la hora)' : ''}. ${ed.cierre ? `Día cerrado a las ${esc(EQ.horaCorta(ed.cierre))}.` : 'Actualiza el estado a medida que avanzas.'}</span></div>`;
  }
  const yaConfirmo = !!EQ.plan(yo)?.enviado;
  const html = `
  ${cab('Mi día', `${esc(fmtFechaLarga(H))} · ${esc(cfg.nombreEquipo || 'Equipo')}`, `
    ${!ed.planIso || !yaConfirmo ? `<button class="btn" data-confirmar title="Avisar a tu jefe que tu plan de hoy está listo">${ic('enviar')} Plan listo</button>` : ''}
    <button class="btn ${new Date().getHours() >= 16 && !ed.cierre ? 'btn-pri' : ''}" data-cerrar-dia>${ic('check')} ${ed.cierre ? 'Editar cierre' : 'Cerrar mi día'}</button>`)}
  ${estadoSyncHtml()}
  ${banner}
  <div class="cap-linea">
    ${ic('mas2')}
    <input type="text" id="cap-midia" placeholder="“revisar secuencia de minado” · “enviar planos mañana !alta” · sugerir: “cubicar tajo 450 @Ana”" enterkeyhint="done" aria-label="Agregar pendiente de hoy">
    <button class="icon-btn" data-mic="#cap-midia" title="Dictar">${ic('mic')}</button>
  </div>
  <p class="nota eq-ayuda">Toca el círculo para cambiar el estado: ○ pendiente → ◐ en curso → ✓ hecho. Toca el texto para comentar, marcar bloqueo o cambiar la fecha.</p>
  ${sugRecibidas.length ? seccion('Te sugieren', sugRecibidas.length, listaSug(sugRecibidas, 'recibida'), { icono: 'campana', color: 'rojo', clase: 'eq-nuevas' }) : ''}
  ${nuevas.length ? seccion('Nuevos: te asignaron', nuevas.length, lista(nuevas, '', {}), { icono: 'campana', color: 'rojo', clase: 'eq-nuevas' }) : ''}
  ${seccion('Hoy', deHoy.length, lista(deHoy, laborable ? 'Agrega arriba tus pendientes de hoy' : 'Nada para hoy'), { icono: 'hoy' })}
  ${proximas.length ? seccion('Próximos días', proximas.length, lista(proximas, '', { sinMover: true }), { icono: 'calendario' }) : ''}
  ${sugEnviadas.length ? seccion('Mis sugerencias', sugEnviadas.filter((t) => t.sugerencia === 'pendiente').length, listaSug(sugEnviadas, 'enviada'), { icono: 'enviar', extra: '<small class="eq-tit-nota">¿Escuchaste algo que le toca a otro? Escribe “tarea @nombre”</small>' }) : ''}
  ${delegadas.length ? seccion('Asignados por mí', delegadas.length, lista(delegadas.sort(ordenar), '', { para: true }), { icono: 'enviar' }) : ''}
  ${hechasHoy.length ? seccion('Hechos hoy', hechasHoy.length, lista(hechasHoy, ''), { icono: 'check', color: 'verde' }) : ''}
  ${ed.cierre ? `<section class="seccion"><h3 class="seccion-tit">${ic('lista')}Mi cierre de hoy</h3><p class="eq-cierre">${esc(ed.comentarioCierre || 'Sin comentario')}</p></section>` : ''}`;

  return {
    titulo: 'Mi día', html,
    montar(el) {
      enlazarFilas(el);
      enlazarCaptura(el, '#cap-midia', yo);
      el.querySelector('[data-eq-sync]')?.addEventListener('click', alTocarSync);
      el.querySelector('[data-confirmar]')?.addEventListener('click', async () => {
        if (!abiertas.some((t) => !t.fecha || t.fecha <= H)) { toast('Primero agrega al menos un pendiente para hoy'); el.querySelector('#cap-midia').focus(); return; }
        await EQ.guardarPlan({ enviado: new Date().toISOString() });
        toast('Plan del día enviado ✓');
      });
      el.querySelector('[data-cerrar-dia]').addEventListener('click', () => cerrarDia());
      // Lo nuevo que me asignaron queda "visto" al abrir Mi día
      if ((nuevas.length || sugRecibidas.some((t) => !t.visto)) && document.visibilityState === 'visible') setTimeout(() => { for (const t of [...nuevas, ...sugRecibidas.filter((x) => !x.visto)]) EQ.guardarTarea({ id: t.id, visto: true }); }, 4000);
      if (laborable && !ed.planIso && !abiertas.length) setTimeout(() => el.querySelector('#cap-midia')?.focus(), 200);
    },
  };
}

function cerrarDia() {
  const H = hoy();
  const yo = EQ.miEmail();
  const mias = EQ.tareas().filter((t) => t.asignadoA === yo);
  const hechas = mias.filter((t) => t.estado === 'hecho' && fechaLocal(t.completado) === H);
  const quedan = mias.filter((t) => t.estado !== 'hecho' && (!t.fecha || t.fecha <= H));
  const p = EQ.plan(yo);
  modal('Cerrar mi día', `<form class="form">
    <p class="nota">Hoy terminaste <b>${hechas.length}</b> y quedan <b>${quedan.length}</b> abiertos.</p>
    ${quedan.length ? `<div class="eq-quedan"><h4 class="sub-tit">¿Qué pasa con lo que quedó?</h4>${quedan.map((t) => `<label class="check-linea"><input type="checkbox" name="mover" data-multi value="${esc(t.id)}" checked> ${esc(t.titulo)}${t.estado === 'bloqueado' ? ' ⛔' : ''}</label>`).join('')}
      <p class="nota">Los marcados pasan al <b>${esc(fmtFecha(siguienteHabil(H)))}</b>.</p></div>` : ''}
    <label class="campo campo-full"><span>Comentario del día (lo verá tu jefe)</span><textarea name="comentario" rows="3" placeholder="Ej.: avancé el plan de minado; mañana reunión con geotecnia">${esc(p?.comentario || '')}</textarea></label>
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Cerrar el día</button></div>
  </form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      const f = siguienteHabil(H);
      for (const id of d.mover || []) await EQ.guardarTarea({ id, fecha: f });
      await EQ.guardarPlan({ cierre: new Date().toISOString(), comentario: d.comentario || '' });
      toast('Día cerrado. ¡Buen trabajo!');
      cerrar();
    });
  });
}

// ============================================================
//  PANEL DEL EQUIPO (jefe y líderes)
// ============================================================
let modoSemana = false;
let filtroProyecto = ''; // Panel: ver solo un proyecto

function tarjetaPersona(m) {
  const e = EQ.estadoDia(m.id, hoy(), filtroProyecto);
  const s = EQ.semaforoPlan(m.id);
  const laborable = EQ.esDiaLaborable();
  const plan = !laborable ? '<span class="chip chip-tenue">Día no laborable</span>'
    : s === 'ok' ? `<span class="chip chip-verde">✓ Plan ${esc(EQ.horaCorta(e.planIso))}</span>`
      : s === 'tarde' ? `<span class="chip chip-ambar">Plan ${esc(EQ.horaCorta(e.planIso))} (tarde)</span>`
        : s === 'falta' ? '<span class="chip chip-rojo">Sin plan</span>' : '<span class="chip chip-tenue">Aún sin plan</span>';
  const pct = e.total ? Math.round((e.hechas / e.total) * 100) : 0;
  return `<button class="eq-persona eq-sem-${s}" data-persona="${esc(m.id)}">
    <div class="eq-p-cab"><span class="avatar">${esc(iniciales(m.nombre))}</span><div><b>${esc(m.nombre)}</b><small>${esc(m.cargo || ROLES[m.rol] || '')}</small></div>${plan}</div>
    <div class="eq-barra" title="${e.hechas} de ${e.total} hechos hoy"><span style="width:${pct}%"></span></div>
    <div class="eq-nums">
      <span><b>${e.hechas}/${e.total}</b> hechos</span>
      ${e.curso ? `<span><b>${e.curso}</b> en curso</span>` : ''}
      ${e.bloqueadas ? `<span class="rojo"><b>${e.bloqueadas}</b> bloq.</span>` : ''}
      ${e.vencidas ? `<span class="rojo"><b>${e.vencidas}</b> vencidos</span>` : ''}
      ${e.nuevasSinVer ? `<span class="azul"><b>${e.nuevasSinVer}</b> sin ver</span>` : ''}
    </div>
    <small class="eq-ult">${e.ultima ? `Actualizó ${esc(hace(e.ultima))}` : 'Sin actividad'}${e.cierre ? ' · ✓ cerró el día' : ''}</small>
  </button>`;
}

function semanaHtml(personas) {
  const ini = inicioSemana(hoy());
  const dias = Array.from({ length: 7 }, (_, i) => addDias(ini, i)).filter((d) => EQ.esDiaLaborable(d));
  const celda = (m, d) => {
    if (d > hoy() || d < fechaLocal(m.creado || '') ) return '<td class="eq-fut">·</td>';
    const e = EQ.estadoDia(m.id, d, filtroProyecto);
    const s = EQ.semaforoPlan(m.id, d);
    const icon = { ok: '🟢', tarde: '🟡', falta: '🔴', espera: '⚪' }[s];
    return `<td title="${s === 'ok' || s === 'tarde' ? 'Plan ' + EQ.horaCorta(e.planIso) : 'Sin plan'} · ${e.hechas}/${e.total} hechos${e.cierre ? ' · cerró el día' : ''}">${icon}<small>${e.hechas}/${e.total}</small>${e.cierre ? '<i>✓</i>' : ''}</td>`;
  };
  return `<div class="eq-semana-wrap"><table class="eq-semana">
    <thead><tr><th>Persona</th>${dias.map((d) => `<th class="${d === hoy() ? 'hoy' : ''}">${esc(fmtFecha(d).replace(/^(Hoy|Ayer|Mañana)$/, (x) => x))}</th>`).join('')}</tr></thead>
    <tbody>${personas.map((m) => `<tr><th><button class="mini-link" data-persona="${esc(m.id)}">${esc(m.nombre)}</button></th>${dias.map((d) => celda(m, d)).join('')}</tr>`).join('')}</tbody>
  </table><p class="nota">🟢 plan a tiempo · 🟡 plan tarde · 🔴 sin plan · número = hechos/total del día · ✓ cerró el día</p></div>`;
}

export function vistaPanel() {
  if (!EQ.activo()) return noListo();
  if (!EQ.veEquipo()) return { titulo: 'Panel', html: `${cab('Panel del equipo')}<div class="vacio vacio-grande"><b>El panel es para jefes y líderes</b><a class="btn btn-pri" href="#/midia">Ir a Mi día</a></div>` };
  const yo = EQ.miEmail();
  const cfg = EQ.configEquipo();
  const proyectos = EQ.proyectosEquipo();
  if (filtroProyecto && !proyectos.some((p) => EQ.mismoProyecto(p, filtroProyecto))) filtroProyecto = '';
  const enFiltro = (t) => !filtroProyecto || EQ.mismoProyecto(t.proyecto, filtroProyecto);
  const todoEquipo = EQ.miEquipo();
  const equipo = filtroProyecto ? todoEquipo.filter((m) => EQ.trabajaEn(m.id, filtroProyecto)) : todoEquipo;
  const laborable = EQ.esDiaLaborable();
  const est = equipo.map((m) => ({ m, e: EQ.estadoDia(m.id, hoy(), filtroProyecto), s: EQ.semaforoPlan(m.id) }));
  const conPlan = est.filter((x) => x.e.planIso).length;
  const sinPlan = est.filter((x) => !x.e.planIso);
  const bloq = est.reduce((a, x) => a + x.e.bloqueadas, 0);
  const venc = est.reduce((a, x) => a + x.e.vencidas, 0);
  const hech = est.reduce((a, x) => a + x.e.hechas, 0), tot = est.reduce((a, x) => a + x.e.total, 0);
  const delegadas = EQ.tareas().filter((t) => t.creadoPor === yo && t.asignadoA !== yo && t.estado !== 'hecho' && enFiltro(t)).sort(ordenar);
  const bloqueadas = EQ.tareas().filter((t) => t.estado === 'bloqueado' && t.asignadoA !== yo && enFiltro(t)).sort(ordenar);
  const sugEquipo = EQ.sugerencias().filter((t) => enFiltro(t) && t.asignadoA !== yo && EQ.visibles().includes(t.asignadoA) && (t.sugerencia === 'pendiente' || fechaLocal(t.updatedAt) >= addDias(hoy(), -7)))
    .sort((a, b) => (a.sugerencia === 'rechazada' ? 0 : 1) - (b.sugerencia === 'rechazada' ? 0 : 1) || (a.creado || '').localeCompare(b.creado || ''));

  // Grupos: el jefe ve cada líder con su equipo; el líder, su equipo
  let grupos = '';
  if (EQ.esJefe()) {
    const lideres = todoEquipo.filter((m) => m.rol === 'lider');
    const enGrupo = new Set();
    const ids = new Set(equipo.map((m) => m.id));
    for (const l of lideres) {
      const suyos = equipo.filter((m) => m.lider === l.id);
      const grupo = [...(ids.has(l.id) ? [l] : []), ...suyos];
      suyos.forEach((m) => enGrupo.add(m.id)); enGrupo.add(l.id);
      if (!grupo.length) continue;
      grupos += `<section class="seccion"><h3 class="seccion-tit">${ic('equipo')}Equipo de ${esc(l.nombre)}<span class="contador">${grupo.length}</span></h3><div class="eq-rejilla">${grupo.map(tarjetaPersona).join('')}</div></section>`;
    }
    const directos = equipo.filter((m) => !enGrupo.has(m.id));
    if (directos.length) grupos = `<section class="seccion"><h3 class="seccion-tit">${ic('equipo')}${lideres.length ? 'Directo a ti' : 'Tu equipo'}<span class="contador">${directos.length}</span></h3><div class="eq-rejilla">${directos.map(tarjetaPersona).join('')}</div></section>` + grupos;
  } else {
    grupos = `<section class="seccion"><h3 class="seccion-tit">${ic('equipo')}Tu equipo<span class="contador">${equipo.length}</span></h3><div class="eq-rejilla">${equipo.map(tarjetaPersona).join('')}</div></section>`;
  }
  const sol = EQ.esJefe() ? EQ.solicitudes() : [];
  const html = `
  ${cab('Panel del equipo', `${esc(fmtFechaLarga(hoy()))} · plan hasta las ${esc(cfg.horaPlan)}:00`, `
    <div class="segmentado seg-mini"><button class="seg-btn ${modoSemana ? '' : 'activo'}" data-modo="dia">Hoy</button><button class="seg-btn ${modoSemana ? 'activo' : ''}" data-modo="semana">Semana</button></div>
    ${EQ.esJefe() ? `<a class="btn" href="#/miembros">${ic('usuario')} Miembros</a>` : ''}`)}
  ${estadoSyncHtml()}
  ${sol.length ? `<a class="aviso aviso-azul" href="#/miembros">${ic('usuario')}<span><b>${sol.length} ${sol.length > 1 ? 'personas pidieron' : 'persona pidió'} unirse</b> al equipo. Apruébalas en Miembros.</span>${ic('flecha')}</a>` : ''}
  ${proyectos.length ? `<div class="eq-proyectos" role="tablist" aria-label="Filtrar por proyecto">
    <button class="eq-proy ${filtroProyecto ? '' : 'activo'}" data-proy="">Todos</button>
    ${proyectos.map((p) => `<button class="eq-proy ${EQ.mismoProyecto(p, filtroProyecto) ? 'activo' : ''}" data-proy="${esc(p)}">#${esc(p)}</button>`).join('')}
  </div>` : ''}
  ${filtroProyecto && !equipo.length ? `<div class="vacio">Nadie tiene pendientes abiertos en #${esc(filtroProyecto)}.</div>` : ''}
  ${!todoEquipo.length ? `<div class="vacio vacio-grande">${ic('equipo')}<b>Aún no hay nadie en tu equipo</b><span>${EQ.esJefe() ? 'Invita a tus ingenieros desde Miembros: les envías un enlace por WhatsApp.' : 'Tu jefe debe asignarte personas.'}</span>${EQ.esJefe() ? '<a class="btn btn-pri" href="#/miembros">Invitar</a>' : ''}</div>` : `
  <div class="kpis">
    <div class="kpi ${laborable && EQ.pasoHoraPlan() && sinPlan.length ? 'kpi-rojo' : ''}">${ic('hoy')}<b>${conPlan}/${equipo.length}</b><span>con plan del día</span></div>
    <div class="kpi">${ic('check')}<b>${hech}/${tot}</b><span>hechos hoy</span></div>
    <div class="kpi ${bloq ? 'kpi-rojo' : ''}">${ic('x')}<b>${bloq}</b><span>bloqueados</span></div>
    <div class="kpi ${venc ? 'kpi-ambar' : ''}">${ic('reloj')}<b>${venc}</b><span>vencidos</span></div>
  </div>
  ${laborable && EQ.pasoHoraPlan() && sinPlan.length ? `<div class="aviso aviso-rojo">${ic('campana')}<span><b>Sin plan a las ${esc(cfg.horaPlan)}:00:</b> ${sinPlan.map((x) => esc(x.m.nombre)).join(', ')}</span></div>` : ''}
  <div class="cap-linea">
    ${ic('enviar')}
    <input type="text" id="cap-asignar" placeholder="Ej.: revisar costos de relleno el viernes" enterkeyhint="next" aria-label="Describe el pendiente">
    <button type="button" class="icon-btn" data-mic="#cap-asignar" title="Dictar" aria-label="Dictar pendiente">${ic('mic')}</button>
    <button type="button" class="btn btn-pri" data-revisar-asignacion>Continuar</button>
  </div>
  ${modoSemana ? semanaHtml(equipo) : grupos}
  ${sugEquipo.length ? seccion('Sugerencias entre compañeros', sugEquipo.length, listaSug(sugEquipo, 'equipo'), { icono: 'campana', color: sugEquipo.some((t) => t.sugerencia === 'rechazada' || (Date.now() - new Date(t.creado)) > 86400000) ? 'rojo' : '' }) : ''}
  ${bloqueadas.length ? seccion('Bloqueados', bloqueadas.length, lista(bloqueadas, '', { para: true }), { icono: 'x', color: 'rojo' }) : ''}
  ${seccion('Asignados por mí', delegadas.length, lista(delegadas, 'Aún no asignas pendientes. Escribe o dicta una tarea arriba.', { para: true }), { icono: 'enviar' })}`}`;

  return {
    titulo: 'Panel del equipo', html,
    montar(el, refrescar) {
      enlazarFilas(el);
      enlazarCaptura(el, '#cap-asignar', null, () => filtroProyecto, true);
      el.querySelector('[data-eq-sync]')?.addEventListener('click', alTocarSync);
      el.querySelectorAll('[data-persona]').forEach((b) => b.addEventListener('click', () => verPersona(b.dataset.persona)));
      el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modoSemana = b.dataset.modo === 'semana'; refrescar(); }));
      el.querySelectorAll('[data-proy]').forEach((b) => b.addEventListener('click', () => { filtroProyecto = b.dataset.proy; refrescar(); }));
    },
  };
}

/** Detalle de una persona (desde el panel). */
function verPersona(email) {
  const m = EQ.miembro(email);
  if (!m) return;
  const H = hoy();
  const suyas = EQ.tareas().filter((t) => t.asignadoA === email);
  const e = EQ.estadoDia(email);
  const abiertas = suyas.filter((t) => t.estado !== 'hecho');
  const hoyL = abiertas.filter((t) => !t.fecha || t.fecha <= H).sort(ordenar);
  const prox = abiertas.filter((t) => t.fecha && t.fecha > H).sort(ordenar);
  const hechas = suyas.filter((t) => t.estado === 'hecho' && fechaLocal(t.completado) >= addDias(H, -6)).sort((a, b) => (b.completado || '').localeCompare(a.completado || ''));
  const cierres = Array.from({ length: 7 }, (_, i) => addDias(H, -i)).map((d) => EQ.plan(email, d)).filter((p) => p && (p.comentario || p.cierre));
  let quitar = null;
  modal(m.nombre, `
    <div class="eq-detalle" data-email="${esc(email)}">
      <p class="nota">${esc(m.cargo || ROLES[m.rol] || '')} · ${esc(m.id)} · ${e.planIso ? `plan de hoy a las <b>${esc(EQ.horaCorta(e.planIso))}</b>` : '<b class="rojo">sin plan hoy</b>'}</p>
      <div class="cap-linea">${ic('enviar')}<input type="text" id="cap-persona" placeholder="Asignar a ${esc(m.nombre.split(' ')[0])}: “revisar planos mañana !alta”" enterkeyhint="send"><button class="icon-btn" data-mic="#cap-persona" title="Dictar">${ic('mic')}</button></div>
      <div data-listas>${listasPersona(hoyL, prox, hechas)}</div>
      ${cierres.length ? `<h4 class="sub-tit">Cierres del día</h4><ul class="eq-cierres">${cierres.map((p) => `<li><b>${esc(fmtFecha(p.fecha))}</b>${p.cierre ? ` · ${esc(EQ.horaCorta(p.cierre))}` : ''}<p>${esc(p.comentario || '(sin comentario)')}</p></li>`).join('')}</ul>` : ''}
    </div>`, (el, cerrar) => {
    enlazarFilas(el);
    enlazarCaptura(el, '#cap-persona', email);
    quitar = EQ.suscribir((t) => {
      if (t !== 'cambio' || !el.isConnected) return;
      const s = EQ.tareas().filter((x) => x.asignadoA === email);
      const ab = s.filter((x) => x.estado !== 'hecho');
      el.querySelector('[data-listas]').innerHTML = listasPersona(ab.filter((x) => !x.fecha || x.fecha <= H).sort(ordenar), ab.filter((x) => x.fecha && x.fecha > H).sort(ordenar), s.filter((x) => x.estado === 'hecho' && fechaLocal(x.completado) >= addDias(H, -6)));
    });
  }, { ancho: 'ancho', alCerrar: () => quitar?.() });
}
const listasPersona = (hoyL, prox, hechas) => `
  ${seccion('Hoy y pendientes', hoyL.length, lista(hoyL, 'Nada abierto para hoy', { para: false }), { icono: 'hoy' })}
  ${prox.length ? seccion('Próximos', prox.length, lista(prox, '', { sinMover: true }), { icono: 'calendario' }) : ''}
  ${hechas.length ? seccion('Hechos (7 días)', hechas.length, lista(hechas, ''), { icono: 'check', color: 'verde' }) : ''}`;

// ============================================================
//  MIEMBROS Y CONFIGURACIÓN (jefe)
// ============================================================
export function vistaMiembros() {
  if (!EQ.activo()) return noListo();
  if (!EQ.esJefe()) return { titulo: 'Miembros', html: `${cab('Miembros')}<div class="vacio">Solo el jefe administra los miembros.</div>` };
  const cfg = EQ.configEquipo();
  const act = EQ.activos();
  const lideres = act.filter((m) => m.rol === 'lider' || m.rol === 'jefe');
  const inactivos = EQ.miembros().filter((m) => m.estado === 'inactivo');
  const sol = EQ.solicitudes();
  const fila = (m) => `<div class="cta-fila">
    <button class="cta-info" data-editar="${esc(m.id)}"><span><span class="avatar avatar-mini">${esc(iniciales(m.nombre))}</span> <b>${esc(m.nombre)}</b> <em class="rol rol-${esc(m.rol)}">${esc(ROLES[m.rol] || m.rol)}</em></span><small>${esc(m.id)}${m.cargo ? ' · ' + esc(m.cargo) : ''}${m.lider ? ' · líder: ' + esc(EQ.nombreDe(m.lider)) : ''}</small></button>
    <button class="mini" data-editar="${esc(m.id)}">Editar</button>
  </div>`;
  const dias = cfg.dias.split(',');
  const html = `
  ${cab('Miembros del equipo', `${act.length} activos`, `<button class="btn btn-pri" data-agregar>${ic('mas2')} Agregar por correo</button>`)}
  ${estadoSyncHtml()}
  <section class="seccion eq-invitar"><h3 class="seccion-tit">${ic('enviar')}Invitar a tu equipo</h3>
    <p class="nota">Envía este enlace a tus ingenieros. Lo abren en el celular, entran con su Google y te llega la solicitud aquí para aprobarla (o agrégalos antes por correo y entran directo).</p>
    <div class="eq-enlace"><input readonly value="${esc(EQ.enlaceInvitacion())}" aria-label="Enlace de invitación"><button class="btn" data-copiar>${ic('copiar')} Copiar</button>
    <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Hola, vamos a registrar nuestros pendientes del día en Control. Entra aquí con tu cuenta de Google y cada mañana carga tus pendientes antes de las ${cfg.horaPlan}:00: ${EQ.enlaceInvitacion()}`)}">WhatsApp</a></div>
  </section>
  ${sol.length ? `<section class="seccion"><h3 class="seccion-tit">${ic('usuario')}Solicitudes<span class="contador rojo">${sol.length}</span></h3>
    ${sol.map((m) => `<div class="cta-fila"><span class="cta-info"><span><b>${esc(m.nombre)}</b></span><small>${esc(m.id)} · ${esc(hace(m.creado))}</small></span>
      <button class="btn btn-mini btn-pri" data-aprobar="${esc(m.id)}">Aprobar</button><button class="mini" data-rechazar="${esc(m.id)}">Rechazar</button></div>`).join('')}
  </section>` : ''}
  <section class="seccion"><h3 class="seccion-tit">${ic('equipo')}Equipo<span class="contador">${act.length}</span></h3>
    ${['jefe', 'lider', 'ingeniero'].map((r) => act.filter((m) => m.rol === r).map(fila).join('')).join('')}
    <p class="nota">El <b>líder</b> ve y asigna a las personas que tienen a ese líder. El <b>ingeniero</b> solo ve lo suyo. Tú ves a todos.</p>
  </section>
  ${inactivos.length ? `<section class="seccion"><h3 class="seccion-tit">Desactivados<span class="contador">${inactivos.length}</span></h3>${inactivos.map(fila).join('')}</section>` : ''}
  <section class="seccion"><h3 class="seccion-tit">${ic('ajustes')}Reglas del equipo</h3>
    <form class="form eq-reglas">
      <div class="fila-campos">
        <label class="campo"><span>Nombre del equipo</span><input name="nombreEquipo" value="${esc(cfg.nombreEquipo)}"></label>
        <label class="campo campo-corto"><span>Plan del día hasta</span><select name="horaPlan">${[7, 8, 9, 10, 11, 12].map((h) => `<option value="${h}" ${String(h) === String(cfg.horaPlan) ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
      </div>
      <div class="campo campo-full"><span>Días laborables</span><div class="chips-check">${[['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['0', 'Dom']].map(([v, t]) => `<label><input type="checkbox" name="dias" data-multi value="${v}" ${dias.includes(v) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <label class="check-linea"><input type="checkbox" name="correoRecordatorio" ${cfg.correoRecordatorio === 'si' ? 'checked' : ''}> Enviar correo a quien no cargó su plan a la hora límite</label>
      <label class="check-linea"><input type="checkbox" name="correoResumen" ${cfg.correoResumen === 'si' ? 'checked' : ''}> Enviarme a mí y a los líderes un resumen del equipo a esa hora</label>
      <label class="check-linea"><input type="checkbox" name="correoAsignacion" ${cfg.correoAsignacion === 'si' ? 'checked' : ''}> Avisar por correo cuando se asigna un pendiente</label>
      <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Guardar reglas</button></div>
    </form>
  </section>
  ${EQ.cfg().libroUrl ? `<p class="nota">Todos los datos del equipo están en tu Google Drive: <a href="${esc(EQ.cfg().libroUrl)}" target="_blank" rel="noopener">abrir la hoja “Control – Equipo”</a>.</p>` : ''}`;
  return {
    titulo: 'Miembros', html,
    montar(el) {
      el.querySelector('[data-eq-sync]')?.addEventListener('click', alTocarSync);
      el.querySelector('[data-copiar]').onclick = () => copiar(EQ.enlaceInvitacion());
      el.querySelector('[data-agregar]').onclick = () => editarMiembro(null);
      el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => editarMiembro(b.dataset.editar));
      el.querySelectorAll('[data-aprobar]').forEach((b) => b.onclick = () => editarMiembro(b.dataset.aprobar, { aprobar: true }));
      el.querySelectorAll('[data-rechazar]').forEach((b) => b.onclick = async () => {
        if (await confirmar(`¿Rechazar a ${EQ.nombreDe(b.dataset.rechazar)}?`, 'Rechazar', true)) { await EQ.guardarMiembro({ id: b.dataset.rechazar, estado: 'inactivo' }); toast('Rechazado'); }
      });
      el.querySelector('.eq-reglas').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = leerForm(e.target);
        if (!(d.dias || []).length) { toast('Elige al menos un día'); return; }
        EQ.guardarConfigEquipo({
          nombreEquipo: d.nombreEquipo || 'Mi equipo', horaPlan: d.horaPlan, dias: d.dias.join(','),
          correoRecordatorio: d.correoRecordatorio ? 'si' : 'no', correoResumen: d.correoResumen ? 'si' : 'no', correoAsignacion: d.correoAsignacion ? 'si' : 'no',
        });
        toast('Reglas guardadas');
      });
    },
  };
}

function editarMiembro(id, op = {}) {
  const m = id ? EQ.miembro(id) : { rol: 'ingeniero', estado: 'activo' };
  if (!m) return;
  const yo = EQ.miEmail();
  const lideres = EQ.activos().filter((x) => (x.rol === 'lider') && x.id !== id);
  modal(op.aprobar ? `Aprobar a ${m.nombre}` : id ? m.nombre : 'Agregar persona', `<form class="form">
    ${id ? `<p class="nota">${esc(id)}</p>` : `<label class="campo campo-full"><span>Correo de Google (Gmail)</span><input name="email" type="email" required autofocus placeholder="nombre@gmail.com"></label>`}
    <div class="fila-campos">
      <label class="campo"><span>Nombre</span><input name="nombre" required value="${esc(m.nombre || '')}"></label>
      <label class="campo"><span>Cargo</span><input name="cargo" value="${esc(m.cargo || '')}" placeholder="Ej.: Ing. de planeamiento"></label>
    </div>
    ${id === yo ? '<p class="nota">Eres el jefe del equipo.</p>' : `<div class="fila-campos">
      <label class="campo"><span>Rol</span><select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${m.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo"><span>Su líder</span><select name="lider"><option value="">— Directo al jefe —</option>${lideres.map((l) => `<option value="${esc(l.id)}" ${m.lider === l.id ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select></label>
    </div>
    ${id ? `<label class="check-linea"><input type="checkbox" name="activo" ${m.estado !== 'inactivo' ? 'checked' : ''}> Activo (puede entrar a la app del equipo)</label>` : ''}`}
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">${op.aprobar ? 'Aprobar' : 'Guardar'}</button></div>
  </form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      const r = { id: id || d.email, nombre: d.nombre, cargo: d.cargo };
      if (id !== yo) { r.rol = d.rol; r.lider = d.rol === 'jefe' ? '' : d.lider; r.estado = id && !op.aprobar ? (d.activo ? 'activo' : 'inactivo') : 'activo'; }
      if (!id && EQ.miembro(r.id)) { toast('Esa persona ya está en el equipo'); return; }
      await EQ.guardarMiembro(r);
      toast(op.aprobar ? `${d.nombre} ya está en el equipo` : 'Guardado');
      cerrar();
    });
  });
}

// ============================================================
//  UNIRSE (enlace de invitación)
// ============================================================
export function vistaUnirse(q = {}) {
  // Recordar la invitación: si instala la app o entra con Google desde otra pantalla, se retoma sola
  if (q.u) localStorage.setItem('control.invitacion', JSON.stringify({ u: q.u, j: q.j || '' }));
  const url = q.u || '';
  const jefe = q.j || 'Tu jefe';
  const logueado = store.config().modo === 'google' && store.config().googleEmail;
  const html = `
  <div class="bienvenida eq-unirse">
    <div class="bv-cab"><img src="icons/icon-192.png" width="40" height="40" alt=""><span>Control</span></div>
    <div class="bv-hero">
      <h1>${esc(jefe)} te invitó a <em>su equipo</em></h1>
      <p>Cada mañana registras tus pendientes del día; tu jefe ve el avance del equipo y te asigna tareas. Tus datos personales quedan en tu propio Google Drive.</p>
      ${url ? `<button class="bv-google" data-unirme>${ic('usuario')} ${logueado ? `Unirme como ${esc(store.config().googleEmail)}` : 'Continuar con Google'}</button>` : '<p class="rojo">El enlace está incompleto. Pide a tu jefe que te lo envíe de nuevo.</p>'}
      <p class="bv-estado" data-msg></p>
    </div>
  </div>`;
  return {
    titulo: 'Unirse al equipo', html, layout: 'limpio',
    montar(el) {
      const msg = el.querySelector('[data-msg]');
      el.querySelector('[data-unirme]')?.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          if (!logueado || !G.tokenValido()) {
            msg.textContent = 'Abriendo Google…';
            if (!logueado) { const { conectarGoogle } = await import('./bienvenida.js'); if (!await conectarGoogle()) { b.disabled = false; msg.textContent = ''; return; } }
            else await G.pedirToken();
          }
          msg.textContent = 'Conectando con el equipo…';
          await EQ.conectar(url);
          localStorage.removeItem('control.invitacion');
          localStorage.setItem('control.iniciado', '1');
          location.hash = EQ.activo() ? (EQ.veEquipo() ? '#/panel' : '#/midia') : '#/midia';
          toast(EQ.activo() ? '¡Ya estás en el equipo!' : 'Solicitud enviada. Tu jefe debe aprobarte.', null, 6000);
        } catch (err) {
          msg.textContent = err.message;
          b.disabled = false;
        }
      });
    },
  };
}

// ============================================================
//  AJUSTES: sección "Equipo en línea"
// ============================================================
export function seccionAjustes() {
  const c = EQ.cfg();
  if (EQ.configurado()) {
    return `<section class="tarjeta" id="aj-equipo"><h3>${ic('equipo')} Equipo en línea</h3>
      <p>${EQ.activo() ? `Estás en <b>${esc(EQ.configEquipo().nombreEquipo)}</b> como <b>${esc(ROLES[EQ.miRol()] || '')}</b> (${esc(c.email || '')}).` : c.estado === 'solicitud' ? 'Tu solicitud está pendiente de aprobación.' : 'Conectando…'}</p>
      <div class="botones-rapidos">
        <a class="btn btn-mini" href="#/midia">Mi día</a>
        ${EQ.veEquipo() ? '<a class="btn btn-mini" href="#/panel">Panel del equipo</a>' : ''}
        ${EQ.esJefe() ? '<a class="btn btn-mini" href="#/miembros">Miembros y reglas</a>' : ''}
        <button class="btn btn-mini" data-eq-salir>Salir del equipo en este dispositivo</button>
      </div></section>`;
  }
  return `<section class="tarjeta" id="aj-equipo"><h3>${ic('equipo')} Equipo en línea</h3>
    <p class="nota">Tus ingenieros cargan sus pendientes cada mañana y tú ves el estado de cada uno y les asignas tareas. Los datos quedan en una hoja de tu Google Drive.</p>
    <div class="botones-rapidos">
      <button class="btn btn-mini btn-pri" data-eq-crear>Crear mi equipo (soy el jefe)</button>
      <button class="btn btn-mini" data-eq-enlace>Tengo un enlace de invitación</button>
    </div></section>`;
}
export function montarAjustes(el) {
  el.querySelector('[data-eq-crear]')?.addEventListener('click', asistenteCrear);
  el.querySelector('[data-eq-enlace]')?.addEventListener('click', () => {
    modal('Unirme con un enlace', `<form class="form"><label class="campo campo-full"><span>Pega el enlace que te enviaron</span><input name="enlace" required autofocus></label>
      <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Continuar</button></div></form>`, (m, cerrar) => {
      m.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = leerForm(e.target).enlace;
        const i = v.indexOf('#/unirse');
        if (i < 0) { toast('Ese no es un enlace de invitación de Control'); return; }
        cerrar();
        location.hash = v.slice(i);
      });
    });
  });
  el.querySelector('[data-eq-salir]')?.addEventListener('click', async () => {
    if (!await confirmar('¿Salir del equipo en este dispositivo? Los datos del equipo siguen en el servidor; puedes volver a entrar con el enlace.', 'Salir', true)) return;
    await EQ.olvidar();
    toast('Saliste del equipo en este dispositivo');
  });
}

/** Asistente para que el jefe cree el servidor del equipo. */
function asistenteCrear() {
  const conGoogle = store.config().modo === 'google' && store.config().googleEmail;
  modal('Crear tu equipo', `
  <div class="form eq-asistente">
    ${conGoogle ? '' : '<div class="aviso aviso-rojo"><span>Primero conecta la app con tu cuenta de Google (Ajustes → Google).</span></div>'}
    <p class="nota">Se crea un pequeño servidor gratuito en tu cuenta de Google (Apps Script) y una hoja <b>“Control – Equipo”</b> en tu Drive. Toma unos 3 minutos y se hace una sola vez.</p>
    <ol class="eq-pasos">
      <li><b>Copia el código del servidor</b><br><button class="btn btn-mini" data-copiar-codigo>${ic('copiar')} Copiar código</button></li>
      <li><b>Abre Apps Script</b> con tu cuenta de Google: <a href="https://script.new" target="_blank" rel="noopener">script.new</a>. Borra lo que aparece, <b>pega</b> el código y guarda (Ctrl+S). Ponle de nombre “Control Equipo”.</li>
      <li>Arriba a la derecha: <b>Implementar → Nueva implementación</b>. En el engranaje ⚙ elige <b>Aplicación web</b>.<br>
        Ejecutar como: <b>Yo</b> · Quién tiene acceso: <b>Cualquier usuario</b> → <b>Implementar</b>.</li>
      <li>Google pide <b>autorizar</b>: elige tu cuenta → “Configuración avanzada” → “Ir a Control Equipo” → <b>Permitir</b>. (Es tu propio servidor: puede manejar la hoja del equipo y enviar los recordatorios por correo.)</li>
      <li>Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>) y pégala aquí:</li>
    </ol>
    <label class="campo campo-full"><span>URL de la aplicación web</span><input name="url" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <p class="nota rojo" data-msg></p>
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri" data-conectar ${conGoogle ? '' : 'disabled'}>Crear equipo</button></div>
  </div>`, (el, cerrar) => {
    el.querySelector('[data-copiar-codigo]').onclick = async () => {
      try { const r = await fetch('apps-script/Equipo.gs', { cache: 'no-store' }); copiar(await r.text()); } catch { toast('No se pudo leer el código. Revisa tu conexión.'); }
    };
    el.querySelector('[data-conectar]').onclick = async (e) => {
      const b = e.currentTarget, msg = el.querySelector('[data-msg]');
      b.disabled = true; msg.textContent = 'Conectando… (la primera vez tarda unos segundos)';
      try {
        if (!G.tokenValido()) await G.pedirToken();
        await EQ.conectar(el.querySelector('[name=url]').value);
        if (!EQ.activo()) throw new Error(EQ.cfg().estado === 'solicitud' ? 'Ese servidor ya tiene un jefe: quedaste como solicitud.' : 'No se pudo conectar');
        cerrar();
        toast(EQ.esJefe() ? '¡Equipo creado! Ahora invita a tus ingenieros.' : 'Conectado al equipo', null, 6000);
        location.hash = EQ.esJefe() ? '#/miembros' : '#/midia';
      } catch (err) {
        msg.textContent = err.message;
        b.disabled = false;
      }
    };
  }, { ancho: 'ancho' });
}

/** Contadores para la navegación (pendientes nuevos, personas sin plan). */
export function contadoresEquipo() {
  if (!EQ.activo()) return { midia: 0, panel: 0 };
  const yo = EQ.miEmail();
  const midia = EQ.tareas().filter((t) => t.asignadoA === yo && t.creadoPor !== yo && !t.visto && t.estado !== 'hecho').length
    + EQ.sugerencias().filter((t) => t.asignadoA === yo && t.sugerencia === 'pendiente').length;
  const panel = EQ.veEquipo() && EQ.esDiaLaborable() && EQ.pasoHoraPlan() ? EQ.miEquipo().filter((m) => !EQ.estadoDia(m.id).planIso).length + (EQ.esJefe() ? EQ.solicitudes().length : 0) : 0;
  return { midia, panel };
}
