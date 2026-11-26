// ============================================================
// vistas.js — Pantallas de la app.
// Cada vista devuelve { titulo, html, montar(el) }.
// Las acciones comunes (marcar hecho, abrir, posponer) se manejan
// en app.js por delegación con atributos data-acc.
// ============================================================
import { VERSION_APP } from './config.js';
import * as EQV from './equipo.js';
import * as EQ from './equipo-datos.js';
import * as store from './store.js';
import * as M from './modelo.js';
import * as C from './componentes.js';
import * as MD from './modales.js';
import { sincronizar, llamarApi, estadoSync, encolarTodo } from './sync.js';
import * as G from './google.js';
import { conectarGoogle } from './bienvenida.js';
import { parsear } from './parser.js';
import { escuchar, vozDisponible } from './voz.js';
import { cargarDemo } from './demo.js';
import { abrirCierreDia, cierreDe } from './diario.js';
import { puedeInstalar, yaInstalada } from './instalar.js';
import { activarAvisos, permisoNotif, probarAviso, botonesCalendario, descargarAgendaICS } from './alertas.js';
import { toast, confirmar, copiar, descargar, modal, sinRefrescar, leerForm } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, addDias, fmtFecha, fmtFechaLarga, diffDias, inicioSemana, agrupar, norm, debounce, uid, fechaLocal, fmtMomento } from './util.js';
import { ESTADOS, ESTADOS_ABIERTOS } from './catalogo.js';

// ============================================================
// Utilidades de vista
// ============================================================
const cab = (titulo, sub = '', acciones = '') => `
  <header class="vista-cab">
    <div><h1>${esc(titulo)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <div class="vista-acc">${acciones}</div>
  </header>`;

/** Campo de captura en línea (Enter = guardar). extra: valores por defecto. */
const capturaLinea = (placeholder, idx = 'linea') => `
  <div class="cap-linea" data-cap="${idx}">
    ${ic('mas2')}
    <input type="text" id="cap-linea-${idx}" placeholder="${esc(placeholder)}" aria-label="Captura rápida" enterkeyhint="done">
    <button class="icon-btn" data-mic title="Dictar">${ic('mic')}</button>
  </div>`;

function montarCapturaLinea(el, extra = {}) {
  el.querySelectorAll('.cap-linea').forEach((c) => {
    const inp = c.querySelector('input');
    inp.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && inp.value.trim()) {
        const t = inp.value.trim();
        inp.value = '';
        const p = await MD.crearDesdeTexto(t, { ...extra });
        toast(p.inbox ? 'Guardado en Inbox' : `Guardado: ${p.titulo}`);
      }
    });
    c.querySelector('[data-mic]').addEventListener('click', () => MD.abrirCaptura({ voz: true, extra }));
  });
}

const bienvenida = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

const linkWhatsApp = (tel, texto) => `https://wa.me/${(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
const linkCorreo = (email, asunto, cuerpo) => `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

