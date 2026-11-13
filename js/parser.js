// ============================================================
// parser.js — Entiende frases en español y extrae datos.
//
//   "mañana 10am revisar costos CAPEX con Ana, prioridad alta"
//     -> fecha: mañana, hora: 10:00, responsable: Ana,
//        prioridad: alta, disciplina: Costos, título: "Revisar costos CAPEX"
//
// Reglas (se pueden combinar):
//   Fecha:       hoy, mañana, pasado mañana, lunes…domingo, próximo lunes,
//                15/11, 15/11/2026, 20 de noviembre, el 18, en 3 días,
//                la próxima semana, esta semana, fin de mes
//   Hora:        10am, 3 pm, 10:30, a las 3, 8 de la mañana, mediodía,
//                en la tarde (15:00), en la mañana (09:00)
//   Responsable: @Juan, con Juan, responsable Juan, pedir a Juan,
//                encargar a Juan, que Juan…, "Juan …" al inicio
//   Proyecto:    #Huaylla, proyecto Huaylla, o el código del proyecto
//   Prioridad:   !alta / !media / !baja, prioridad alta, urgente
//   Estado:      "esperando…" -> Esperando a tercero
//   Disciplina:  por palabras clave (ver catalogo.js)
//
// Es una función pura: no toca el DOM, se prueba con Node.
// ============================================================
import { normMismaLongitud, norm, ymd, parseYmd, addDias, pad, capitalizar } from './util.js';
import { detectarDisciplina, DISCIPLINAS } from './catalogo.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const NUMS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15 };
const PARTE_DIA = { manana: 9, tarde: 15, noche: 19 };

// Palabras sueltas que sobran al inicio/fin del título tras quitar datos.
const SOBRANTES = new Set(['para', 'el', 'la', 'los', 'las', 'de', 'del', 'con', 'a', 'al', 'y', 'en', 'por', 'hasta', 'antes', 'desde', 'que', 'e', 'este', 'esta', 'proximo', 'proxima']);

// Prefijo opcional delante de una fecha: "para el", "antes del", "hasta el"…
const PRE = '(?:(?:para|hasta|antes|desde|el|del|de|este|esta)\\s+){0,3}';

/**
 * @param {string} texto  Frase dictada o escrita.
 * @param {object} ctx    { now: Date, personas: [{id,nombre}], proyectos: [{id,nombre,codigo}], disciplinas }
 */
