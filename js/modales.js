// ============================================================
// modales.js — Captura rápida y formularios de edición.
// ============================================================
import * as store from './store.js';
import * as M from './modelo.js';
import { parsear } from './parser.js';
import { escuchar, vozDisponible } from './voz.js';
import { modal, toast, confirmar, leerForm } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, addDias, fmtFecha, uid, fmtMomento } from './util.js';
import { COLORES, FASES, ENTREGABLES_TIPICOS } from './catalogo.js';
import * as C from './componentes.js';
import { OPCIONES_AVISO, botonesCalendario } from './alertas.js';

// ============================================================
// Acciones rápidas sobre pendientes
// ============================================================
export async function alternarHecho(id) {
  const p = store.obtener('pendientes', id);
  if (!p) return;
  const previo = p.estado || 'Pendiente';
  const cerrando = !(previo === 'Hecho' || previo === 'Cancelado');
  await store.guardar('pendientes', { id, estado: cerrando ? 'Hecho' : 'Pendiente', inbox: false });
  if (cerrando) {
    toast(`✓ ${p.titulo}`, [
      { texto: 'Comentar', fn: () => comentar(id, { cierre: true }) },
      { texto: 'Deshacer', fn: () => store.guardar('pendientes', { id, estado: previo }) },
    ], 6000);
  }
}

export async function posponer(id, dias) {
  const p = store.obtener('pendientes', id);
  if (!p) return;
  const H = hoy();
  const base = p.fecha && p.fecha > H ? p.fecha : H;
  const nueva = addDias(base, dias);
  await store.guardar('pendientes', { id, fecha: nueva }, { historial: `Pospuesto ${dias === 7 ? '1 semana' : dias + ' día(s)'}` });
  toast(`Pospuesto a ${fmtFecha(nueva)}`, { texto: 'Deshacer', fn: () => store.guardar('pendientes', { id, fecha: p.fecha || '' }) });
}

/** Busca o crea persona/proyecto a partir de lo que entendió el parser. */
async function resolverEntidades(r) {
  let responsable = r.responsableId || '';
  if (!responsable && r.responsableNombre) {
    const nueva = await store.guardar('personas', { nombre: r.responsableNombre, rol: '', disciplina: '' });
    responsable = nueva.id;
    toast(`Nueva persona en el equipo: ${r.responsableNombre}`);
  }
  let proyectoId = r.proyectoId || '';
  if (!proyectoId && r.proyectoNombre) {
    const nuevo = await store.guardar('proyectos', {
      nombre: r.proyectoNombre, codigo: r.proyectoNombre, fase: '', activo: true, hitos: [], disciplinas: [],
      color: COLORES[M.proyectos().length % COLORES.length], avance: 0,
    });
    proyectoId = nuevo.id;
    toast(`Nuevo proyecto: ${r.proyectoNombre}`);
  }
  return { responsable, proyectoId };
}

/** Crea un pendiente a partir de una frase. */
export async function crearDesdeTexto(texto, extra = {}) {
  const r = parsear(texto, M.contextoParser());
  const { responsable, proyectoId } = await resolverEntidades(r);
  const pr = M.proyecto(proyectoId || extra.proyectoId);
  const p = {
    titulo: r.titulo, fecha: r.fecha || '', hora: r.hora || '',
    responsable, proyectoId, prioridad: r.prioridad || 'media',
    disciplina: r.disciplina || '', fase: pr?.fase || '',
    estado: r.esperando ? 'Esperando a tercero' : 'Pendiente',
    origen: 'Propio', textoOriginal: texto.trim(),
    ...extra,
  };
  if (!p.proyectoId && extra.proyectoId) p.proyectoId = extra.proyectoId;
  // Va a la bandeja si le falta información clave
  if (p.inbox === undefined) p.inbox = !(p.fecha && (p.proyectoId || p.responsable));
  return store.guardar('pendientes', p);
}