// ============================================================
// HOY (tablero)
// ============================================================
export function vistaHoy() {
  const cfg = store.config();
  const H = hoy();
  const venc = M.vencidos();
  const dh = M.deHoy();
  const reus = M.reunionesDe(H).filter((r) => r.estado !== 'Cancelada');
  const esp = M.esperando();
  const prox = M.proximos(7);
  const nInbox = M.inbox().length;
  const ind = M.indicadores();
  const maxP = Math.max(1, ...ind.porProyecto.map((x) => x.abiertos));
  const maxPe = Math.max(1, ...ind.porPersona.map((x) => x.abiertos));
  const maxA = Math.max(1, ...Object.values(ind.antiguedad));

  const kpi = (n, et, href, clase, icono) => `
    <a class="kpi ${clase}" href="${href}">${ic(icono)}<b>${n}</b><span>${et}</span></a>`;

  const html = `
  ${cab(`${bienvenida()}${cfg.miNombre ? ', ' + esc(cfg.miNombre.split(' ')[0]) : ''}`, esc(fmtFechaLarga(H)),
    `<a class="btn" href="#/revision">${ic('revision')}<span class="solo-desk">Revisión semanal</span></a>
     <button class="btn btn-pri" data-cierre-dia>${ic('check')}<span>${cierreDe(H) ? 'Editar cierre' : 'Cierre del día'}</span></button>`)}
  ${new Date().getHours() >= 17 && !cierreDe(H) ? `<div class="aviso aviso-cierre">${ic('reloj')}<span><b>¿Terminando el día?</b> Haz tu cierre: revisa lo hecho, comenta y pasa lo pendiente a mañana.</span><button class="btn btn-mini btn-pri" data-cierre-dia>Cierre del día</button></div>` : ''}
  ${cfg.demo ? `<div class="aviso">${ic('campana')}<span>Estás viendo <b>datos de ejemplo</b>. Explora la app y cuando quieras empieza con los tuyos.</span><button class="btn btn-mini" data-borrar-demo>Borrar ejemplo y empezar</button></div>` : ''}
  ${puedeInstalar() && !localStorage.getItem('control.ocultarInstalar') ? `<div class="aviso aviso-instalar">${ic('descargar')}<span><b>Instala Control en tu celular</b> para abrirla desde un ícono, a pantalla completa y sin internet.</span><button class="btn btn-mini btn-pri" data-instalar>Instalar</button><button class="icon-btn" data-ocultar-instalar title="No mostrar más">${ic('x')}</button></div>` : ''}
  ${!cfg.notificaciones && permisoNotif() !== 'unsupported' && !localStorage.getItem('control.ocultarAvisos') ? `<div class="aviso aviso-avisos">${ic('campana')}<span><b>Activa los avisos</b> para que te recuerde antes de tus reuniones y pendientes con hora.</span><button class="btn btn-mini btn-pri" data-activar-avisos>Activar avisos</button><button class="icon-btn" data-ocultar-avisos title="No mostrar más">${ic('x')}</button></div>` : ''}
  ${capturaLinea('Captura rápida: “mañana 10am revisar CAPEX con @Ana #Huaylla”  (Enter)')}
  <div class="kpis">
    ${kpi(venc.length, 'Vencidos', '#/pendientes?rango=vencidos', venc.length ? 'kpi-rojo' : '', 'reloj')}
    ${kpi(dh.length, 'Para hoy', '#/pendientes?rango=hoy', dh.length ? 'kpi-ambar' : '', 'hoy')}
    ${kpi(reus.length, 'Reuniones hoy', '#/reuniones', '', 'calendario')}
    ${kpi(esp.length, 'Esperando de otros', '#/pendientes?vista=esperando', '', 'espera')}
  </div>
  ${nInbox ? `<a class="aviso aviso-azul" href="#/inbox">${ic('inbox')}<span>Tienes <b>${nInbox}</b> ${nInbox === 1 ? 'captura' : 'capturas'} sin clasificar en el Inbox</span>${ic('flecha')}</a>` : ''}
  <div class="rejilla-2">
    <div>
      ${venc.length ? C.seccion('Vencidos', C.listaPendientes(venc, '', { clave: 'hoy-venc', limite: 15 }), { n: venc.length, colorN: 'n-rojo', icono: 'reloj', clase: 'sec-roja', extra: venc.length > 15 ? `<a class="mini-link" href="#/pendientes?rango=vencidos&vista=lista">Ver todos</a>` : '' }) : ''}
      ${C.seccion('Para hoy', C.listaPendientes(dh, 'Nada programado para hoy. ¡Buen momento para avanzar lo importante!'), { n: dh.length, icono: 'hoy' })}
      ${C.seccion('Próximos 7 días', C.listaPendientes(prox, 'Sin compromisos en los próximos 7 días', { clave: 'hoy-prox', limite: 20 }), { n: prox.length, icono: 'calendario' })}
    </div>
    <div>
      ${C.seccion('Reuniones de hoy', reus.length ? `<div class="lista">${reus.map(tarjetaReunion).join('')}</div>` : '<div class="vacio">Sin reuniones hoy</div>', { n: reus.length, icono: 'calendario', extra: `<a class="mini-link" href="#/reuniones">Ver agenda</a>` })}
      ${C.seccion('Indicadores', `
        <div class="ind-tiles">
          <div class="ind"><b>${ind.cumplimiento === null ? '—' : ind.cumplimiento + '%'}</b><span>Cumplimiento a tiempo (30 d)</span></div>
          <div class="ind"><b>${ind.cerradosSemana}</b><span>Cerrados esta semana</span></div>
          <div class="ind"><b>${ind.abiertos}</b><span>Abiertos</span></div>
        </div>
        ${ind.porProyecto.length ? `<h4 class="sub-tit">Abiertos por proyecto</h4>${ind.porProyecto.map((x) => C.barra(x.nombre, x.abiertos, maxP, { color: x.color, rojo: x.vencidos, href: `#/proyecto/${x.id}` })).join('')}` : ''}
        ${ind.porPersona.length ? `<h4 class="sub-tit">Abiertos por persona</h4>${ind.porPersona.map((x) => C.barra(x.nombre, x.abiertos, maxPe, { rojo: x.vencidos, href: `#/persona/${x.id || 'yo'}` })).join('')}` : ''}
        <h4 class="sub-tit">Antigüedad de pendientes abiertos</h4>
        ${Object.entries(ind.antiguedad).map(([k, v]) => C.barra(k, v, maxA)).join('')}
      `, { icono: 'hoy' })}
    </div>
  </div>`;

  return {
    titulo: 'Hoy', html,
    montar(el, refrescar) {
      montarCapturaLinea(el);
      el.querySelectorAll('[data-cierre-dia]').forEach((b) => b.onclick = () => abrirCierreDia());
      el.querySelector('[data-activar-avisos]')?.addEventListener('click', async () => {
        if (await activarAvisos()) { probarAviso(); refrescar(); }
      });
      el.querySelector('[data-ocultar-avisos]')?.addEventListener('click', (e) => {
        localStorage.setItem('control.ocultarAvisos', '1'); e.target.closest('.aviso').remove();
      });
      el.querySelector('[data-ocultar-instalar]')?.addEventListener('click', (e) => {
        localStorage.setItem('control.ocultarInstalar', '1'); e.target.closest('.aviso').remove();
      });
      el.querySelector('[data-borrar-demo]')?.addEventListener('click', async () => {
        if (await confirmar('Se borrarán los datos de ejemplo de este dispositivo. ¿Continuar?', 'Borrar y empezar', true)) {
          await store.vaciarTodo();
          toast('Listo. Empieza agregando tu equipo y proyectos.');
          location.hash = '#/ajustes';
        }
      });
    },
  };
}

function tarjetaReunion(r) {
  const pr = M.proyecto(r.proyectoId);
  const parts = (r.participantes || []).map((id) => store.obtener('personas', id)).filter(Boolean);
  const nAcu = store.todos('acuerdos').filter((a) => a.reunionId === r.id).length;
  return `<a class="reunion ${r.estado === 'Realizada' ? 'es-realizada' : ''} ${r.estado === 'Cancelada' ? 'es-cancelada' : ''}" href="#/reunion/${esc(r.id)}">
    <div class="reunion-hora"><b>${esc(r.hora || '—')}</b><span>${esc(fmtFecha(r.fecha))}</span></div>
    <div class="reunion-cuerpo">
      <div class="fila-tit">${esc(r.titulo)}</div>
      <div class="fila-meta">
        ${pr ? `<span class="chip"><i class="punto" style="background:${esc(pr.color)}"></i>${esc(pr.codigo || pr.nombre)}</span>` : ''}
        ${parts.length ? `<span class="avatares">${parts.slice(0, 5).map((p) => `<i title="${esc(p.nombre)}">${esc(C.iniciales(p.nombre))}</i>`).join('')}</span>` : ''}
        ${nAcu ? `<span class="chip chip-tenue">${nAcu} acuerdos</span>` : ''}
        ${r.estado !== 'Programada' ? `<span class="chip chip-tenue">${esc(r.estado)}</span>` : ''}
      </div>
    </div>
  </a>`;
}

// ============================================================
// INBOX
// ============================================================
export function vistaInbox() {
  const lista = M.inbox();
  const html = `
  ${cab('Inbox', 'Todo lo que capturas sin fecha o sin proyecto/responsable llega aquí. Clasifícalo en segundos.')}
  ${capturaLinea('Anota rápido lo que no quieres olvidar… (Enter)')}
  ${lista.length ? `<div class="inbox-lista">${lista.map((p) => `
    <form class="inbox-item" data-id="${esc(p.id)}">
      <input class="inbox-tit" name="titulo" value="${esc(p.titulo)}" aria-label="Título">
      <div class="inbox-campos">
        <select name="proyectoId" aria-label="Proyecto">${C.optsProyectos(p.proyectoId, { vacio: 'Proyecto…' })}</select>
        <select name="responsable" aria-label="Responsable">${C.optsPersonas(p.responsable || '')}</select>
        <input type="date" name="fecha" value="${esc(p.fecha || '')}" aria-label="Fecha">
        <select name="prioridad" aria-label="Prioridad">${C.optsPrioridad(p.prioridad || 'media')}</select>
      </div>
      <div class="inbox-acc">
        <button type="button" class="mini" data-f="hoy">Hoy</button>
        <button type="button" class="mini" data-f="1">Mañana</button>
        <button type="button" class="mini" data-f="7">+1 sem</button>
        <span class="sep"></span>
        <button type="button" class="icon-btn" data-acc="abrir" data-id="${esc(p.id)}" title="Más detalles">${ic('ajustes')}</button>
        <button type="button" class="icon-btn" data-hecho title="Ya está hecho">${ic('check')}</button>
        <button type="button" class="icon-btn" data-borrar title="Eliminar">${ic('basura')}</button>
        <button type="submit" class="btn btn-pri btn-mini">Clasificar</button>
      </div>
    </form>`).join('')}</div>` : `<div class="vacio vacio-grande">${ic('inbox')}<b>Inbox vacío</b><span>Todo está clasificado. ¡Así se controla!</span></div>`}`;
  return {
    titulo: 'Inbox', html,
    montar(el) {
      montarCapturaLinea(el);
      el.querySelectorAll('.inbox-item').forEach((f) => {
        const id = f.dataset.id;
        f.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => {
          f.fecha.value = b.dataset.f === 'hoy' ? hoy() : addDias(hoy(), Number(b.dataset.f));
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = leerForm(f);
          const pr = M.proyecto(d.proyectoId);
          await store.guardar('pendientes', { id, ...d, fase: pr?.fase || '', inbox: false });
          toast('Clasificado');
        });
        f.querySelector('[data-hecho]').onclick = () => MD.alternarHecho(id);
        f.querySelector('[data-borrar]').onclick = async () => {
          await store.borrar('pendientes', id);
          toast('Eliminado', { texto: 'Deshacer', fn: () => store.guardar('pendientes', { id, deleted: false }) });
        };
      });
    },
  };
}

// ============================================================
// PENDIENTES
// ============================================================
const filtro = { q: '', proyecto: '*', responsable: '*', estado: 'abiertos', prioridad: '*', disciplina: '*', rango: '*', vista: 'lista' };

export function aplicarConsulta(q) {
  if (q.vista) filtro.vista = q.vista;
  if (q.rango) filtro.rango = q.rango;
  if (q.q !== undefined) filtro.q = q.q;
  if (q.proyecto) filtro.proyecto = q.proyecto;
  if (q.responsable) filtro.responsable = q.responsable;
  if (q.reset) Object.assign(filtro, { q: '', proyecto: '*', responsable: '*', estado: 'abiertos', prioridad: '*', disciplina: '*', rango: '*' });
}
export const setBusqueda = (q) => { filtro.q = q; };

function filtrar() {
  const H = hoy();
  const finSemana = addDias(inicioSemana(H), 6);
  const q = norm(filtro.q);
  return M.pendientes().filter((p) => {
    const ab = M.esAbierto(p);
    if (filtro.estado === 'abiertos' && !ab) return false;
    if (filtro.estado === 'cerrados' && ab) return false;
    if (!['abiertos', 'cerrados', 'todos'].includes(filtro.estado) && p.estado !== filtro.estado) return false;
    if (filtro.proyecto !== '*' && (p.proyectoId || '') !== filtro.proyecto) return false;
    if (filtro.responsable !== '*' && (p.responsable || '') !== filtro.responsable) return false;
    if (filtro.prioridad !== '*' && (p.prioridad || 'media') !== filtro.prioridad) return false;
    if (filtro.disciplina !== '*' && (p.disciplina || '') !== filtro.disciplina) return false;
    if (filtro.rango === 'vencidos' && !M.esVencido(p, H)) return false;
    if (filtro.rango === 'hoy' && p.fecha !== H) return false;
    if (filtro.rango === 'semana' && !(p.fecha && p.fecha <= finSemana)) return false;
    if (filtro.rango === 'sinfecha' && p.fecha) return false;
    if (q) {
      const texto = norm([p.titulo, p.descripcion, p.notas, p.disciplina, M.nombrePersona(p.responsable), M.proyecto(p.proyectoId)?.nombre, p.solicitante].join(' '));
      if (!q.split(/\s+/).every((w) => texto.includes(w))) return false;
    }
    return true;
  }).sort(M.ordenar);
}

function bucketFecha(p, H) {
  if (!M.esAbierto(p)) return '6 Cerrados';
  if (!p.fecha) return '5 Sin fecha';
  if (p.fecha < H) return '0 Vencidos';
  if (p.fecha === H) return '1 Hoy';
  if (p.fecha === addDias(H, 1)) return '2 Mañana';
  if (p.fecha <= addDias(inicioSemana(H), 6)) return '3 Esta semana';
  return '4 Más adelante';
}

export function vistaPendientes() {
  const lista = filtrar();
  const H = hoy();
  const vistas = [['lista', 'Lista', 'lista'], ['kanban', 'Kanban', 'proyecto'], ['responsable', 'Por responsable', 'equipo'], ['proyecto', 'Por proyecto', 'proyecto'], ['esperando', 'Esperando a', 'espera']];
  const sel = (nombre, opciones, valor) => `<select data-filtro="${nombre}">${opciones}</select>`.replace(`value="${esc(valor)}"`, `value="${esc(valor)}" selected`);
  const op = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  const hayFiltros = filtro.q || filtro.proyecto !== '*' || filtro.responsable !== '*' || filtro.prioridad !== '*' || filtro.disciplina !== '*' || filtro.rango !== '*' || filtro.estado !== 'abiertos';

  const filtros = `
  <div class="filtros">
    <label class="buscar">${ic('buscar')}<input type="search" data-filtro="q" value="${esc(filtro.q)}" placeholder="Buscar…"></label>
    ${sel('rango', op('*', 'Cualquier fecha') + op('vencidos', 'Vencidos') + op('hoy', 'Hoy') + op('semana', 'Hasta fin de semana') + op('sinfecha', 'Sin fecha'), filtro.rango)}
    ${sel('estado', op('abiertos', 'Abiertos') + op('cerrados', 'Cerrados') + op('todos', 'Todos') + ESTADOS.map((e) => op(e, e)).join(''), filtro.estado)}
    ${sel('proyecto', op('*', 'Todos los proyectos') + op('', 'Sin proyecto') + M.proyectos().map((p) => op(p.id, p.nombre)).join(''), filtro.proyecto)}
    ${sel('responsable', op('*', 'Todos los responsables') + op('', (store.config().miNombre || 'Yo') + ' (yo)') + M.personas().map((p) => op(p.id, p.nombre)).join(''), filtro.responsable)}
    ${sel('prioridad', op('*', 'Toda prioridad') + op('alta', 'Alta') + op('media', 'Media') + op('baja', 'Baja'), filtro.prioridad)}
    ${sel('disciplina', op('*', 'Toda disciplina') + M.disciplinas().map((d) => op(d.nombre, d.nombre)).join(''), filtro.disciplina)}
    ${hayFiltros ? `<button class="btn btn-mini" data-limpiar>${ic('x')} Limpiar</button>` : ''}
  </div>`;

  let contenido = '';
  if (filtro.vista === 'lista') {
    const g = agrupar(lista, (p) => bucketFecha(p, H));
    contenido = Object.keys(g).sort().map((k) => C.seccion(k.slice(2), C.listaPendientes(g[k], '', { clave: 'lista-' + k }), { n: g[k].length, clase: k.startsWith('0') ? 'sec-roja' : '', colorN: k.startsWith('0') ? 'n-rojo' : '' })).join('')
      || '<div class="vacio vacio-grande">' + ic('check') + '<b>Sin resultados</b><span>No hay pendientes con estos filtros.</span></div>';
  } else if (filtro.vista === 'kanban') {
    const cols = [...ESTADOS_ABIERTOS, 'Hecho'];
    const hace7 = addDias(H, -7);
    const pasanSinEstado = idsSinEstado();
    contenido = `<div class="kanban">${cols.map((e) => {
      const items = (e === 'Hecho' ? M.pendientes().filter((p) => p.estado === 'Hecho' && fechaLocal(p.cerrado) >= hace7 && pasanSinEstado.has(p.id)) : lista.filter((p) => (p.estado || 'Pendiente') === e));
      return `<div class="kcol" data-estado="${esc(e)}">
        <h3 class="kcol-tit est-${esc(e.split(' ')[0].toLowerCase())}">${esc(e)}<span class="contador">${items.length}</span></h3>
        <div class="kcol-cuerpo">${items.slice(0, C.expandidos.get('k-' + e) || 40).map((p) => C.filaPendiente(p, { arrastrable: true, compacto: true, sinPosponer: true })).join('') || '<div class="vacio vacio-mini">Arrastra aquí</div>'}
          ${items.length > (C.expandidos.get('k-' + e) || 40) ? `<button class="mas-items" data-expandir="k-${esc(e)}" data-lim="${(C.expandidos.get('k-' + e) || 40) + 100}">Mostrar más (${items.length - (C.expandidos.get('k-' + e) || 40)})</button>` : ''}</div>
      </div>`;
    }).join('')}</div>${e7nota()}`;
  } else if (filtro.vista === 'responsable') {
    const g = agrupar(lista, (p) => p.responsable || '');
    const claves = Object.keys(g).sort((a, b) => M.nombrePersona(a).localeCompare(M.nombrePersona(b)));
    contenido = claves.map((k) => C.seccion(M.nombrePersona(k), C.listaPendientes(g[k], '', { sinPersona: true, clave: 'resp-' + k }), { n: g[k].length, icono: 'usuario', extra: `<a class="mini-link" href="#/persona/${esc(k || 'yo')}">Ver 1:1</a>` })).join('') || '<div class="vacio">Sin resultados</div>';
  } else if (filtro.vista === 'proyecto') {
    const g = agrupar(lista, (p) => p.proyectoId || '');
    contenido = Object.keys(g).sort((a, b) => (M.proyecto(a)?.nombre || 'zzz').localeCompare(M.proyecto(b)?.nombre || 'zzz')).map((k) => {
      const pr = M.proyecto(k);
      return C.seccion(pr ? pr.nombre : 'Sin proyecto', C.listaPendientes(g[k], '', { sinProyecto: true, clave: 'proy-' + k }), { n: g[k].length, icono: 'proyecto', extra: pr ? `<a class="mini-link" href="#/proyecto/${esc(k)}">Abrir</a>` : '' });
    }).join('') || '<div class="vacio">Sin resultados</div>';
  } else if (filtro.vista === 'esperando') {
    const esp = lista.filter(M.esEsperando);
    const g = agrupar(esp, (p) => p.responsable || '');
    contenido = `<p class="nota">Lo que delegaste o estás esperando de terceros. Persíguelo con un recordatorio.</p>` + (Object.keys(g).map((k) => {
      const pe = store.obtener('personas', k);
      const items = g[k];
      const texto = `Hola ${pe ? pe.nombre.split(' ')[0] : ''}, ¿cómo vas con estos pendientes?\n${items.map((p) => `• ${p.titulo}${p.fecha ? ` (${fmtFecha(p.fecha)})` : ''}`).join('\n')}\nGracias.`;
      const extra = pe ? `<span class="recordar">
          ${pe.telefono ? `<a class="mini-link" target="_blank" rel="noopener" href="${linkWhatsApp(pe.telefono, texto)}">WhatsApp</a>` : ''}
          <a class="mini-link" href="${linkCorreo(pe.email, 'Seguimiento de pendientes', texto)}">Correo</a>
          <button class="mini-link" data-copiar="${esc(texto)}">Copiar</button></span>` : '';
      return C.seccion(M.nombrePersona(k), C.listaPendientes(items, '', { sinPersona: true, clave: 'esp-' + k }), { n: items.length, icono: 'usuario', extra });
    }).join('') || '<div class="vacio vacio-grande">' + ic('espera') + '<b>No esperas nada de nadie</b><span>Todo lo delegado está cerrado.</span></div>');
  }

  const html = `
  ${cab('Pendientes', `${lista.length} ${filtro.estado === 'abiertos' ? 'abiertos' : 'resultados'}`, `<button class="btn btn-pri" data-nuevo>${ic('mas2')} Nuevo</button>`)}
  <nav class="tabs">${vistas.map(([k, t, i]) => `<button class="tab ${filtro.vista === k ? 'activa' : ''}" data-vista="${k}">${ic(i)}<span>${t}</span></button>`).join('')}</nav>
  ${filtros}
  ${capturaLinea('Agregar pendiente… (Enter)')}
  <div class="contenido-pend">${contenido}</div>`;

  return {
    titulo: 'Pendientes', html,
    montar(el, refrescar) {
      montarCapturaLinea(el);
      el.querySelector('[data-nuevo]').onclick = () => MD.editarPendiente(null);
      el.querySelectorAll('[data-vista]').forEach((b) => b.onclick = () => { filtro.vista = b.dataset.vista; refrescar(); });
      el.querySelectorAll('[data-filtro]').forEach((s) => {
        const ev = s.tagName === 'INPUT' ? 'input' : 'change';
        const fn = () => { filtro[s.dataset.filtro] = s.value; refrescar(); };
        s.addEventListener(ev, s.tagName === 'INPUT' ? debounce(fn, 250) : fn);
      });
      el.querySelector('[data-limpiar]')?.addEventListener('click', () => { aplicarConsulta({ reset: true }); refrescar(); });
      el.querySelectorAll('[data-copiar]').forEach((b) => b.onclick = () => copiar(b.dataset.copiar));
      // Arrastrar y soltar en Kanban
      el.querySelectorAll('.fila[draggable]').forEach((f) => {
        f.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', f.dataset.id); f.classList.add('arrastrando'); });
        f.addEventListener('dragend', () => f.classList.remove('arrastrando'));
      });
      el.querySelectorAll('.kcol').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('sobre'); });
        col.addEventListener('dragleave', () => col.classList.remove('sobre'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('sobre');
          const id = e.dataTransfer.getData('text/plain');
          if (id) await store.guardar('pendientes', { id, estado: col.dataset.estado });
        });
      });
    },
  };
}
const e7nota = () => '<p class="nota solo-movil">En el celular, toca una tarjeta para cambiar su estado.</p>';
/** Ids que pasan todos los filtros menos el de estado (para la columna Hecho del Kanban). */
function idsSinEstado() {
  const guard = filtro.estado; filtro.estado = 'todos';
  const ids = new Set(filtrar().map((x) => x.id));
  filtro.estado = guard;
  return ids;
}

