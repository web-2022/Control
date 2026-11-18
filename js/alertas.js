// ============================================================
// alertas.js — Avisos antes de pendientes y reuniones con hora.
//
// 1) Avisos de la app: notificación del sistema + sonido + vibración
//    + aviso en pantalla. Funcionan mientras la app está abierta o
//    minimizada (el navegador no deja que una web despierte cerrada).
// 2) Calendario: "Agregar a Google Calendar" o archivo .ics con su
//    recordatorio. Ese aviso llega aunque la app esté cerrada.
// ============================================================
import * as store from './store.js';
import * as M from './modelo.js';
import { toast, descargar } from './ui.js';
import { hoy, addDias, pad, fmtFecha, fechaLocal } from './util.js';
import { URL_APP } from './config.js';
import { compromisos } from './caja-modelo.js';
import * as EQ from './equipo-datos.js';

// Opciones de aviso (minutos antes). '' = usar el predeterminado de Ajustes.
export const OPCIONES_AVISO = [
  ['', 'Predeterminado'], ['0', 'A la hora'], ['5', '5 min antes'], ['10', '10 min antes'],
  ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['120', '2 horas antes'],
  ['1440', '1 día antes'], ['-1', 'Sin aviso'],
];

const zona = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima';
const aFecha = (fecha, hora) => { const [y, m, d] = fecha.split('-').map(Number); const [h, mi] = hora.split(':').map(Number); return new Date(y, m - 1, d, h, mi); };
const sello = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const selloUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

/** Minutos de aviso efectivos de un registro. */
export function minutosAviso(r) {
  const v = r.avisoMin;
  if (v === '' || v === undefined || v === null) return Number(store.config().avisoMin ?? 15);
  return Number(v);
}

// ---------------- Calendario ----------------
function datosEvento(tipo, r) {
  const pr = M.proyecto(r.proyectoId);
  const inicio = aFecha(r.fecha, r.hora);
  const dur = tipo === 'reunion' ? (Number(r.duracion) || 60) : 30;
  const fin = new Date(inicio.getTime() + dur * 60000);
  const partes = [];
  if (pr) partes.push(`Proyecto: ${pr.nombre}`);
  if (tipo === 'pendiente') {
    if (r.responsable) partes.push(`Responsable: ${M.nombrePersona(r.responsable)}`);
    if (r.descripcion) partes.push(r.descripcion);
  } else {
    const parts = (r.participantes || []).map(M.nombrePersona);
    if (parts.length) partes.push(`Participantes: ${parts.join(', ')}`);
    if (r.objetivo) partes.push(`Objetivo: ${r.objetivo}`);
    if (r.enlace) partes.push(`Enlace: ${r.enlace}`);
  }
  partes.push(`Abrir en Control: ${URL_APP}`);
  return {
    titulo: (tipo === 'pendiente' ? '⏰ ' : '📅 ') + r.titulo,
    inicio, fin, detalle: partes.join('\n'),
    lugar: tipo === 'reunion' ? (r.enlace || '') : '',
    aviso: Math.max(0, minutosAviso(r)),
    uid: `${r.id}@control-app`,
  };
}