// ============================================================
// DICTADO EN UN CAMPO DE TEXTO (comentarios, cierre del día)
// ============================================================
/** Conecta un botón de micrófono para dictar dentro de un textarea/input. */
export function enlazarDictado(boton, campo, op = {}) {
  let detener = null;
  if (!vozDisponible()) { boton.title = 'Dictado no disponible: usa el micrófono del teclado'; }
  boton.addEventListener('click', () => {
    if (!vozDisponible()) { toast('Usa el micrófono del teclado de tu celular'); campo.focus(); return; }
    if (detener) { detener(); return; }
    const base = campo.value.trim();
    boton.classList.add('escuchando');
    detener = escuchar({
      continuo: !!op.continuo,
      onParcial: (t) => { campo.value = (base ? base + ' ' : '') + t; campo.dispatchEvent(new Event('input')); },
      onError: (m) => toast(m),
      onFin: () => { detener = null; boton.classList.remove('escuchando'); campo.focus(); },
    });
  });
  return () => detener?.();
}

// ============================================================
// COMENTARIOS (bitácora con fecha y hora)
// ============================================================
const listaComentarios = (p) => {
  const cs = M.comentarios(p);
  if (!cs.length) return '<li class="com-vacio">Aún no hay comentarios.</li>';
  return [...cs].reverse().map((c) => `<li><time>${esc(fmtMomento(c.t))}</time><span>${esc(c.texto)}</span></li>`).join('');
};
const bloqueComentarios = (p, placeholder = 'Escribe o dicta el avance…') => `
  <div class="comentarios">
    <div class="com-nuevo">
      <textarea class="com-texto" rows="2" placeholder="${esc(placeholder)}"></textarea>
      <div class="com-acc">
        <button type="button" class="btn btn-mini com-mic" title="Dictar">${ic('mic')} Dictar</button>
        <button type="button" class="btn btn-mini btn-pri com-agregar">${ic('mas2')} Agregar comentario</button>
      </div>
    </div>
    <ul class="com-lista">${listaComentarios(p)}</ul>
  </div>`;
function montarComentarios(el, id, alAgregar) {
  const ta = el.querySelector('.com-texto');
  const lista = el.querySelector('.com-lista');
  const parar = enlazarDictado(el.querySelector('.com-mic'), ta);
  const agregar = async () => {
    if (!ta.value.trim()) { ta.focus(); return false; }
    parar();
    const p = await M.agregarComentario(id, ta.value);
    ta.value = '';
    lista.innerHTML = listaComentarios(p);
    toast('Comentario guardado');
    alAgregar?.();
    return true;
  };
  el.querySelector('.com-agregar').addEventListener('click', agregar);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); agregar(); } });
  return { agregar, pendiente: () => ta.value.trim(), parar };
}

/** Ventana rápida para comentar un pendiente (también al cerrarlo). */
export function comentar(id, op = {}) {
  const p = store.obtener('pendientes', id);
  if (!p) return;
  modal(op.cierre ? 'Comentario de cierre' : 'Agregar comentario', `
    <p class="com-tit">${esc(p.titulo)}</p>
    ${bloqueComentarios(p, op.cierre ? '¿Cómo se cerró? (ej.: “Enviado al cliente, aprobado por Juan”)' : 'Escribe o dicta el avance…')}
    <div class="acciones-modal">
      ${M.esAbierto(p) ? `<button type="button" class="btn" data-hecho>${ic('check')} Marcar hecho</button>` : ''}
      <span class="sep"></span>
      <button type="button" class="btn" data-cerrar>Cerrar</button>
    </div>`, (el, cerrar) => {
    const c = montarComentarios(el, id, () => { if (op.cierre) cerrar(); });
    el.querySelector('.com-texto').focus();
    el.querySelector('[data-hecho]')?.addEventListener('click', async () => {
      if (c.pendiente()) await c.agregar();
      await alternarHecho(id); cerrar();
    });
  });
}