// ============================================================
// REUNIONES
// ============================================================
export function vistaReuniones() {
  const H = hoy();
  const todas = store.todos('reuniones');
  const deHoy = todas.filter((r) => r.fecha === H).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  const prox = todas.filter((r) => r.fecha > H).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const pas = todas.filter((r) => r.fecha < H).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)).slice(0, 30);
  const html = `
  ${cab('Reuniones', 'Agenda, minutas y acuerdos convertidos en acciones', `<button class="btn" data-agenda-ics title="Agregar tus próximas reuniones y pendientes con hora a tu calendario">📅 <span class="solo-desk">Exportar a mi calendario</span></button><button class="btn btn-pri" data-nueva>${ic('mas2')} Nueva reunión</button>`)}
  ${C.seccion('Hoy', deHoy.length ? `<div class="lista">${deHoy.map(tarjetaReunion).join('')}</div>` : '<div class="vacio">Sin reuniones hoy</div>', { n: deHoy.length, icono: 'hoy' })}
  ${C.seccion('Próximas', prox.length ? `<div class="lista">${prox.map(tarjetaReunion).join('')}</div>` : '<div class="vacio">No hay reuniones programadas</div>', { n: prox.length, icono: 'calendario' })}
  ${pas.length ? C.seccion('Anteriores', `<div class="lista">${pas.map(tarjetaReunion).join('')}</div>`, { n: pas.length, icono: 'revision' }) : ''}`;
  return {
    titulo: 'Reuniones', html,
    montar(el) {
      el.querySelector('[data-nueva]').onclick = () => MD.editarReunion(null, {}, (r) => { location.hash = `#/reunion/${r.id}`; });
      el.querySelector('[data-agenda-ics]').onclick = () => descargarAgendaICS(14);
    },
  };
}

