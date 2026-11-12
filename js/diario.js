// ============================================================
// diario.js — Cierre del día y diario de cierres.
// Al terminar la jornada: ver lo que cerraste, los avances que
// comentaste, pasar lo no terminado al siguiente día hábil y
// dejar un comentario general. Cada cierre queda guardado.
// ============================================================
import * as store from './store.js';
import * as M from './modelo.js';
import * as MD from './modales.js';
import { modal, toast, copiar } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, addDias, fmtFecha, fmtFechaLarga, fmtMomento, siguienteHabil, nowIso } from './util.js';

const idDia = (fecha) => `dia-${fecha}`;
export const cierreDe = (fecha) => store.obtener('diario', idDia(fecha));

/** Texto del resumen del día (para copiar, WhatsApp o correo). */
function textoResumen(fecha, r, comentario, movidos) {
  const nombre = store.config().miNombre;
  const l = [`CIERRE DEL DÍA — ${fmtFechaLarga(fecha)}${nombre ? ' — ' + nombre : ''}`, ''];
  l.push(`✔ CERRADO (${r.cerrados.length})`);
  l.push(...(r.cerrados.length ? r.cerrados.map((p) => `• ${p.titulo}${M.proyecto(p.proyectoId) ? ' [' + (M.proyecto(p.proyectoId).codigo || M.proyecto(p.proyectoId).nombre) + ']' : ''}`) : ['(nada cerrado)']));
  if (r.avances.length) {
    l.push('', `➜ AVANCES (${r.avances.length})`);
    l.push(...r.avances.map(({ p, c }) => `• ${p.titulo}: ${c.texto}`));
  }
  if (r.quedan.length) {
    l.push('', `⏳ PENDIENTE (${r.quedan.length})`);
    l.push(...r.quedan.map((p) => {
      const m = movidos?.find((x) => x.id === p.id);
      return `• ${p.titulo}${p.responsable ? ' — ' + M.nombrePersona(p.responsable) : ''}${m ? ` → ${fmtFecha(m.a, fecha)}` : ''}`;
    }));
  }
  if (comentario) l.push('', 'COMENTARIO', comentario);
  return l.join('\n');
}

/** Ventana de cierre del día. */
export function abrirCierreDia(fecha = hoy()) {
  const r = M.resumenDia(fecha);
  const previo = cierreDe(fecha);
  const sig = siguienteHabil(fecha);
  const man = addDias(fecha, 1);
  const html = `
  <div class="cierre">
    <div class="cierre-kpis">
      <div><b>${r.cerrados.length}</b><span>cerrados hoy</span></div>
      <div><b>${r.avances.length}</b><span>avances comentados</span></div>
      <div class="${r.quedan.length ? 'rojo' : ''}"><b>${r.quedan.length}</b><span>quedan pendientes</span></div>
    </div>

    <h4 class="sub-tit">${ic('check')} Cerrado hoy</h4>
    ${r.cerrados.length ? `<ul class="cierre-lista">${r.cerrados.map((p) => `<li class="ok">${ic('check')}<span>${esc(p.titulo)}</span>${M.ultimoComentario(p) ? `<em>${esc(M.ultimoComentario(p).texto)}</em>` : ''}</li>`).join('')}</ul>` : '<p class="nota">Nada marcado como hecho hoy.</p>'}

    ${r.avances.length ? `<h4 class="sub-tit">${ic('lista')} Avances comentados</h4>
    <ul class="cierre-lista">${r.avances.map(({ p, c }) => `<li><time>${esc(fmtMomento(c.t).slice(-5))}</time><span><b>${esc(p.titulo)}:</b> ${esc(c.texto)}</span></li>`).join('')}</ul>` : ''}

    <h4 class="sub-tit">${ic('reloj')} Quedó pendiente (de hoy o vencido)</h4>
    ${r.quedan.length ? `
      <div class="cierre-mover">
        <label>Pasar los marcados a:
          <select id="ci-destino">
            <option value="${sig}">Siguiente día hábil (${esc(fmtFecha(sig, fecha))})</option>
            ${man !== sig ? `<option value="${man}">Mañana (${esc(fmtFecha(man, fecha))})</option>` : ''}
            <option value="">No mover</option>
          </select>
        </label>
      </div>
      <ul class="cierre-lista">${r.quedan.map((p) => `
        <li data-id="${esc(p.id)}">
          <input type="checkbox" class="ci-mover" value="${esc(p.id)}" checked aria-label="Mover">
          <span>${esc(p.titulo)} <em class="${p.fecha < fecha ? 'rojo' : ''}">${esc(fmtFecha(p.fecha, fecha))}${p.responsable ? ' · ' + esc(M.nombrePersona(p.responsable).split(' ')[0]) : ''}</em></span>
          <button type="button" class="mini" data-com="${esc(p.id)}" title="Comentar avance">${ic('lista')}</button>
          <button type="button" class="mini" data-ok="${esc(p.id)}" title="Marcar hecho">${ic('check')}</button>
        </li>`).join('')}</ul>` : '<p class="nota">¡Nada pendiente para hoy! 👏</p>'}

    <h4 class="sub-tit">${ic('enviar')} Comentario del día</h4>
    <textarea id="ci-com" rows="4" placeholder="¿Cómo fue el día? Logros, problemas, decisiones, qué priorizar mañana…">${esc(previo?.comentario || '')}</textarea>
    <div class="acciones-modal">
      <button type="button" class="btn" id="ci-mic">${ic('mic')} Dictar</button>
      <span class="sep"></span>
      <button type="button" class="btn" id="ci-copiar">${ic('copiar')} Copiar resumen</button>
      <button type="button" class="btn btn-pri" id="ci-guardar">${ic('check')} Guardar cierre</button>
    </div>
    ${previo ? `<p class="nota">Ya hiciste el cierre de este día (${esc(fmtMomento(previo.updatedAt))}). Guardar lo actualiza.</p>` : ''}
  </div>`;

  modal(`Cierre del día · ${fmtFecha(fecha)}`, html, (el, cerrar) => {
    const ta = el.querySelector('#ci-com');
    const parar = MD.enlazarDictado(el.querySelector('#ci-mic'), ta, { continuo: true });
    el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
      await MD.alternarHecho(b.dataset.ok);
      cerrar(); setTimeout(() => abrirCierreDia(fecha), 200);
    });
    el.querySelectorAll('[data-com]').forEach((b) => b.onclick = () => MD.comentar(b.dataset.com));

    const seleccion = () => {
      const destino = el.querySelector('#ci-destino')?.value || '';
      if (!destino) return [];
      return [...el.querySelectorAll('.ci-mover:checked')].map((c) => ({ id: c.value, titulo: store.obtener('pendientes', c.value)?.titulo || '', a: destino }));
    };
    el.querySelector('#ci-copiar').onclick = () => copiar(textoResumen(fecha, M.resumenDia(fecha), ta.value.trim(), seleccion()));
    el.querySelector('#ci-guardar').onclick = async () => {
      parar();
      const rr = M.resumenDia(fecha);
      const movidos = seleccion();
      for (const m of movidos) {
        await store.guardar('pendientes', { id: m.id, fecha: m.a }, { historial: `Movido en el cierre del día (${fmtFecha(fecha)})` });
      }
      await store.guardar('diario', {
        id: idDia(fecha), fecha,
        comentario: ta.value.trim(),
        hechos: rr.cerrados.map((p) => ({ id: p.id, titulo: p.titulo })),
        avances: rr.avances.map(({ p, c }) => ({ id: p.id, titulo: p.titulo, texto: c.texto, t: c.t })),
        movidos,
        quedaron: rr.quedan.filter((p) => !movidos.some((m) => m.id === p.id)).map((p) => ({ id: p.id, titulo: p.titulo })),
        pendientesAbiertos: M.abiertos().length,
        cerradoA: nowIso(),
      });
      cerrar();
      toast(movidos.length ? `Cierre guardado · ${movidos.length} pendientes movidos a ${fmtFecha(movidos[0].a)}` : 'Cierre del día guardado', {
        texto: 'Copiar resumen', fn: () => copiar(textoResumen(fecha, rr, ta.value.trim(), movidos)),
      }, 7000);
    };
  }, { ancho: 'ancho' });
}