// ============================================================
// CAPTURA RÁPIDA
// ============================================================
export function abrirCaptura(op = {}) {
  let detener = null;
  const conVoz = vozDisponible();
  const html = `
  <div class="captura">
    <div class="captura-entrada">
      <textarea id="cap-texto" rows="3" autofocus placeholder="Ej.: mañana 10am revisar CAPEX con @Ana #Huaylla !alta"></textarea>
      <button class="mic-grande ${conVoz ? '' : 'deshabilitado'}" id="cap-mic" type="button" title="${conVoz ? 'Dictar (voz)' : 'Dictado no disponible: usa el micrófono del teclado'}">${ic('mic')}</button>
    </div>
    <div class="cap-estado" id="cap-estado">${conVoz ? 'Toca el micrófono y habla, o escribe. <kbd>Enter</kbd> guarda.' : 'Escribe o usa el micrófono de tu teclado. <kbd>Enter</kbd> guarda.'}</div>
    <div class="cap-preview" id="cap-preview"></div>
    <div class="acciones-modal">
      <button class="btn" id="cap-det" type="button">Más detalles…</button>
      <span class="sep"></span>
      <button class="btn" id="cap-otro" type="button">Guardar y otro</button>
      <button class="btn btn-pri" id="cap-guardar" type="button">${ic('check')} Guardar</button>
    </div>
    <details class="cap-ayuda"><summary>¿Qué entiende?</summary>
      <ul>
        <li><b>Fecha:</b> hoy, mañana, pasado mañana, viernes, próximo lunes, 15/11, 20 de noviembre, el 18, en 3 días, la próxima semana, fin de mes</li>
        <li><b>Hora:</b> 10am, 3 pm, 10:30, a las 3, 8 de la mañana, en la tarde</li>
        <li><b>Responsable:</b> @Juan, con Juan, responsable Juan, pedir a Juan, encargar a Juan</li>
        <li><b>Proyecto:</b> #Huaylla o “proyecto Huaylla” (usa el código corto del proyecto)</li>
        <li><b>Prioridad:</b> !alta, !baja, prioridad alta, urgente</li>
        <li><b>Esperando:</b> “esperando respuesta de Luis…” → estado Esperando a tercero</li>
      </ul>
    </details>
  </div>`;

  modal('Captura rápida', html, (el, cerrar) => {
    const ta = el.querySelector('#cap-texto');
    const prev = el.querySelector('#cap-preview');
    const est = el.querySelector('#cap-estado');
    const mic = el.querySelector('#cap-mic');
    if (op.texto) ta.value = op.texto;

    const pintar = () => {
      const t = ta.value.trim();
      if (!t) { prev.innerHTML = ''; return; }
      const r = parsear(t, M.contextoParser());
      const ch = [];
      ch.push(`<span class="pv pv-tit">${esc(r.titulo)}</span>`);
      if (r.fecha) ch.push(`<span class="pv">${ic('calendario')}${esc(fmtFecha(r.fecha))}${r.hora ? ' ' + r.hora : ''}</span>`);
      if (r.responsableNombre) ch.push(`<span class="pv">${ic('usuario')}${esc(r.responsableNombre)}${r.responsableId ? '' : ' <em>(nueva)</em>'}</span>`);
      if (r.proyectoNombre) ch.push(`<span class="pv">${ic('proyecto')}${esc(r.proyectoNombre)}${r.proyectoId ? '' : ' <em>(nuevo)</em>'}</span>`);
      if (r.prioridad) ch.push(`<span class="pv pv-${r.prioridad}">${ic('bandera')}${r.prioridad}</span>`);
      if (r.esperando) ch.push(`<span class="pv">${ic('espera')}Esperando</span>`);
      if (r.disciplina) ch.push(`<span class="pv pv-tenue">${esc(r.disciplina)}</span>`);
      const aInbox = !(r.fecha && (r.proyectoId || r.proyectoNombre || r.responsableNombre));
      ch.push(`<span class="pv pv-destino">→ ${aInbox ? 'Inbox (falta fecha o proyecto/responsable)' : 'Pendientes'}</span>`);
      prev.innerHTML = ch.join('');
    };
    ta.addEventListener('input', pintar);
    pintar();

    const guardar = async (seguir) => {
      const t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      detener?.();
      const p = await crearDesdeTexto(t, op.extra || {});
      toast(p.inbox ? 'Guardado en Inbox' : `Guardado: ${p.titulo}`);
      if (seguir) { ta.value = ''; pintar(); ta.focus(); }
      else cerrar();
    };
    el.querySelector('#cap-guardar').onclick = () => guardar(false);
    el.querySelector('#cap-otro').onclick = () => guardar(true);
    el.querySelector('#cap-det').onclick = async () => {
      const t = ta.value.trim();
      detener?.();
      cerrar();
      if (t) { const p = await crearDesdeTexto(t, op.extra || {}); editarPendiente(p.id); }
      else editarPendiente(null, op.extra);
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar(e.ctrlKey || e.metaKey); }
    });

    const iniciarVoz = () => {
      if (!conVoz) { toast('Usa el micrófono del teclado de tu celular'); ta.focus(); return; }
      if (detener) { detener(); return; }
      const base = ta.value.trim();
      mic.classList.add('escuchando');
      est.textContent = 'Escuchando… habla ahora';
      detener = escuchar({
        onParcial: (t) => { ta.value = (base ? base + ' ' : '') + t; pintar(); },
        onError: (m) => { est.textContent = m; },
        onFin: () => {
          detener = null;
          mic.classList.remove('escuchando');
          if (ta.value.trim()) { est.innerHTML = 'Revisa y pulsa <b>Guardar</b> (o corrige el texto).'; el.querySelector('#cap-guardar').focus(); }
          else est.textContent = 'No se captó texto. Intenta de nuevo.';
        },
      });
    };
    mic.onclick = iniciarVoz;
    if (op.voz) setTimeout(iniciarVoz, 250);
  }, { alCerrar: () => detener?.() });
}