export function vistaReunion(id) {
  const r = store.obtener('reuniones', id);
  if (!r) return { titulo: 'Reunión', html: '<div class="vacio">Reunión no encontrada</div>' };
  const pr = M.proyecto(r.proyectoId);
  const parts = (r.participantes || []).map((x) => store.obtener('personas', x)).filter(Boolean);
  const acuerdos = store.todos('acuerdos').filter((a) => a.reunionId === id).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  const ids = new Set(r.participantes || []);
  const revisar = M.abiertos().filter((p) => ids.has(p.responsable) || (r.proyectoId && p.proyectoId === r.proyectoId)).sort(M.ordenar);
  const conVoz = vozDisponible();

  const filaAcuerdo = (a, i) => {
    const acc = a.pendienteId ? store.obtener('pendientes', a.pendienteId) : null;
    return `<li class="acuerdo" data-id="${esc(a.id)}">
      <span class="acuerdo-n">${i + 1}</span>
      <div class="acuerdo-cuerpo">
        <div class="fila-tit">${esc(a.texto)}</div>
        <div class="fila-meta">
          <span class="chip">${ic('usuario')}${esc(M.nombrePersona(a.responsable))}</span>
          ${a.fecha ? `<span class="chip">${ic('reloj')}${esc(fmtFecha(a.fecha))}</span>` : ''}
          ${acc ? `<button class="chip chip-verde" data-acc="abrir" data-id="${esc(acc.id)}">${ic('check')}Acción: ${esc(acc.estado)}</button>` : ''}
        </div>
      </div>
      ${acc ? '' : `<button class="btn btn-mini" data-crear-accion>${ic('flecha')} Crear acción</button>`}
      <button class="icon-btn" data-borrar-acuerdo title="Quitar acuerdo">${ic('x')}</button>
    </li>`;
  };

  const html = `
  <a class="volver" href="#/reuniones">${ic('atras')} Reuniones</a>
  ${cab(r.titulo, `${esc(fmtFechaLarga(r.fecha))}${r.hora ? ' · ' + esc(r.hora) : ''}${r.duracion ? ` · ${esc(r.duracion)} min` : ''}${pr ? ` · <a href="#/proyecto/${esc(pr.id)}">${esc(pr.nombre)}</a>` : ''}`,
    `${r.enlace ? `<a class="btn" href="${esc(r.enlace)}" target="_blank" rel="noopener">Unirse</a>` : ''}
     <button class="btn" data-editar>Editar</button>
     <button class="btn btn-pri" data-minuta>${ic('enviar')} Generar minuta</button>`)}
  <div class="reunion-info">
    <span class="chip ${r.estado === 'Realizada' ? 'chip-verde' : ''}">${esc(r.estado || 'Programada')}</span>
    ${parts.map((p) => `<a class="chip" href="#/persona/${esc(p.id)}">${ic('usuario')}${esc(p.nombre)}</a>`).join('')}
    ${r.estado !== 'Realizada' ? `<button class="btn btn-mini" data-realizada>${ic('check')} Marcar realizada</button>` : ''}
  </div>
  ${r.objetivo ? `<p class="objetivo"><b>Objetivo:</b> ${esc(r.objetivo)}</p>` : ''}
  ${r.fecha && r.hora ? `<div class="botones-rapidos cal-botones">${botonesCalendario('reunion', r)}</div>` : ''}
  <div class="rejilla-2">
    <div>
      ${C.seccion('Acuerdos', `
        <ol class="acuerdos">${acuerdos.map(filaAcuerdo).join('')}</ol>
        <div class="cap-linea">
          ${ic('mas2')}
          <input type="text" id="nuevo-acuerdo" placeholder="Acuerdo: “María envía análisis de taludes el viernes”  (Enter)">
          <button class="icon-btn" data-mic-acuerdo title="Dictar acuerdo">${ic('mic')}</button>
        </div>
        <label class="check-linea"><input type="checkbox" id="auto-accion" checked> Crear la acción automáticamente</label>
      `, { n: acuerdos.length, icono: 'check' })}
      ${C.seccion('Minuta / notas', `
        <div class="minuta-barra">
          <button class="btn btn-mini" data-dictar-minuta ${conVoz ? '' : 'disabled title="Dictado no disponible en este navegador"'}>${ic('mic')} <span>Dictar</span></button>
          <span class="tenue" id="minuta-estado">Se guarda solo</span>
        </div>
        <textarea id="minuta" rows="10" placeholder="Escribe o dicta lo conversado…">${esc(r.minuta || '')}</textarea>
      `, { icono: 'lista' })}
    </div>
    <div>
      ${C.seccion('Para revisar en esta reunión', C.listaPendientes(revisar, 'Sin pendientes abiertos de los participantes ni del proyecto'), { n: revisar.length, icono: 'revision' })}
    </div>
  </div>`;

  return {
    titulo: r.titulo, html,
    montar(el) {
      el.querySelector('[data-editar]').onclick = () => MD.editarReunion(id);
      el.querySelector('[data-realizada]')?.addEventListener('click', () => store.guardar('reuniones', { id, estado: 'Realizada' }));
      el.querySelector('[data-minuta]').onclick = () => abrirMinuta(id);

      // --- Minuta con autoguardado ---
      const ta = el.querySelector('#minuta');
      const est = el.querySelector('#minuta-estado');
      const guardarMinuta = debounce(async () => {
        await sinRefrescar(() => store.guardar('reuniones', { id, minuta: ta.value }));
        est.textContent = 'Guardado ✓';
      }, 800);
      ta.addEventListener('input', () => { est.textContent = 'Escribiendo…'; guardarMinuta(); });
      let detener = null;
      const bDictar = el.querySelector('[data-dictar-minuta]');
      bDictar.onclick = () => {
        if (detener) { detener(); return; }
        const base = ta.value;
        bDictar.classList.add('escuchando'); bDictar.querySelector('span').textContent = 'Detener';
        est.textContent = 'Escuchando…';
        detener = escuchar({
          continuo: true,
          onParcial: (t) => { ta.value = base + (base && !base.endsWith('\n') ? '\n' : '') + t; },
          onError: (m) => toast(m),
          onFin: () => {
            detener = null; bDictar.classList.remove('escuchando'); bDictar.querySelector('span').textContent = 'Dictar';
            guardarMinuta();
          },
        });
      };

      // --- Acuerdos ---
      const inp = el.querySelector('#nuevo-acuerdo');
      const agregar = async (texto) => {
        if (!texto.trim()) return;
        const pa = parsear(texto, M.contextoParser());
        let responsable = pa.responsableId || '';
        if (!responsable && pa.responsableNombre) responsable = (await store.guardar('personas', { nombre: pa.responsableNombre })).id;
        const a = await store.guardar('acuerdos', { reunionId: id, texto: pa.titulo, responsable, fecha: pa.fecha || '' });
        if (el.querySelector('#auto-accion').checked) await crearAccion(a.id);
      };
      inp.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') { const t = inp.value; inp.value = ''; await agregar(t); document.getElementById('nuevo-acuerdo')?.focus(); }
      });
      el.querySelector('[data-mic-acuerdo]').onclick = () => {
        if (!vozDisponible()) { toast('Dictado no disponible: usa el micrófono del teclado'); inp.focus(); return; }
        inp.placeholder = 'Escuchando…';
        escuchar({ onParcial: (t) => { inp.value = t; }, onFin: () => { inp.placeholder = 'Acuerdo… (Enter)'; inp.focus(); }, onError: (m) => toast(m) });
      };
      el.querySelectorAll('.acuerdo').forEach((li) => {
        const aid = li.dataset.id;
        li.querySelector('[data-crear-accion]')?.addEventListener('click', () => crearAccion(aid));
        li.querySelector('[data-borrar-acuerdo]').onclick = () => store.borrar('acuerdos', aid);
      });
      el._limpiar = () => detener?.();
    },
  };

  async function crearAccion(acuerdoId) {
    const a = store.obtener('acuerdos', acuerdoId);
    const reu = store.obtener('reuniones', id);
    const prj = M.proyecto(reu.proyectoId);
    const p = await store.guardar('pendientes', {
      titulo: a.texto, responsable: a.responsable || '', fecha: a.fecha || '', proyectoId: reu.proyectoId || '',
      fase: prj?.fase || '', origen: 'Reunión', reunionId: id, estado: 'Pendiente', prioridad: 'media',
      disciplina: parsear(a.texto, M.contextoParser()).disciplina || '',
      inbox: !a.fecha,
    }, { historial: `Acuerdo de reunión: ${reu.titulo}` });
    await store.guardar('acuerdos', { id: acuerdoId, pendienteId: p.id });
    toast('Acción creada');
  }
}

/** Genera la minuta en texto para copiar o enviar. */
function abrirMinuta(id) {
  const r = store.obtener('reuniones', id);
  const pr = M.proyecto(r.proyectoId);
  const parts = (r.participantes || []).map((x) => store.obtener('personas', x)).filter(Boolean);
  const acuerdos = store.todos('acuerdos').filter((a) => a.reunionId === id).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  const fmtCorta = (s) => s ? s.split('-').reverse().join('/') : 'por definir';
  const texto = [
    `MINUTA DE REUNIÓN — ${r.titulo}`,
    `Fecha: ${fmtFechaLarga(r.fecha)}${r.hora ? ', ' + r.hora : ''}`,
    pr ? `Proyecto: ${pr.nombre}${pr.fase ? ' (' + pr.fase + ')' : ''}` : '',
    parts.length ? `Participantes: ${[store.config().miNombre || '', ...parts.map((p) => p.nombre)].filter(Boolean).join(', ')}` : '',
    r.objetivo ? `Objetivo: ${r.objetivo}` : '',
    '',
    r.minuta ? `RESUMEN\n${r.minuta.trim()}\n` : '',
    'ACUERDOS',
    acuerdos.length ? acuerdos.map((a, i) => `${i + 1}. ${a.texto} — Responsable: ${M.nombrePersona(a.responsable)} — Fecha: ${fmtCorta(a.fecha)}`).join('\n') : '(sin acuerdos registrados)',
  ].filter((x, i, arr) => x !== '' || arr[i - 1] !== '').join('\n');
  const correos = parts.map((p) => p.email).filter(Boolean).join(',');
  modal('Minuta', `
    <textarea class="minuta-texto" rows="16" id="txt-minuta">${esc(texto)}</textarea>
    <div class="acciones-modal">
      <a class="btn" target="_blank" rel="noopener" id="mn-wa">WhatsApp</a>
      <a class="btn" id="mn-mail">Correo</a>
      <span class="sep"></span>
      <button class="btn btn-pri" id="mn-copiar">${ic('copiar')} Copiar</button>
    </div>`, (el) => {
    const ta = el.querySelector('#txt-minuta');
    const act = () => {
      el.querySelector('#mn-wa').href = `https://wa.me/?text=${encodeURIComponent(ta.value)}`;
      el.querySelector('#mn-mail').href = linkCorreo(correos, `Minuta: ${r.titulo} (${fmtCorta(r.fecha)})`, ta.value);
    };
    ta.addEventListener('input', act); act();
    el.querySelector('#mn-copiar').onclick = () => copiar(ta.value);
  }, { ancho: 'ancho' });
}