/** Vista con el historial de cierres. */
export function vistaDiario() {
  const H = hoy();
  const lista = store.todos('diario').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const hecho = !!cierreDe(H);
  const tarjeta = (d) => `
    <article class="dia">
      <header>
        <h3>${esc(fmtFechaLarga(d.fecha))}</h3>
        <div class="dia-chips">
          <span class="chip chip-verde">${ic('check')}${(d.hechos || []).length} cerrados</span>
          ${(d.avances || []).length ? `<span class="chip">${(d.avances || []).length} avances</span>` : ''}
          ${(d.movidos || []).length ? `<span class="chip chip-ambar">${(d.movidos || []).length} movidos</span>` : ''}
          ${(d.quedaron || []).length ? `<span class="chip chip-rojo">${(d.quedaron || []).length} sin mover</span>` : ''}
        </div>
        <button class="btn btn-mini" data-editar="${esc(d.fecha)}">Editar</button>
      </header>
      ${d.comentario ? `<p class="dia-com">${esc(d.comentario).replace(/\n/g, '<br>')}</p>` : '<p class="nota">Sin comentario.</p>'}
      <details><summary>Detalle</summary>
        ${(d.hechos || []).length ? `<h4 class="sub-tit">Cerrado</h4><ul>${d.hechos.map((x) => `<li>${esc(x.titulo)}</li>`).join('')}</ul>` : ''}
        ${(d.avances || []).length ? `<h4 class="sub-tit">Avances</h4><ul>${d.avances.map((x) => `<li><b>${esc(x.titulo)}:</b> ${esc(x.texto)}</li>`).join('')}</ul>` : ''}
        ${(d.movidos || []).length ? `<h4 class="sub-tit">Movidos</h4><ul>${d.movidos.map((x) => `<li>${esc(x.titulo)} → ${esc(fmtFecha(x.a, d.fecha))}</li>`).join('')}</ul>` : ''}
      </details>
    </article>`;
  return {
    titulo: 'Diario',
    html: `
    <header class="vista-cab"><div><h1>Diario</h1><p class="sub">Tus cierres del día: qué se hizo, qué avanzó y qué quedó.</p></div>
      <div class="vista-acc"><button class="btn btn-pri" data-cierre>${ic('check')} ${hecho ? 'Editar cierre de hoy' : 'Cierre de hoy'}</button></div></header>
    ${lista.length ? `<div class="dias">${lista.map(tarjeta).join('')}</div>` : `<div class="vacio vacio-grande">${ic('lista')}<b>Aún no hay cierres</b><span>Al terminar tu jornada pulsa “Cierre del día”.</span></div>`}`,
    montar(el) {
      el.querySelector('[data-cierre]').onclick = () => abrirCierreDia(H);
      el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => abrirCierreDia(b.dataset.editar));
    },
  };
}