// ============================================================
// EDITAR PENDIENTE
// ============================================================
export function editarPendiente(id, defecto = {}) {
  const p = id ? store.obtener('pendientes', id) : { estado: 'Pendiente', prioridad: 'media', origen: 'Propio', ...defecto };
  if (!p) return;
  const reunion = p.reunionId ? store.obtener('reuniones', p.reunionId) : null;
  const html = `
  <form class="form" id="f-pend">
    <label class="campo campo-full"><span>Título</span><input name="titulo" required value="${esc(p.titulo || '')}" autofocus></label>
    <div class="fila-campos">
      <label class="campo"><span>Fecha compromiso</span><input type="date" name="fecha" value="${esc(p.fecha || '')}"></label>
      <label class="campo campo-corto"><span>Hora</span><input type="time" name="hora" value="${esc(p.hora || '')}"></label>
      <label class="campo campo-corto"><span>Avisarme</span><select name="avisoMin">${OPCIONES_AVISO.map(([v, t]) => `<option value="${v}" ${String(p.avisoMin ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Estado</span><select name="estado">${C.optsEstados(p.estado)}</select></label>
    </div>
    ${id && p.fecha && p.hora ? `<div class="botones-rapidos cal-botones">${botonesCalendario('pendiente', p)}</div>` : ''}
    <div class="campo"><span>Prioridad</span>
      <div class="segmentado">${['alta', 'media', 'baja'].map((x) => `<label class="seg seg-${x}"><input type="radio" name="prioridad" value="${x}" ${p.prioridad === x ? 'checked' : ''}><span>${x[0].toUpperCase() + x.slice(1)}</span></label>`).join('')}</div>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Responsable</span><select name="responsable">${C.optsPersonas(p.responsable || '')}</select></label>
      <label class="campo"><span>Solicitante</span><input name="solicitante" value="${esc(p.solicitante || '')}" placeholder="¿Quién lo pidió?"></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Proyecto</span><select name="proyectoId">${C.optsProyectos(p.proyectoId)}</select></label>
      <label class="campo"><span>Fase</span><select name="fase">${C.optsFases(p.fase)}</select></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Disciplina</span><select name="disciplina">${C.optsDisciplinas(p.disciplina)}</select></label>
      <label class="campo"><span>Origen</span><select name="origen">${C.optsOrigen(p.origen)}</select></label>
    </div>
    <label class="campo campo-full"><span>Descripción</span><textarea name="descripcion" rows="2">${esc(p.descripcion || '')}</textarea></label>
    <label class="campo campo-full"><span>Notas generales</span><textarea name="notas" rows="2">${esc(p.notas || '')}</textarea></label>
    ${id ? `<div class="campo campo-full"><span>Comentarios y avances (${M.comentarios(p).length})</span>${bloqueComentarios(p)}</div>` : ''}
    <label class="check-linea"><input type="checkbox" name="inbox" ${p.inbox ? 'checked' : ''}> Dejar en Inbox (por clasificar)</label>
    ${reunion ? `<p class="nota">Origen: reunión <a href="#/reunion/${esc(reunion.id)}" data-cerrar>${esc(reunion.titulo)} (${esc(fmtFecha(reunion.fecha))})</a></p>` : ''}
    ${p.textoOriginal ? `<p class="nota">Captura original: “${esc(p.textoOriginal)}”</p>` : ''}
    ${id ? `<div class="botones-rapidos">
      <button type="button" class="btn" data-pos="1">+1 día</button>
      <button type="button" class="btn" data-pos="7">+1 semana</button>
      <button type="button" class="btn" data-hoy>Para hoy</button>
    </div>` : ''}
    ${p.historial?.length ? `<details class="historial"><summary>Historial (${p.historial.length})</summary><ul>${[...p.historial].reverse().map((h) => `<li><time>${esc(new Date(h.t).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }))}</time> ${esc(h.m)}</li>`).join('')}</ul></details>` : ''}
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span>
      ${id && p.estado !== 'Hecho' ? `<button type="button" class="btn" data-hecho>${ic('check')} Hecho</button>` : ''}
      <button type="submit" class="btn btn-pri">Guardar</button>
    </div>
  </form>`;

  modal(id ? 'Editar pendiente' : 'Nuevo pendiente', html, (el, cerrar) => {
    const f = el.querySelector('form');
    // Al elegir proyecto, completar fase si está vacía
    f.proyectoId.addEventListener('change', () => {
      const pr = M.proyecto(f.proyectoId.value);
      if (pr?.fase && !f.fase.value) f.fase.value = pr.fase;
    });
    const com = id ? montarComentarios(el, id) : null;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      if (!d.titulo) return;
      if (com?.pendiente()) await com.agregar(); // no perder un comentario escrito sin pulsar "Agregar"
      await store.guardar('pendientes', { ...(id ? { id } : defecto), ...d });
      toast('Guardado');
      cerrar();
    });
    el.querySelectorAll('[data-pos]').forEach((b) => b.onclick = async () => { await posponer(id, Number(b.dataset.pos)); cerrar(); });
    el.querySelector('[data-hoy]')?.addEventListener('click', async () => { await store.guardar('pendientes', { id, fecha: hoy(), inbox: false }); toast('Movido a hoy'); cerrar(); });
    el.querySelector('[data-hecho]')?.addEventListener('click', async () => {
      if (com?.pendiente()) await com.agregar();
      await alternarHecho(id); cerrar();
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (await confirmar('¿Eliminar este pendiente?', 'Eliminar', true)) {
        await store.borrar('pendientes', id);
        toast('Eliminado', { texto: 'Deshacer', fn: () => store.guardar('pendientes', { id, deleted: false }) });
        cerrar();
      }
    });
  }, { ancho: 'ancho' });
}

// ============================================================
// EDITAR REUNIÓN
// ============================================================
export function editarReunion(id, defecto = {}, alGuardar) {
  const r = id ? store.obtener('reuniones', id) : { fecha: hoy(), hora: '', duracion: 60, estado: 'Programada', participantes: [], ...defecto };
  const sel = new Set(r.participantes || []);
  const html = `
  <form class="form">
    <label class="campo campo-full"><span>Título</span><input name="titulo" required value="${esc(r.titulo || '')}" autofocus placeholder="Ej.: Coordinación semanal PFS"></label>
    <div class="fila-campos">
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" required value="${esc(r.fecha || '')}"></label>
      <label class="campo campo-corto"><span>Hora</span><input type="time" name="hora" value="${esc(r.hora || '')}"></label>
      <label class="campo campo-corto"><span>Duración (min)</span><input type="number" name="duracion" min="5" step="5" value="${esc(r.duracion || 60)}"></label>
      <label class="campo campo-corto"><span>Avisarme</span><select name="avisoMin">${OPCIONES_AVISO.map(([v, t]) => `<option value="${v}" ${String(r.avisoMin ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Proyecto</span><select name="proyectoId">${C.optsProyectos(r.proyectoId)}</select></label>
      <label class="campo"><span>Estado</span><select name="estado">${['Programada', 'Realizada', 'Cancelada'].map((x) => `<option ${r.estado === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <div class="campo campo-full"><span>Participantes</span>
      <div class="chips-check">${M.personas().map((p) => `<label><input type="checkbox" name="participantes" data-multi value="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}><span>${esc(p.nombre)}</span></label>`).join('') || '<em class="tenue">Agrega personas en Equipo</em>'}</div>
    </div>
    <label class="campo campo-full"><span>Objetivo / agenda</span><textarea name="objetivo" rows="2">${esc(r.objetivo || '')}</textarea></label>
    <label class="campo campo-full"><span>Enlace (Teams / Zoom / Meet)</span><input name="enlace" type="url" value="${esc(r.enlace || '')}" placeholder="https://…"></label>
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span>
      <button type="submit" class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  modal(id ? 'Editar reunión' : 'Nueva reunión', html, (el, cerrar) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      d.duracion = Number(d.duracion) || 60;
      const g = await store.guardar('reuniones', { ...(id ? { id } : {}), ...d });
      cerrar();
      alGuardar?.(g);
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (await confirmar('¿Eliminar esta reunión?', 'Eliminar', true)) {
        await store.borrar('reuniones', id); cerrar(); location.hash = '#/reuniones';
      }
    });
  }, { ancho: 'ancho' });
}