// ============================================================
// EQUIPO
// ============================================================
export function vistaEquipo() {
  const H = hoy();
  const ab = M.abiertos();
  const yo = { id: '', nombre: store.config().miNombre || 'Yo', rol: 'Yo' };
  const tarjeta = (p) => {
    const mios = ab.filter((x) => (x.responsable || '') === p.id);
    const v = mios.filter((x) => M.esVencido(x, H)).length;
    const e = mios.filter((x) => x.estado === 'Esperando a tercero' || x.estado === 'Bloqueado').length;
    return `<a class="persona" href="#/persona/${esc(p.id || 'yo')}">
      <span class="avatar ${p.id ? '' : 'avatar-yo'}">${esc(C.iniciales(p.nombre))}</span>
      <div class="persona-info"><b>${esc(p.nombre)}</b><span>${esc(p.rol || p.disciplina || '')}</span></div>
      <div class="persona-nums">
        <span title="Abiertos"><b>${mios.length}</b>abiertos</span>
        <span class="${v ? 'rojo' : ''}" title="Vencidos"><b>${v}</b>vencidos</span>
        ${e ? `<span title="Esperando / bloqueados"><b>${e}</b>bloq./esp.</span>` : ''}
      </div>
    </a>`;
  };
  const html = `
  ${cab('Equipo', 'Carga de trabajo y seguimiento 1:1', `<button class="btn btn-pri" data-nueva>${ic('mas2')} Nueva persona</button>`)}
  <div class="rejilla-tarjetas">${tarjeta(yo)}${M.personas().map(tarjeta).join('')}</div>
  ${M.personas().length ? '' : '<p class="nota">Agrega a tu equipo para delegar con @nombre al capturar.</p>'}`;
  return { titulo: 'Equipo', html, montar(el) { el.querySelector('[data-nueva]').onclick = () => MD.editarPersona(null); } };
}

export function vistaPersona(id) {
  const pid = id === 'yo' ? '' : id;
  const p = pid ? store.obtener('personas', pid) : { id: '', nombre: store.config().miNombre || 'Yo', rol: 'Mis pendientes' };
  if (!p) return { titulo: 'Persona', html: '<div class="vacio">Persona no encontrada</div>' };
  const H = hoy();
  const mios = M.pendientes().filter((x) => (x.responsable || '') === pid);
  const ab = mios.filter(M.esAbierto).sort(M.ordenar);
  const venc = ab.filter((x) => M.esVencido(x, H));
  const prox = ab.filter((x) => !M.esVencido(x, H) && x.fecha);
  const sinF = ab.filter((x) => !x.fecha);
  const cerr = mios.filter((x) => x.estado === 'Hecho' && fechaLocal(x.cerrado) >= addDias(H, -14)).sort((a, b) => (b.cerrado || '').localeCompare(a.cerrado || ''));
  const agenda = `Agenda 1:1 con ${p.nombre} — ${fmtFecha(H)}\n\n`
    + (venc.length ? `VENCIDOS\n${venc.map((x) => `• ${x.titulo} (venció ${fmtFecha(x.fecha)})`).join('\n')}\n\n` : '')
    + (prox.length ? `PRÓXIMOS\n${prox.map((x) => `• ${x.titulo} (${fmtFecha(x.fecha)})`).join('\n')}\n\n` : '')
    + (sinF.length ? `SIN FECHA (definir)\n${sinF.map((x) => `• ${x.titulo}`).join('\n')}\n\n` : '')
    + (cerr.length ? `CERRADOS (últimos 14 días)\n${cerr.map((x) => `✓ ${x.titulo}`).join('\n')}` : '');
  const html = `
  <a class="volver" href="#/equipo">${ic('atras')} Equipo</a>
  ${cab(p.nombre, esc([p.rol, p.disciplina, p.empresa].filter(Boolean).join(' · ')),
    `${pid ? '<button class="btn" data-editar>Editar</button>' : ''}
     ${p.telefono ? `<a class="btn" target="_blank" rel="noopener" href="${linkWhatsApp(p.telefono, agenda)}">WhatsApp</a>` : ''}
     ${p.email ? `<a class="btn" href="${linkCorreo(p.email, 'Seguimiento de pendientes', agenda)}">Correo</a>` : ''}
     <button class="btn btn-pri" data-agenda>${ic('copiar')} Agenda 1:1</button>`)}
  ${capturaLinea(pid ? `Asignar a ${p.nombre.split(' ')[0]}… (Enter)` : 'Agregar pendiente… (Enter)')}
  ${venc.length ? C.seccion('Vencidos', C.listaPendientes(venc, '', { sinPersona: true }), { n: venc.length, colorN: 'n-rojo', clase: 'sec-roja', icono: 'reloj' }) : ''}
  ${C.seccion('Próximos', C.listaPendientes(prox, 'Nada con fecha próxima', { sinPersona: true }), { n: prox.length, icono: 'calendario' })}
  ${sinF.length ? C.seccion('Sin fecha', C.listaPendientes(sinF, '', { sinPersona: true }), { n: sinF.length, icono: 'bandera' }) : ''}
  ${cerr.length ? C.seccion('Cerrados (14 días)', C.listaPendientes(cerr, '', { sinPersona: true }), { n: cerr.length, icono: 'check' }) : ''}`;
  return {
    titulo: p.nombre, html,
    montar(el) {
      montarCapturaLinea(el, { responsable: pid });
      el.querySelector('[data-editar]')?.addEventListener('click', () => MD.editarPersona(pid));
      el.querySelector('[data-agenda]').onclick = () => copiar(agenda);
    },
  };
}

// ============================================================
// PROYECTOS
// ============================================================
let verInactivos = false;
export function vistaProyectos() {
  const H = hoy();
  const lista = M.proyectos().filter((p) => verInactivos || p.activo !== false);
  const ab = M.abiertos();
  const html = `
  ${cab('Proyectos', 'Fases, entregables y avance', `<button class="btn btn-pri" data-nuevo>${ic('mas2')} Nuevo proyecto</button>`)}
  <label class="check-linea"><input type="checkbox" data-inactivos ${verInactivos ? 'checked' : ''}> Mostrar inactivos</label>
  <div class="rejilla-tarjetas">${lista.map((p) => {
    const mios = ab.filter((x) => x.proyectoId === p.id);
    const v = mios.filter((x) => M.esVencido(x, H)).length;
    const sig = (p.hitos || []).filter((h) => !h.hecho && h.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    return `<a class="proy" href="#/proyecto/${esc(p.id)}" style="--c:${esc(p.color || '#888')}">
      <div class="proy-cab"><b>${esc(p.nombre)}</b>${p.fase ? `<span class="fase">${esc(p.fase)}</span>` : ''}</div>
      <span class="tenue">${esc(p.cliente || '')}</span>
      <div class="avance"><span style="width:${Number(p.avance) || 0}%"></span></div>
      <div class="proy-nums"><span><b>${Number(p.avance) || 0}%</b> avance</span><span><b>${mios.length}</b> abiertos</span><span class="${v ? 'rojo' : ''}"><b>${v}</b> vencidos</span></div>
      ${sig ? `<div class="proy-sig ${sig.fecha < H ? 'rojo' : ''}">Próximo: ${esc(sig.nombre)} · ${esc(fmtFecha(sig.fecha))}</div>` : ''}
      ${p.activo === false ? '<span class="chip chip-tenue">Inactivo</span>' : ''}
    </a>`;
  }).join('') || '<div class="vacio">Aún no tienes proyectos. Crea el primero.</div>'}</div>`;
  return {
    titulo: 'Proyectos', html,
    montar(el, refrescar) {
      el.querySelector('[data-nuevo]').onclick = () => MD.editarProyecto(null);
      el.querySelector('[data-inactivos]').onchange = (e) => { verInactivos = e.target.checked; refrescar(); };
    },
  };
}