export function parsear(texto, ctx = {}) {
  const now = ctx.now || new Date();
  const hoyS = ymd(now);
  const personas = ctx.personas || [];
  const proyectos = ctx.proyectos || [];

  // Trabajamos con dos copias de igual longitud: original y normalizada.
  let orig = ' ' + (texto || '').replace(/\s+/g, ' ').trim() + ' ';
  let n = normMismaLongitud(orig);

  const r = {
    titulo: '', fecha: null, hora: null,
    responsableId: null, responsableNombre: null,
    proyectoId: null, proyectoNombre: null,
    prioridad: null, disciplina: null, esperando: false,
  };

  /** Busca re en el texto normalizado; si fn no devuelve false, borra lo encontrado. */
  const tomar = (re, fn) => {
    const m = re.exec(n);
    if (!m) return false;
    const ini = m.index, fin = m.index + m[0].length;
    const res = fn(m, orig.slice(ini, fin));
    if (res === false) return false;
    const blanco = ' '.repeat(fin - ini);
    orig = orig.slice(0, ini) + blanco + orig.slice(fin);
    n = n.slice(0, ini) + blanco + n.slice(fin);
    return true;
  };

  // ---------- Personas y proyectos conocidos ----------
  const buscarPersona = (nombre) => {
    const k = norm(nombre);
    if (!k) return null;
    return personas.find((p) => norm(p.nombre) === k)
      || personas.find((p) => norm(p.nombre).split(/\s+/)[0] === k)
      || personas.find((p) => norm(p.alias || '') === k)
      || null;
  };
  const codigoDe = (p) => norm(p.codigo || p.nombre.split(/\s+/)[0]).replace(/\s+/g, '');
  const buscarProyecto = (tag) => {
    const k = norm(tag).replace(/\s+/g, '');
    if (!k) return null;
    return proyectos.find((p) => codigoDe(p) === k)
      || proyectos.find((p) => norm(p.nombre).replace(/\s+/g, '').startsWith(k))
      || proyectos.find((p) => norm(p.nombre).split(/\s+/).includes(k))
      || null;
  };
  const ponerResponsable = (nombre) => {
    const p = buscarPersona(nombre);
    if (p) { r.responsableId = p.id; r.responsableNombre = p.nombre; }
    else { r.responsableNombre = capitalizar(nombre); }
  };

  // ---------- 1. Prioridad ----------
  tomar(/\s!(alta|media|baja|a|m|b)\b/, (m) => { r.prioridad = { a: 'alta', m: 'media', b: 'baja' }[m[1]] || m[1]; });
  tomar(/,?\s(?:con\s+)?prioridad\s+(alta|media|baja)\b/, (m) => { r.prioridad = m[1]; });
  tomar(/\s(urgente|urgentisimo|critico)\b/, () => { r.prioridad = 'alta'; });

  // ---------- 2. Proyecto ----------
  tomar(/\s#([a-z0-9_.\-]+)/, (m, o) => {
    const p = buscarProyecto(m[1]);
    if (p) { r.proyectoId = p.id; r.proyectoNombre = p.nombre; }
    else r.proyectoNombre = o.trim().slice(1);
  });
  if (!r.proyectoNombre) {
    for (const p of proyectos) {
      const c = codigoDe(p);
      if (c.length < 3) continue;
      // "proyecto Huaylla" -> se quita del título; "Huaylla" suelto se deja.
      if (tomar(new RegExp(`\\s(?:del?\\s+|para\\s+(?:el\\s+)?)?proyecto\\s+${c}\\b`), () => {})) {
        r.proyectoId = p.id; r.proyectoNombre = p.nombre; break;
      }
      if (new RegExp(`\\b${c}\\b`).test(n)) { r.proyectoId = p.id; r.proyectoNombre = p.nombre; break; }
    }
  }

  // ---------- 3. Hora ----------
  const AMPM = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
  const ponerHora = (h, mi = 0, ampm = '', parte = '') => {
    h = Number(h); mi = Number(mi);
    if (h > 23 || mi > 59) return false;
    const pm = /^p/.test(ampm) || parte === 'tarde' || parte === 'noche';
    const am = /^a/.test(ampm) || parte === 'manana';
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (!pm && !am && h >= 1 && h <= 6) h += 12; // "a las 3" en jornada laboral = 15:00
    r.hora = `${pad(h)}:${pad(mi)}`;
  };
  tomar(/\s(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s+(?:de\s+la\s+|en\s+la\s+|por\s+la\s+)(manana|tarde|noche)\b/, (m) => ponerHora(m[1], m[2] || 0, '', m[3]))
    || tomar(new RegExp(`\\s(?:a\\s+las?\\s+|desde\\s+las?\\s+)?(\\d{1,2})[:h](\\d{2})\\s*(?:${AMPM}|hrs?\\b|horas\\b)?`), (m) => ponerHora(m[1], m[2], m[3] || ''))
    || tomar(new RegExp(`\\s(?:a\\s+las?\\s+)?(\\d{1,2})\\s*${AMPM}(?=[\\s,;]|$)`), (m) => ponerHora(m[1], 0, m[2]))
    || tomar(/\sa\s+las?\s+(\d{1,2})(?:\s*(?:hrs?|horas)\b)?(?!\s*(?:\/|de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)))/, (m) => ponerHora(m[1]))
    || tomar(/\s(?:al\s+|a\s+)?medio\s?dia\b/, () => { r.hora = '12:00'; });

  // ---------- 4. Fecha ----------
  const ponerFecha = (s) => { r.fecha = s; };
  const proximoDia = (dow, forzarSiguiente) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let delta = (dow - d.getDay() + 7) % 7;
    if (delta === 0 && forzarSiguiente) delta = 7;
    d.setDate(d.getDate() + delta);
    return ymd(d);
  };
  const fechaDM = (dia, mes, anio) => {
    let y = anio ? Number(anio) : now.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, mes - 1, Number(dia));
    if (d.getMonth() !== mes - 1) return false; // fecha inválida (31/02)
    // Sin año y ya pasó hace más de 2 meses -> año siguiente
    if (!anio && (now - d) / 86400000 > 60) d.setFullYear(y + 1);
    return ymd(d);
  };

  // Parte del día suelta: "en la tarde", "por la mañana" (sin hora explícita)
  tomar(/\s(?:en|por|de)\s+la\s+(manana|tarde|noche)\b/, (m) => { if (!r.hora) r.hora = pad(PARTE_DIA[m[1]]) + ':00'; });

  const buscarFecha = () =>
    tomar(/\s(?:anteayer|antes\s+de\s+ayer)\b/, () => ponerFecha(addDias(hoyS, -2)))
    || tomar(/\s(?:el\s+dia\s+de\s+)?ayer\b/, () => ponerFecha(addDias(hoyS, -1)))
    || tomar(new RegExp(`\\s${PRE}pasado\\s+manana\\b`), () => ponerFecha(addDias(hoyS, 2)))
    || tomar(/\s(?:para\s+)?(?:hoy|esta\s+(manana|tarde|noche))\b/, (m) => {
      ponerFecha(hoyS);
      if (m[1] && !r.hora) r.hora = pad(PARTE_DIA[m[1]]) + ':00';
    })
    || tomar(new RegExp(`\\s${PRE}manana\\b`), () => ponerFecha(addDias(hoyS, 1)))
    || tomar(/\s(?:en|dentro\s+de)\s+(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\s+(dias?|semanas?)\b/, (m) => {
      const k = NUMS[m[1]] ?? Number(m[1]);
      ponerFecha(addDias(hoyS, m[2].startsWith('semana') ? k * 7 : k));
    })
    || tomar(new RegExp(`\\s${PRE}(?:la\\s+)?(?:proxima|siguiente)\\s+semana\\b|\\s${PRE}semana\\s+(?:que\\s+viene|proxima|siguiente)\\b`), () => ponerFecha(proximoDia(1, true)))
    || tomar(new RegExp(`\\s${PRE}fin\\s+de\\s+mes\\b`), () => {
      ponerFecha(ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    })
    || tomar(new RegExp(`\\s${PRE}(?:esta\\s+)?semana\\b(?!\\s+(?:que|proxima|siguiente))`), () => {
      // "esta semana" -> viernes de esta semana (o hoy si ya pasó)
      const v = proximoDia(5, false);
      ponerFecha(v < hoyS || now.getDay() === 6 || now.getDay() === 0 ? hoyS : v);
    })
    || tomar(new RegExp(`\\s${PRE}(?:fin\\s+de\\s+semana)\\b`), () => ponerFecha(proximoDia(6, false)))
    || tomar(new RegExp(`\\s${PRE}(?:(proximo|siguiente)\\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\\s+(?:que\\s+viene|proximo|siguiente))?\\b`), (m, o) => {
      const esEste = /\beste\b/.test(norm(o));
      ponerFecha(proximoDia(DIAS.indexOf(m[2]), !esEste || !!m[1] || !!m[3]));
    })
    || tomar(new RegExp(`\\s${PRE}(\\d{1,2})\\s+de\\s+(${Object.keys(MESES).join('|')})(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?\\b`), (m) => {
      const f = fechaDM(m[1], MESES[m[2]], m[3]);
      if (!f) return false;
      ponerFecha(f);
    })
    || tomar(new RegExp(`\\s${PRE}(\\d{1,2})[/\\-](\\d{1,2})(?:[/\\-](\\d{2,4}))?\\b`), (m) => {
      const f = fechaDM(m[1], Number(m[2]), m[3]);
      if (!f) return false;
      ponerFecha(f);
    })
    // "el 18", "para el dia 25" (día del mes actual o siguiente)
    || tomar(/\s(?:(?:para|hasta|antes)\s+)?(?:el|del)\s+(?:dia\s+)?(\d{1,2})\b(?!\s*(?:[:%]|de\s+la|am|pm|hrs?|horas|kv|m\b|metros|km|t\b|tm|mm|cm|%))/, (m) => {
      const dia = Number(m[1]);
      if (dia < 1 || dia > 31) return false;
      let d = new Date(now.getFullYear(), now.getMonth(), dia);
      if (ymd(d) < hoyS) d = new Date(now.getFullYear(), now.getMonth() + 1, dia);
      ponerFecha(ymd(d));
    });
  buscarFecha();
  if (r.hora && !r.fecha) r.fecha = hoyS;

  // ---------- 5. Responsable ----------
  const NOM = '([a-z][a-z.\\-]{1,30})';
  tomar(new RegExp(`\\s(?:(?:a|con|para|de)\\s+)?@${NOM}`), (m) => ponerResponsable(m[1]));
  if (!r.responsableNombre) {
    // Conectores que sí implican responsable (solo con personas conocidas,
    // salvo "responsable X" que es explícito).
    const conectores = [
      { re: `\\s(?:,\\s*)?responsable:?\\s+${NOM}`, quitar: true, libre: true },
      { re: `\\s(?:encargar(?:le)?|delegar(?:le)?|asignar(?:le)?|pedir(?:le)?|solicitar(?:le)?|recordar(?:le)?)\\s+a\\s+${NOM}`, quitar: 'verbo' },
      { re: `\\sesperando\\s+(?:a\\s+|de\\s+)?${NOM}`, quitar: false, esperando: true },
      { re: `\\s(?:respuesta|confirmacion|informacion|info|entrega)\\s+de\\s+${NOM}`, quitar: false },
      { re: `\\scon\\s+${NOM}`, quitar: true },
      { re: `\\sque\\s+${NOM}`, quitar: false },
    ];
    for (const c of conectores) {
      const re = new RegExp(c.re);
      const m = re.exec(n);
      if (!m) continue;
      const p = buscarPersona(m[1]);
      if (!p && !c.libre) continue;
      if (c.esperando) r.esperando = true;
      if (c.quitar === true) {
        tomar(re, () => ponerResponsable(m[1]));
      } else if (c.quitar === 'verbo') {
        // "pedir a Juan el plano" -> título "Pedir el plano"
        tomar(new RegExp(`\\sa\\s+${m[1].replace(/[.\\-]/g, '\\$&')}\\b`), () => ponerResponsable(m[1]));
      } else {
        ponerResponsable(m[1]);
      }
      break;
    }
  }
  if (!r.responsableNombre) {
    // Nombre conocido al inicio: "Juan debe enviar…"
    const m = /^\s+([a-z]+)/.exec(n);
    if (m && buscarPersona(m[1])) ponerResponsable(m[1]);
  }

  // ---------- 6. Estado "esperando" ----------
  if (/\b(esperando|esperar\s+respuesta|seguimiento\s+a|pendiente\s+de\s+respuesta)\b/.test(n)) r.esperando = true;

  // ---------- 7. Disciplina ----------
  r.disciplina = detectarDisciplina(texto, ctx.disciplinas || DISCIPLINAS);

  // ---------- 8. Título limpio ----------
  let palabras = orig.replace(/\s*([,;])\s*/g, '$1 ').split(/\s+/).filter(Boolean);
  const limpia = (w) => norm(w.replace(/[,;:.\-–]+$/, ''));
  const quitarBordes = () => {
    let cambio = true;
    while (cambio && palabras.length) {
      cambio = false;
      if (SOBRANTES.has(limpia(palabras[0])) || /^[,;:.\-–]+$/.test(palabras[0])) { palabras.shift(); cambio = true; }
      const u = palabras[palabras.length - 1];
      if (u && (SOBRANTES.has(limpia(u)) || /^[,;:.\-–]+$/.test(u))) { palabras.pop(); cambio = true; }
    }
  };
  quitarBordes();
  let titulo = palabras.join(' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/[,;:\-–]+$/g, '')
    .replace(/,\s*,/g, ',')
    .trim();
  r.titulo = capitalizar(titulo) || capitalizar((texto || '').trim());
  return r;
}