// ============================================================
// EDITAR PERSONA
// ============================================================
export function editarPersona(id) {
  const p = id ? store.obtener('personas', id) : {};
  const html = `
  <form class="form">
    <label class="campo campo-full"><span>Nombre</span><input name="nombre" required value="${esc(p.nombre || '')}" autofocus></label>
    <div class="fila-campos">
      <label class="campo"><span>Rol / cargo</span><input name="rol" value="${esc(p.rol || '')}"></label>
      <label class="campo"><span>Disciplina</span><select name="disciplina">${C.optsDisciplinas(p.disciplina)}</select></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Correo</span><input type="email" name="email" value="${esc(p.email || '')}"></label>
      <label class="campo"><span>Teléfono / WhatsApp</span><input name="telefono" value="${esc(p.telefono || '')}" placeholder="51999888777"></label>
    </div>
    <label class="campo campo-full"><span>Empresa</span><input name="empresa" value="${esc(p.empresa || '')}" placeholder="Propia, cliente, contratista…"></label>
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span><button class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  modal(id ? 'Editar persona' : 'Nueva persona', html, (el, cerrar) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await store.guardar('personas', { ...(id ? { id } : {}), ...leerForm(f) });
      cerrar();
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      const n = M.abiertos().filter((x) => x.responsable === id).length;
      if (await confirmar(n ? `Tiene ${n} pendientes abiertos que pasarán a ti. ¿Eliminar?` : '¿Eliminar esta persona?', 'Eliminar', true)) {
        for (const x of M.abiertos().filter((x) => x.responsable === id)) await store.guardar('pendientes', { id: x.id, responsable: '' });
        await store.borrar('personas', id); cerrar(); location.hash = '#/equipo';
      }
    });
  });
}

// ============================================================
// EDITAR PROYECTO
// ============================================================
export function editarProyecto(id) {
  const p = id ? store.obtener('proyectos', id) : { activo: true, color: COLORES[M.proyectos().length % COLORES.length], disciplinas: [], hitos: [] };
  const dsel = new Set(p.disciplinas || []);
  const html = `
  <form class="form">
    <div class="fila-campos">
      <label class="campo"><span>Nombre del proyecto</span><input name="nombre" required value="${esc(p.nombre || '')}" autofocus></label>
      <label class="campo campo-corto"><span>Código (para #)</span><input name="codigo" value="${esc(p.codigo || '')}" placeholder="Huaylla"></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Cliente</span><input name="cliente" value="${esc(p.cliente || '')}"></label>
      <label class="campo"><span>Fase</span><select name="fase">${C.optsFases(p.fase)}</select></label>
    </div>
    <div class="campo campo-full"><span>Color</span>
      <div class="colores">${COLORES.map((c) => `<label><input type="radio" name="color" value="${c}" ${p.color === c ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div>
    </div>
    <label class="campo campo-full"><span>Descripción / alcance</span><textarea name="descripcion" rows="2">${esc(p.descripcion || '')}</textarea></label>
    <div class="campo campo-full"><span>Disciplinas involucradas</span>
      <div class="chips-check">${M.disciplinas().map((d) => `<label><input type="checkbox" name="disciplinas" data-multi value="${esc(d.nombre)}" ${dsel.has(d.nombre) ? 'checked' : ''}><span>${esc(d.nombre)}</span></label>`).join('')}</div>
    </div>
    <label class="check-linea"><input type="checkbox" name="activo" ${p.activo !== false ? 'checked' : ''}> Proyecto activo</label>
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span><button class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  modal(id ? 'Editar proyecto' : 'Nuevo proyecto', html, (el, cerrar) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      if (!d.codigo) d.codigo = d.nombre.split(/\s+/)[0];
      d.codigo = d.codigo.replace(/\s+/g, '');
      const g = await store.guardar('proyectos', { ...(id ? { id } : { hitos: [], avance: 0 }), ...d });
      cerrar();
      if (!id) location.hash = `#/proyecto/${g.id}`;
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (await confirmar('¿Eliminar el proyecto? Sus pendientes quedarán sin proyecto.', 'Eliminar', true)) {
        await store.borrar('proyectos', id); cerrar(); location.hash = '#/proyectos';
      }
    });
  }, { ancho: 'ancho' });
}

/** Carga los entregables típicos de la fase como hitos del proyecto. */
export async function cargarEntregables(id) {
  const p = store.obtener('proyectos', id);
  const lista = ENTREGABLES_TIPICOS[p.fase];
  if (!lista) { toast('Primero define la fase del proyecto'); return; }
  const existentes = new Set((p.hitos || []).map((h) => h.nombre));
  const nuevos = lista.filter(([n]) => !existentes.has(n)).map(([nombre, disciplina]) => ({ id: uid(), nombre, disciplina, fecha: '', hecho: false }));
  await store.guardar('proyectos', { id, hitos: [...(p.hitos || []), ...nuevos] });
  toast(`${nuevos.length} entregables agregados`);
}

export { FASES };