export function vistaProyecto(id) {
  const p = store.obtener('proyectos', id);
  if (!p) return { titulo: 'Proyecto', html: '<div class="vacio">Proyecto no encontrado</div>' };
  const H = hoy();
  const hitos = [...(p.hitos || [])].sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'));
  const ab = M.abiertos().filter((x) => x.proyectoId === id).sort(M.ordenar);
  const reus = store.todos('reuniones').filter((r) => r.proyectoId === id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 8);
  const porDisc = agrupar(ab, (x) => x.disciplina || 'Sin disciplina');
  const html = `
  <a class="volver" href="#/proyectos">${ic('atras')} Proyectos</a>
  ${cab(p.nombre, esc([p.cliente, p.fase, p.codigo ? '#' + p.codigo : ''].filter(Boolean).join(' · ')), `<button class="btn" data-editar>Editar</button>`)}
  ${p.descripcion ? `<p class="objetivo">${esc(p.descripcion)}</p>` : ''}
  <div class="avance avance-grande" style="--c:${esc(p.color || '#888')}"><span style="width:${Number(p.avance) || 0}%"></span><b>${Number(p.avance) || 0}%</b></div>
  ${capturaLinea(`Pendiente para ${p.codigo || p.nombre}… (Enter)`)}
  <div class="rejilla-2">
    <div>
      ${C.seccion('Hitos y entregables', `
        <div class="hitos">${hitos.map((h) => `
          <div class="hito ${h.hecho ? 'es-hecho' : ''} ${!h.hecho && h.fecha && h.fecha < H ? 'es-vencido' : ''}" data-hid="${esc(h.id)}">
            <input type="checkbox" data-h="hecho" ${h.hecho ? 'checked' : ''} aria-label="Hecho">
            <input class="hito-nom" data-h="nombre" value="${esc(h.nombre)}" aria-label="Entregable">
            <select data-h="disciplina" aria-label="Disciplina">${C.optsDisciplinas(h.disciplina, '—')}</select>
            <input type="date" data-h="fecha" value="${esc(h.fecha || '')}" aria-label="Fecha">
            <button class="icon-btn" data-h-borrar title="Quitar">${ic('x')}</button>
          </div>`).join('') || '<div class="vacio vacio-mini">Sin entregables definidos</div>'}
        </div>
        <div class="botones-rapidos">
          <button class="btn btn-mini" data-h-nuevo>${ic('mas2')} Entregable</button>
          ${p.fase ? `<button class="btn btn-mini" data-h-tipicos>Cargar entregables típicos de ${esc(p.fase)}</button>` : ''}
        </div>`, { n: hitos.length, icono: 'bandera' })}
      ${C.seccion('Reuniones', `${reus.length ? `<div class="lista">${reus.map(tarjetaReunion).join('')}</div>` : '<div class="vacio vacio-mini">Sin reuniones</div>'}
        <button class="btn btn-mini" data-reunion>${ic('mas2')} Programar reunión</button>`, { icono: 'calendario', n: reus.length })}
    </div>
    <div>
      ${C.seccion('Pendientes abiertos', Object.keys(porDisc).sort().map((k) => `<h4 class="sub-tit">${esc(k)} <span class="tenue">(${porDisc[k].length})</span></h4>${C.listaPendientes(porDisc[k], '', { sinProyecto: true, compacto: true })}`).join('') || '<div class="vacio">Sin pendientes abiertos</div>', { n: ab.length, icono: 'lista' })}
    </div>
  </div>`;

  return {
    titulo: p.nombre, html,
    montar(el) {
      montarCapturaLinea(el, { proyectoId: id, fase: p.fase || '' });
      el.querySelector('[data-editar]').onclick = () => MD.editarProyecto(id);
      el.querySelector('[data-reunion]').onclick = () => MD.editarReunion(null, { proyectoId: id }, (r) => { location.hash = `#/reunion/${r.id}`; });
      el.querySelector('[data-h-tipicos]')?.addEventListener('click', () => MD.cargarEntregables(id));
      const guardarHitos = async (mod, silencioso = false) => {
        const actual = store.obtener('proyectos', id);
        const hs = mod([...(actual.hitos || [])]);
        const avance = hs.length ? Math.round((hs.filter((h) => h.hecho).length / hs.length) * 100) : 0;
        const fn = () => store.guardar('proyectos', { id, hitos: hs, avance });
        silencioso ? await sinRefrescar(fn) : await fn();
      };
      el.querySelector('[data-h-nuevo]').onclick = () => guardarHitos((hs) => [...hs, { id: uid(), nombre: 'Nuevo entregable', fecha: '', hecho: false, disciplina: '' }]);
      el.querySelectorAll('.hito').forEach((row) => {
        const hid = row.dataset.hid;
        row.querySelectorAll('[data-h]').forEach((inp) => {
          inp.addEventListener('change', () => {
            const k = inp.dataset.h;
            const v = inp.type === 'checkbox' ? inp.checked : inp.value;
            guardarHitos((hs) => hs.map((h) => (h.id === hid ? { ...h, [k]: v } : h)), k === 'nombre');
          });
        });
        row.querySelector('[data-h-borrar]').onclick = () => guardarHitos((hs) => hs.filter((h) => h.id !== hid));
      });
    },
  };
}