/** Enlace para agregar el evento a Google Calendar. */
export function linkGoogleCalendar(tipo, r) {
  const e = datosEvento(tipo, r);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: e.titulo, dates: `${sello(e.inicio)}/${sello(e.fin)}`,
    details: e.detalle, ctz: zona(), ...(e.lugar ? { location: e.lugar } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const escICS = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
function vevento(tipo, r) {
  const e = datosEvento(tipo, r);
  return [
    'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${selloUTC(new Date())}`,
    `DTSTART:${selloUTC(e.inicio)}`, `DTEND:${selloUTC(e.fin)}`, // en UTC: lo entienden todos los calendarios
    `SUMMARY:${escICS(e.titulo)}`, `DESCRIPTION:${escICS(e.detalle)}`,
    ...(e.lugar ? [`LOCATION:${escICS(e.lugar)}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escICS(e.titulo)}`, `TRIGGER:-PT${e.aviso}M`, 'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}
const envolverICS = (eventos) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Control//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...eventos, 'END:VCALENDAR'].join('\r\n');

/** Descarga un .ics de un solo evento (iPhone, Outlook, Calendar de PC). */
export function descargarICS(tipo, r) {
  descargar(`${r.titulo.slice(0, 40).replace(/[^\wáéíóúñ ]+/gi, '').trim() || 'evento'}.ics`, envolverICS([vevento(tipo, r)]), 'text/calendar;charset=utf-8');
}

/** Descarga un .ics con todo lo que tiene fecha y hora en los próximos días. */
export function descargarAgendaICS(dias = 14) {
  const H = hoy(), lim = addDias(H, dias);
  const eventos = [
    ...store.todos('reuniones').filter((r) => r.fecha >= H && r.fecha <= lim && r.hora && r.estado !== 'Cancelada').map((r) => vevento('reunion', r)),
    ...M.abiertos().filter((p) => p.fecha >= H && p.fecha <= lim && p.hora).map((p) => vevento('pendiente', p)),
  ];
  if (!eventos.length) { toast(`No hay reuniones ni pendientes con hora en los próximos ${dias} días`); return; }
  descargar(`control-agenda-${H}.ics`, envolverICS(eventos), 'text/calendar;charset=utf-8');
  toast(`${eventos.length} eventos exportados. Ábrelo para agregarlos a tu calendario.`);
}

/** HTML de los botones de calendario para un registro con fecha y hora. */
export function botonesCalendario(tipo, r) {
  if (!r?.fecha || !r?.hora) return '';
  return `<a class="btn btn-mini" target="_blank" rel="noopener" href="${linkGoogleCalendar(tipo, r)}">📅 Agregar a Google Calendar</a>
    <button type="button" class="btn btn-mini" data-ics="${tipo}:${r.id}">Descargar .ics (iPhone / Outlook)</button>`;
}

// ---------------- Avisos de la app ----------------
let ctxAudio = null;
function sonar() {
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctxAudio.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(ctxAudio.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  } catch { /* sin audio */ }
}

export const permisoNotif = () => ('Notification' in window ? Notification.permission : 'unsupported');

/** Pide permiso de notificaciones (llamar desde un clic). */
export async function activarAvisos() {
  if (!('Notification' in window)) { toast('Este navegador no permite notificaciones. Usa “Agregar a mi calendario”.', null, 6000); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') {
    const instalada = window.matchMedia('(display-mode: standalone)').matches;
    toast(instalada
      ? 'El teléfono bloqueó las notificaciones de Control. Mantén presionado el ícono de Control → ⓘ Información de la app → Notificaciones → Permitir. Luego vuelve y pulsa “Activar avisos”.'
      : 'Las notificaciones están bloqueadas. Toca el candado (o ⓘ) junto a la dirección → Permisos → Notificaciones → Permitir. Luego pulsa “Activar avisos”.', null, 12000);
    store.guardarConfig({ notificaciones: false });
    return false;
  }
  store.guardarConfig({ notificaciones: true });
  // Desbloquear el audio con este clic (los navegadores lo exigen)
  try { ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)(); ctxAudio.resume(); } catch { /* */ }
  return true;
}

/** Muestra un aviso por todos los medios disponibles. */
export function avisar({ clave, titulo, cuerpo, url }) {
  const cfg = store.config();
  sonar();
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  toast(`${titulo} — ${cuerpo}`, url ? { texto: 'Ver', fn: () => { location.hash = url; } } : null, 15000);
  if (cfg.notificaciones && permisoNotif() === 'granted') {
    const op = { body: cuerpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: clave, renotify: true, requireInteraction: true, vibrate: [200, 100, 200], data: { url } };
    (navigator.serviceWorker?.ready || Promise.reject())
      .then((reg) => reg.showNotification(titulo, op))
      .catch(() => { try { new Notification(titulo, op); } catch { /* */ } });
  }
}

/** Prueba de aviso (botón en Ajustes). */
export function probarAviso() {
  avisar({ clave: 'prueba', titulo: '🔔 Prueba de aviso de Control', cuerpo: 'Así te avisaré antes de tus reuniones y pendientes.', url: '#/hoy' });
}

const CLAVE_AVISADOS = 'control.avisados';
function cargarAvisados() { try { return JSON.parse(localStorage.getItem(CLAVE_AVISADOS) || '{}'); } catch { return {}; } }

/** Revisa qué toca avisar ahora. Se llama cada 20 s y al volver a la app. */
export function revisarAlertas() {
  const H = hoy();
  const ahora = Date.now();
  const avisados = cargarAvisados();
  const items = [
    ...M.abiertos().filter((p) => p.fecha && p.hora && p.fecha >= addDias(H, -1) && p.fecha <= addDias(H, 1)).map((p) => ({ tipo: 'pendiente', r: p })),
    ...store.todos('reuniones').filter((r) => r.fecha && r.hora && r.estado === 'Programada' && r.fecha >= addDias(H, -1) && r.fecha <= addDias(H, 1)).map((r) => ({ tipo: 'reunion', r })),
  ];
  for (const { tipo, r } of items) {
    const min = minutosAviso(r);
    if (min < 0) continue;
    const inicio = aFecha(r.fecha, r.hora).getTime();
    const url = tipo === 'reunion' ? `#/reunion/${r.id}` : '#/hoy';
    const icono = tipo === 'reunion' ? '📅' : '⏰';
    const base = `${tipo}-${r.id}-${r.fecha}-${r.hora}`;
    // Aviso previo
    const kPrevio = `${base}-${min}`;
    if (min > 0 && !avisados[kPrevio] && ahora >= inicio - min * 60000 && ahora < inicio) {
      avisados[kPrevio] = H;
      const faltan = Math.max(1, Math.round((inicio - ahora) / 60000));
      avisar({ clave: kPrevio, titulo: `${icono} ${r.titulo}`, cuerpo: `${faltan >= 60 * 24 ? fmtFecha(r.fecha) : faltan >= 60 ? `En ${Math.round(faltan / 60)} h` : `En ${faltan} min`} · ${r.hora}`, url });
    }
    // Aviso a la hora exacta (hasta 10 min de tolerancia si el teléfono estaba dormido)
    const kHora = `${base}-ahora`;
    if (!avisados[kHora] && ahora >= inicio && ahora < inicio + 10 * 60000) {
      avisados[kHora] = H;
      avisar({ clave: kHora, titulo: `${icono} Ahora: ${r.titulo}`, cuerpo: tipo === 'reunion' ? `Empieza a las ${r.hora}` : `Programado para las ${r.hora}`, url });
    }
  }
  // Pagos de deudas y gastos fijos: 3 días antes y el mismo día (desde las 8:00)
  if (new Date().getHours() >= 8) {
    for (const x of compromisos(H.slice(0, 7), Number(store.config().tipoCambio) || 0)) {
      if (x.estado === 'pagado') continue;
      const faltan = Math.round((new Date(x.fecha + 'T00:00:00') - new Date(H + 'T00:00:00')) / 86400000);
      if (faltan !== 3 && faltan !== 0) continue;
      const k = `comp-${x.c.id}-${x.fecha}-${faltan}`;
      if (avisados[k]) continue;
      avisados[k] = H;
      const monto = `${x.moneda === 'USD' ? 'US$' : 'S/'} ${x.pendiente.toFixed(2)}`;
      avisar({ clave: k, titulo: `🏦 ${faltan ? 'En 3 días' : 'Hoy'} vence: ${x.c.nombre}`, cuerpo: `${monto} · día ${Number(x.fecha.slice(8))}`, url: '#/caja' });
    }
  }
  // Equipo: recordar el plan del día (15 min antes y a la hora límite) y avisar lo que te asignan
  if (EQ.activo()) {
    const yo = EQ.miEmail();
    const limite = Number(EQ.configEquipo().horaPlan || 9);
    const d = new Date();
    const min = d.getHours() * 60 + d.getMinutes();
    if (!EQ.esJefe() && EQ.esDiaLaborable() && !EQ.estadoDia(yo).planIso) {
      const k1 = `eq-plan-${H}-antes`, k2 = `eq-plan-${H}-hora`;
      if (!avisados[k1] && min >= limite * 60 - 15 && min < limite * 60) { avisados[k1] = H; avisar({ clave: k1, titulo: '📝 Carga tu plan del día', cuerpo: `Antes de las ${limite}:00 · toca para abrir Mi día`, url: '#/midia' }); }
      if (!avisados[k2] && min >= limite * 60 && min < limite * 60 + 120) { avisados[k2] = H; avisar({ clave: k2, titulo: '⏰ Aún no cargas tu plan de hoy', cuerpo: 'Tu jefe lo verá en el panel del equipo', url: '#/midia' }); }
    }
    for (const t of EQ.tareas()) {
      if (t.asignadoA !== yo || t.creadoPor === yo || t.visto || t.estado === 'hecho') continue;
      const k = `eq-asig-${t.id}`;
      if (avisados[k]) continue;
      avisados[k] = H;
      avisar({ clave: k, titulo: `📌 ${EQ.primerNombre(t.creadoPor)} te asignó un pendiente`, cuerpo: `${t.titulo}${t.fecha ? ' · ' + fmtFecha(t.fecha) : ''}`, url: '#/midia' });
    }
    for (const t of EQ.sugerencias()) {
      if (t.asignadoA === yo && t.sugerencia === 'pendiente' && !t.visto) {
        const k = `eq-sug-${t.id}`;
        if (!avisados[k]) { avisados[k] = H; avisar({ clave: k, titulo: `💡 ${EQ.primerNombre(t.creadoPor)} te sugiere un pendiente`, cuerpo: `${t.titulo} · ¿lo tomas?`, url: '#/midia' }); }
      }
    }
    // Respuesta a mis sugerencias
    for (const t of [...EQ.sugerencias(), ...EQ.tareas()]) {
      if (t.creadoPor !== yo || t.asignadoA === yo || !['aceptada', 'rechazada'].includes(t.sugerencia)) continue;
      const k = `eq-resp-${t.id}-${t.sugerencia}`;
      if (avisados[k] || fechaLocal(t.updatedAt) < addDias(H, -1)) continue;
      avisados[k] = H;
      avisar({ clave: k, titulo: t.sugerencia === 'aceptada' ? `✓ ${EQ.primerNombre(t.asignadoA)} tomó tu sugerencia` : `${EQ.primerNombre(t.asignadoA)}: no le corresponde`, cuerpo: `${t.titulo}${t.respuesta ? ' · ' + t.respuesta : ''}`, url: '#/midia' });
    }
  }
  // Resumen de vencidos una vez al día
  const venc = M.vencidos();
  const kVenc = `vencidos-${H}`;
  if (venc.length && !avisados[kVenc] && store.config().notificaciones) {
    avisados[kVenc] = H;
    avisar({ clave: kVenc, titulo: `${venc.length} pendientes vencidos`, cuerpo: venc.slice(0, 3).map((p) => p.titulo).join(' · '), url: '#/pendientes?rango=vencidos' });
  }
  for (const k of Object.keys(avisados)) if (avisados[k] < addDias(H, -2)) delete avisados[k];
  localStorage.setItem(CLAVE_AVISADOS, JSON.stringify(avisados));
}

/** Arranca la revisión periódica. */
export function iniciarAlertas() {
  setTimeout(revisarAlertas, 3000);
  setInterval(revisarAlertas, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarAlertas(); });
  // Botones "Descargar .ics" en cualquier pantalla
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ics]');
    if (!b) return;
    e.preventDefault();
    const [tipo, id] = b.dataset.ics.split(':');
    const r = store.obtener(tipo === 'reunion' ? 'reuniones' : 'pendientes', id);
    if (r) descargarICS(tipo, r);
  });
  // Desbloquear el audio con el primer toque (requisito del navegador)
  document.addEventListener('pointerdown', () => { try { ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)(); ctxAudio.resume(); } catch { /* */ } }, { once: true });
}