// ============================================================
// REVISIÓN SEMANAL (estilo GTD)
// ============================================================
export function vistaRevision() {
  const H = hoy();
  const lunes = inicioSemana(H);
  const clave = `control.revision.${lunes}`;
  let hechos = {};
  try { hechos = JSON.parse(localStorage.getItem(clave) || '{}'); } catch { /* vacío */ }
  const nInbox = M.inbox().length;
  const nVenc = M.vencidos().length;
  const nEsp = M.esperando().length;
  const sigLunes = addDias(lunes, 7);
  const reusSig = store.todos('reuniones').filter((r) => r.fecha >= sigLunes && r.fecha <= addDias(sigLunes, 6)).length;
  const sinFecha = M.abiertos().filter((p) => !p.fecha && !p.inbox).length;
  const hitosProx = M.proyectos(true).flatMap((p) => (p.hitos || []).filter((h) => !h.hecho && h.fecha && h.fecha <= addDias(H, 14)).map((h) => ({ ...h, proyecto: p })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ind = M.indicadores();

  const pasos = [
    ['cuaderno', 'Vaciar el cuaderno y la cabeza', 'Pasa a la app todo lo anotado en papel, correos y chats. Una idea = una captura.', `<button class="btn btn-mini" data-capturar>${ic('mic')} Capturar</button>`],
    ['inbox', `Procesar el Inbox (${nInbox})`, 'Asigna proyecto, responsable y fecha a cada captura, o elimínala.', `<a class="btn btn-mini" href="#/inbox">Ir al Inbox</a>`],
    ['vencidos', `Resolver vencidos (${nVenc})`, 'Para cada uno: hacerlo, reprogramar con fecha realista, delegar o cancelar.', `<a class="btn btn-mini" href="#/pendientes?rango=vencidos&vista=lista">Ver vencidos</a>`],
    ['delegados', `Perseguir lo delegado (${nEsp})`, 'Envía un recordatorio a cada persona con sus pendientes.', `<a class="btn btn-mini" href="#/pendientes?vista=esperando">Ver esperando</a>`],
    ['hitos', `Revisar hitos de los próximos 14 días (${hitosProx.length})`, hitosProx.length ? hitosProx.slice(0, 8).map((h) => `${esc(h.proyecto.codigo || h.proyecto.nombre)}: ${esc(h.nombre)} (${esc(fmtFecha(h.fecha))})`).join(' · ') : 'Sin hitos próximos.', `<a class="btn btn-mini" href="#/proyectos">Proyectos</a>`],
    ['reuniones', `Preparar reuniones de la próxima semana (${reusSig})`, 'Define objetivo y participantes; revisa los pendientes a tratar.', `<a class="btn btn-mini" href="#/reuniones">Reuniones</a>`],
    ['planificar', `Planificar la semana (${sinFecha} sin fecha)`, 'Pon fecha a lo importante y elige las 3 prioridades de la semana.', `<a class="btn btn-mini" href="#/pendientes?rango=sinfecha&vista=lista">Sin fecha</a>`],
  ];
  const nHechos = pasos.filter(([k]) => hechos[k]).length;
  const html = `
  ${cab('Revisión semanal', `Semana del ${esc(fmtFecha(lunes))} · ${nHechos}/${pasos.length} pasos · ${ind.cerradosSemana} pendientes cerrados esta semana`)}
  <div class="avance avance-grande"><span style="width:${Math.round((nHechos / pasos.length) * 100)}%"></span><b>${nHechos}/${pasos.length}</b></div>
  <ol class="revision">${pasos.map(([k, t, d, b]) => `
    <li class="${hechos[k] ? 'es-hecho' : ''}">
      <label class="rev-check"><input type="checkbox" data-paso="${k}" ${hechos[k] ? 'checked' : ''}><span>${ic('check')}</span></label>
      <div><b>${t}</b><p>${d}</p></div>
      <div class="rev-acc">${b}</div>
    </li>`).join('')}</ol>
  <p class="nota">Recomendación: hazla los viernes por la tarde o el lunes temprano (30 min). El avance se guarda por semana.</p>`;
  return {
    titulo: 'Revisión semanal', html,
    montar(el, refrescar) {
      el.querySelectorAll('[data-paso]').forEach((c) => c.onchange = () => {
        hechos[c.dataset.paso] = c.checked;
        localStorage.setItem(clave, JSON.stringify(hechos));
        refrescar();
      });
      el.querySelector('[data-capturar]').onclick = () => MD.abrirCaptura({ voz: vozDisponible() });
    },
  };
}

// ============================================================
// AJUSTES
// ============================================================
export function vistaAjustes() {
  const cfg = store.config();
  const es = estadoSync();
  const discTxt = M.disciplinas().map((d) => `${d.nombre}: ${(d.claves || []).join(', ')}`).join('\n');
  const html = `
  ${cab('Ajustes', 'Conexión, datos y preferencias')}
  <div class="ajustes">
    <section class="tarjeta">
      <h3>${ic('usuario')} Perfil</h3>
      <label class="campo"><span>Tu nombre</span><input id="aj-nombre" value="${esc(cfg.miNombre)}" placeholder="Ej.: Víctor"></label>
    </section>
    ${EQV.seccionAjustes()}

    <section class="tarjeta">
      <h3>${ic('sync')} Tus datos en Google</h3>
      ${cfg.modo === 'google' ? `
        <p class="nota">✔ Conectado con Google como <b>${esc(cfg.googleEmail)}</b>. Tus datos se guardan en la hoja <b>“Control – Mis datos”</b> de tu Google Drive.</p>
        <div class="botones-rapidos">
          ${cfg.sheetUrl ? `<a class="btn" href="${esc(cfg.sheetUrl)}" target="_blank" rel="noopener">Abrir mi hoja</a>` : ''}
          <button class="btn btn-pri" data-sync-ahora>Sincronizar ahora</button>
          <button class="btn btn-peligro-txt" data-salir>Cerrar sesión</button>
        </div>` : `
        <p class="nota">Tus datos siempre se guardan en este dispositivo. Inicia sesión con Google para tener respaldo en tu Drive y usar la app en celular y PC a la vez.</p>
        <div class="botones-rapidos"><button class="btn btn-pri" data-google ${G.configurado() ? '' : 'disabled title="Configuración de Google pendiente"'}>${ic('usuario')} Continuar con Google</button></div>
        ${cfg.apiUrl ? `<p class="nota">Ahora usas la conexión <b>avanzada (Apps Script)</b>. Si inicias sesión con Google, tus datos se copiarán a una hoja nueva “Control – Mis datos” y se usará esa.</p>` : ''}
      `}
      <p class="nota">Estado: <b>${esc(es.mensaje || es.estado)}</b>${cfg.lastSync ? ` · Última sincronización: ${esc(new Date(cfg.lastSync).toLocaleString('es-PE'))}` : ''}${es.pendientes ? ` · ${es.pendientes} cambios por subir` : ''}</p>
      ${cfg.modo === 'google' ? '' : `<details class="avanzado" ${cfg.apiUrl ? 'open' : ''}><summary>Conexión avanzada con Apps Script</summary>
      <label class="campo"><span>URL del Web App (termina en /exec)</span><input id="aj-url" name="control-api-url" type="url" autocomplete="off" spellcheck="false" value="${esc(cfg.apiUrl)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label class="campo"><span>Token secreto</span><input id="aj-token" name="control-api-token" type="text" class="campo-secreto" autocomplete="off" data-lpignore="true" data-1p-ignore spellcheck="false" value="${esc(cfg.token)}" placeholder="Pega aquí tu token"></label>
      <div class="botones-rapidos">
        <button class="btn" data-probar>Probar conexión</button>
        <button class="btn btn-pri" data-guardar-con>Guardar y sincronizar</button>
      </div></details>`}
    </section>

    <section class="tarjeta">
      <h3>${ic('descargar')} Instalar la app</h3>
      <p class="nota">${yaInstalada() ? '✔ Estás usando la app instalada.' : 'Instálala en tu celular o PC para abrirla desde un ícono, a pantalla completa y sin internet.'}</p>
      <div class="botones-rapidos">${yaInstalada() ? '' : '<button class="btn btn-pri" data-instalar-ajustes>Instalar en este dispositivo</button>'}<button class="btn" data-compartir>${ic('enviar')} Compartir con un colega</button></div>
    </section>

    <section class="tarjeta">
      <h3>${ic('campana')} Avisos</h3>
      <p class="nota">Te aviso antes de tus reuniones y pendientes que tengan <b>fecha y hora</b>, con notificación, sonido y vibración. Funcionan mientras la app está abierta o minimizada.</p>
      ${permisoNotif() === 'unsupported' ? '<p class="nota rojo">Este navegador no permite notificaciones.</p>'
        : cfg.notificaciones && permisoNotif() === 'granted' ? '<p class="nota">✔ Avisos activados en este dispositivo.</p>'
          : permisoNotif() === 'denied' ? '<p class="nota rojo">Las notificaciones están bloqueadas en este navegador. Desbloquéalas en el candado de la barra de direcciones (o Ajustes del teléfono → Apps → Chrome → Notificaciones) y vuelve a pulsar Activar.</p>' : ''}
      <div class="botones-rapidos">
        ${cfg.notificaciones && permisoNotif() === 'granted' ? `<button class="btn" data-desactivar-avisos>Desactivar avisos</button>` : `<button class="btn btn-pri" data-activar-avisos>${ic('campana')} Activar avisos</button>`}
        <button class="btn" data-probar-aviso>Probar aviso</button>
      </div>
      <label class="campo campo-corto"><span>Aviso predeterminado</span><select id="aj-aviso">
        ${[['0', 'A la hora'], ['5', '5 min antes'], ['10', '10 min antes'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 día antes']].map(([v, t]) => `<option value="${v}" ${String(cfg.avisoMin) === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <p class="nota"><b>¿Quieres el aviso aunque la app esté cerrada?</b> En cada pendiente o reunión con hora pulsa <b>“Agregar a Google Calendar”</b>, o exporta toda tu agenda:</p>
      <div class="botones-rapidos"><button class="btn" data-agenda-ics>📅 Exportar agenda de 14 días (.ics)</button></div>
      <p class="nota">Correo diario a las 7:00: solo con la conexión avanzada (Apps Script → <code>activarResumenDiario</code>).</p>
    </section>

    <section class="tarjeta">
      <h3>${ic('ajustes')} Apariencia y voz</h3>
      <label class="campo"><span>Tema</span><select id="aj-tema">
        ${[['auto', 'Automático'], ['oscuro', 'Oscuro'], ['claro', 'Claro']].map(([v, t]) => `<option value="${v}" ${cfg.tema === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label class="campo"><span>Idioma del dictado</span><select id="aj-voz">
        ${[['es-PE', 'Español (Perú)'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-CL', 'Español (Chile)'], ['es-US', 'Español (EE. UU.)']].map(([v, t]) => `<option value="${v}" ${(localStorage.getItem('control.vozIdioma') || 'es-PE') === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <p class="nota">Dictado: ${vozDisponible() ? '✔ disponible en este navegador' : '✖ no disponible aquí (usa Chrome/Edge o el micrófono del teclado)'}.</p>
    </section>

    <section class="tarjeta">
      <h3>${ic('descargar')} Exportar y respaldo</h3>
      <div class="botones-rapidos">
        <button class="btn" data-csv="pendientes">Pendientes (CSV)</button>
        <button class="btn" data-csv="reuniones">Reuniones (CSV)</button>
        <button class="btn" data-csv="acuerdos">Acuerdos (CSV)</button>
        <button class="btn" data-csv="proyectos">Hitos de proyectos (CSV)</button>
        <button class="btn" data-csv="diario">Diario (CSV)</button>
      </div>
      <div class="botones-rapidos">
        <button class="btn" data-json>${ic('descargar')} Respaldo completo (JSON)</button>
        <label class="btn">${ic('subir')} Restaurar respaldo<input type="file" accept="application/json,.json" data-restaurar hidden></label>
      </div>
    </section>

    <section class="tarjeta">
      <h3>${ic('lista')} Disciplinas y palabras clave</h3>
      <p class="nota">Una por línea: <code>Nombre: clave1, clave2</code>. Las claves sirven para detectar la disciplina al capturar (sin tildes, en minúsculas).</p>
      <textarea id="aj-disc" rows="8">${esc(discTxt)}</textarea>
      <div class="botones-rapidos">
        <button class="btn" data-disc-reset>Restaurar catálogo minero</button>
        <button class="btn btn-pri" data-disc-guardar>Guardar disciplinas</button>
      </div>
    </section>

    <section class="tarjeta tarjeta-peligro">
      <h3>${ic('basura')} Datos de este dispositivo</h3>
      <div class="botones-rapidos">
        <button class="btn" data-demo>Cargar datos de ejemplo</button>
        <button class="btn btn-peligro" data-vaciar>Borrar todo en este dispositivo</button>
      </div>
      <p class="nota">Borrar no afecta tu Google Sheet. Al volver a sincronizar, se descargan los datos de la hoja.</p>
    </section>
  </div>  <p class="nota version-app">Control versión ${VERSION_APP} · <button class="mini-link" data-forzar-act>Buscar actualización</button></p>
`;

  return {
    titulo: 'Ajustes', html,
    montar(el, refrescar) {
      const $ = (s) => el.querySelector(s);
      $('[data-instalar-ajustes]')?.addEventListener('click', () => import('./instalar.js').then((m) => m.instalar()));
      EQV.montarAjustes(el);
      $('[data-forzar-act]')?.addEventListener('click', async () => {
        toast('Buscando actualización…');
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update();
          if (reg?.installing || reg?.waiting) return; // se recargará sola
          for (const k of await caches.keys()) await caches.delete(k);
          location.reload();
        } catch { location.reload(); }
      });
      $('#aj-nombre').addEventListener('change', (e) => { store.guardarConfig({ miNombre: e.target.value.trim() }); toast('Nombre guardado'); });
      $('#aj-tema').addEventListener('change', (e) => { store.guardarConfig({ tema: e.target.value }); document.documentElement.dataset.tema = e.target.value; });
      $('#aj-voz').addEventListener('change', (e) => { localStorage.setItem('control.vozIdioma', e.target.value); toast('Idioma de dictado guardado'); });
      $('#aj-aviso').addEventListener('change', (e) => { store.guardarConfig({ avisoMin: Number(e.target.value) || 0 }); toast('Aviso predeterminado guardado'); });
      $('[data-activar-avisos]')?.addEventListener('click', async () => { if (await activarAvisos()) { probarAviso(); refrescar(); } else refrescar(); });
      $('[data-desactivar-avisos]')?.addEventListener('click', () => { store.guardarConfig({ notificaciones: false }); toast('Avisos desactivados'); refrescar(); });
      $('[data-probar-aviso]').onclick = () => probarAviso();
      $('[data-agenda-ics]').onclick = () => descargarAgendaICS(14);

      $('[data-google]')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try { const p = await conectarGoogle(); if (p) toast(`Conectado como ${p.email}`); }
        catch (err) { toast(err.message, null, 6000); }
        refrescar();
      });
      $('[data-sync-ahora]')?.addEventListener('click', async () => {
        if (!G.tokenValido()) { try { await G.pedirToken(''); } catch (err) { toast(err.message); return; } }
        await sincronizar(); toast(estadoSync().mensaje); refrescar();
      });
      $('[data-salir]')?.addEventListener('click', async () => {
        if (!(await confirmar('¿Cerrar sesión de Google en este dispositivo? Tus datos siguen guardados en tu Google Drive.', 'Cerrar sesión'))) return;
        const borrar = await confirmar('¿Borrar también los datos de ESTE dispositivo? (Recomendado si no es tu equipo personal.)', 'Sí, borrar', true);
        G.cerrarSesion();
        store.guardarConfig({ modo: '', googleEmail: '', googleNombre: '', sheetId: '', sheetUrl: '', lastSync: '' });
        if (borrar) { await store.vaciarTodo(); localStorage.removeItem('control.iniciado'); location.hash = '#/bienvenida'; }
        else refrescar();
      });
      // Conexión avanzada (Apps Script): solo existe si no se usa "Continuar con Google"
      const leerCon = () => ({ apiUrl: $('#aj-url').value.trim(), token: $('#aj-token').value.trim() });
      if ($('#aj-url')) $('[data-probar]').onclick = async () => {
        const c = leerCon();
        if (!c.apiUrl || !c.token) { toast('Completa URL y token'); return; }
        try {
          const r = await llamarApi('ping', {}, { ...store.config(), ...c });
          toast(`✔ Conectado a “${r.hoja}”`);
        } catch (e) { toast(`✖ ${e.message}`, null, 6000); }
      };
      if ($('#aj-url')) $('[data-guardar-con]').onclick = async () => {
        const c = leerCon();
        if (!c.apiUrl || !c.token) { toast('Completa URL y token'); return; }
        const cambio = c.apiUrl !== cfg.apiUrl;
        let vaciado = false;
        // Si hay datos de ejemplo, ofrecer borrarlos para no mezclarlos con tu hoja
        if (cambio && store.config().demo) {
          vaciado = await confirmar('Este dispositivo tiene datos de EJEMPLO. ¿Borrarlos antes de conectar? (Recomendado: así no se suben a tu Google Sheet)', 'Borrar ejemplo');
          if (vaciado) await store.vaciarTodo();
        }
        store.guardarConfig({ ...c, modo: '', ...(cambio ? { lastSync: '' } : {}) });
        // Al conectar por primera vez, subir todo lo local
        if (cambio && !vaciado) {
          for (const t of store.TABLAS) for (const r of store.todos(t)) await sinRefrescar(() => store.guardar(t, { id: r.id }));
        }
        await sincronizar();
        toast(estadoSync().mensaje);
        refrescar();
      };

      $('[data-demo]').onclick = async () => {
        if (store.config().modo === 'google' || store.config().apiUrl) {
          toast('Estás conectado a tu hoja de Google: cargar ejemplos los mezclaría con tus datos reales. Para verlos, usa una ventana de incógnito.', null, 8000);
          return;
        }
        await cargarDemo(); toast('Datos de ejemplo cargados'); location.hash = '#/hoy';
      };
      $('[data-vaciar]').onclick = async () => {
        if (await confirmar('Se borrarán todos los datos de ESTE dispositivo (tu Google Sheet no se toca). ¿Continuar?', 'Borrar todo', true)) {
          await store.vaciarTodo(); toast('Datos borrados'); refrescar();
        }
      };

      el.querySelectorAll('[data-csv]').forEach((b) => b.onclick = () => exportarCSV(b.dataset.csv));
      $('[data-json]').onclick = () => descargar(`control-respaldo-${hoy()}.json`, JSON.stringify(store.exportarTodo(), null, 1), 'application/json');
      $('[data-restaurar]').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const n = await store.importarTodo(JSON.parse(await f.text()));
          toast(`Restaurados ${n} registros`);
        } catch (err) { toast(`No se pudo restaurar: ${err.message}`); }
      };

      $('[data-disc-guardar]').onclick = () => {
        const lista = $('#aj-disc').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [nombre, resto = ''] = l.split(/:(.*)/s);
          return { nombre: nombre.trim(), claves: resto.split(',').map((c) => norm(c)).filter(Boolean) };
        });
        store.guardarConfig({ disciplinas: lista });
        toast(`${lista.length} disciplinas guardadas`);
      };
      $('[data-disc-reset]').onclick = () => { store.guardarConfig({ disciplinas: null }); toast('Catálogo restaurado'); refrescar(); };
    },
  };
}

/** Exporta a CSV con ; (abre bien en Excel en español). */
function exportarCSV(tabla) {
  const celda = (v) => {
    const s = (v ?? '').toString().replace(/\r?\n/g, ' ');
    return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let filas = [];
  if (tabla === 'pendientes') {
    filas = [['Título', 'Estado', 'Prioridad', 'Fecha', 'Hora', 'Responsable', 'Proyecto', 'Fase', 'Disciplina', 'Origen', 'Solicitante', 'Descripción', 'Notas', 'Comentarios', 'Inbox', 'Creado', 'Cerrado'],
      ...M.pendientes().sort(M.ordenar).map((p) => [p.titulo, p.estado, p.prioridad, p.fecha, p.hora, M.nombrePersona(p.responsable), M.proyecto(p.proyectoId)?.nombre, p.fase, p.disciplina, p.origen, p.solicitante, p.descripcion, p.notas, M.comentarios(p).map((c) => `[${fmtMomento(c.t)}] ${c.texto}`).join(' | '), p.inbox ? 'Sí' : '', (p.creado || '').slice(0, 10), fechaLocal(p.cerrado)])];
  } else if (tabla === 'reuniones') {
    filas = [['Título', 'Fecha', 'Hora', 'Duración', 'Proyecto', 'Participantes', 'Objetivo', 'Estado', 'Minuta'],
      ...store.todos('reuniones').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((r) => [r.titulo, r.fecha, r.hora, r.duracion, M.proyecto(r.proyectoId)?.nombre, (r.participantes || []).map(M.nombrePersona).join(', '), r.objetivo, r.estado, r.minuta])];
  } else if (tabla === 'acuerdos') {
    filas = [['Reunión', 'Fecha reunión', 'Acuerdo', 'Responsable', 'Fecha compromiso', 'Estado de la acción'],
      ...store.todos('acuerdos').map((a) => { const r = store.obtener('reuniones', a.reunionId); return [r?.titulo, r?.fecha, a.texto, M.nombrePersona(a.responsable), a.fecha, store.obtener('pendientes', a.pendienteId)?.estado || 'Sin acción']; })];
  } else if (tabla === 'diario') {
    filas = [['Fecha', 'Comentario del día', 'Cerrados', 'Avances', 'Movidos', 'Quedaron sin mover'],
      ...store.todos('diario').sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => [d.fecha, d.comentario,
        (d.hechos || []).map((x) => x.titulo).join(' | '), (d.avances || []).map((x) => `${x.titulo}: ${x.texto}`).join(' | '),
        (d.movidos || []).map((x) => `${x.titulo} → ${x.a}`).join(' | '), (d.quedaron || []).map((x) => x.titulo).join(' | ')])];
  } else if (tabla === 'proyectos') {
    filas = [['Proyecto', 'Cliente', 'Fase', 'Avance %', 'Entregable', 'Disciplina', 'Fecha', 'Hecho'],
      ...M.proyectos().flatMap((p) => (p.hitos?.length ? p.hitos : [{}]).map((h) => [p.nombre, p.cliente, p.fase, p.avance, h.nombre, h.disciplina, h.fecha, h.hecho ? 'Sí' : '']))];
  }
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(`control-${tabla}-${hoy()}.csv`, csv, 'text/csv;charset=utf-8');
}

// ============================================================
// MÁS (menú del celular)
// ============================================================
export function vistaMas() {
  const it = (href, icono, t, d) => `<a class="mas-item" href="${href}">${ic(icono)}<div><b>${t}</b><span>${d}</span></div>${ic('flecha')}</a>`;
  return {
    titulo: 'Más',
    html: `${cab('Más')}
    <div class="mas-lista">
      ${yaInstalada() ? '' : `<a class="mas-item mas-instalar" href="#" data-instalar>${ic('descargar')}<div><b>Instalar app en el celular</b><span>Ícono en tu pantalla, pantalla completa, sin internet</span></div>${ic('flecha')}</a>`}
      ${EQ.configurado() ? `${EQ.esJefe() ? '' : it('#/midia', 'hoy', 'Mi día (equipo)', 'Tus pendientes del día y lo que te asignaron')}${EQ.veEquipo() ? it('#/panel', 'equipo', 'Panel del equipo', 'Plan de las 9:00, avance y bloqueos') : ''}${EQ.esJefe() ? it('#/miembros', 'usuario', 'Miembros del equipo', 'Invitar, roles y reglas') : ''}` : it('#/ajustes', 'equipo', 'Equipo en línea', 'Tus ingenieros cargan su día; tú ves el estado')}
      <a class="mas-item" href="#/caja"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="16" cy="14.5" r="1.5"/></svg><div><b>Caja</b><span>Tus ingresos y gastos (S/ y US$)</span></div>${ic('flecha')}</a>
      ${it('#/equipo', 'equipo', 'Equipo', 'Carga de trabajo y 1:1')}
      ${it('#/proyectos', 'proyecto', 'Proyectos-Personales', 'Fases, hitos y entregables')}
      ${it('#/pendientes?vista=esperando', 'espera', 'Esperando a', 'Lo que delegaste')}
      ${it('#/diario', 'lista', 'Diario-Personales', 'Tus cierres del día')}
      ${it('#/revision', 'revision', 'Revisión semanal', 'Que no se pase nada')}
      ${it('#/ajustes', 'ajustes', 'Ajustes', 'Google Sheets, alertas, respaldo')}
      <a class="mas-item" href="#" data-compartir>${ic('enviar')}<div><b>Compartir la app</b><span>Envía el enlace a un colega</span></div>${ic('flecha')}</a>
    </div>`,
  };
}
