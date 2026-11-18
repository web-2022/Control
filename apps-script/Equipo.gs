/**
 * ============================================================
 *  CONTROL · EQUIPO — Servidor del equipo en Google Apps Script
 *
 *  Guarda en una hoja "Control – Equipo" (en el Drive del jefe):
 *    Miembros · Tareas · Planes · Config · Archivo
 *
 *  Cada persona entra con su cuenta de Google. El servidor verifica
 *  esa cuenta con Google y aplica los permisos:
 *    jefe      → ve y asigna a todos; administra miembros
 *    lider     → ve y asigna a su equipo (y a sí mismo)
 *    ingeniero → ve y edita solo lo suyo
 *
 *  INSTALACIÓN (la app te guía en Ajustes → Equipo en línea):
 *   1. Entra a https://script.new  (proyecto nuevo de Apps Script).
 *   2. Borra lo que aparece, pega TODO este archivo y guarda (Ctrl+S).
 *   3. Implementar → Nueva implementación → ⚙ Aplicación web
 *        Ejecutar como: Yo      Quién tiene acceso: Cualquier usuario
 *      Autoriza los permisos y copia la URL que termina en /exec.
 *   4. En la app pega esa URL. La primera persona que se conecta
 *      queda como jefe; la hoja y el recordatorio de las 9:00 se crean solos.
 * ============================================================
 */

var CLIENT_ID = '906324648663-96a20bdnhr0sq2vsfnjuptovd0v5ee39.apps.googleusercontent.com';
var TZ = 'America/Lima';
var URL_APP = 'https://web-2022.github.io/Control/';
var NOMBRE_LIBRO = 'Control – Equipo';

var HOJAS = { miembros: 'Miembros', tareas: 'Tareas', planes: 'Planes', config: 'Config', archivo: 'Archivo' };
var COLS = {
  miembros: ['id', 'email', 'nombre', 'rol', 'lider', 'estado', 'cargo', 'creado', 'updatedAt', '_srv'],
  tareas: ['id', 'titulo', 'nota', 'asignadoA', 'creadoPor', 'fecha', 'prioridad', 'proyecto', 'estado', 'motivo', 'avance', 'comentarios', 'visto', 'completado', 'creado', 'updatedAt', 'deleted', '_srv'],
  planes: ['id', 'email', 'fecha', 'enviado', 'cierre', 'comentario', 'creado', 'updatedAt', '_srv'],
  config: ['clave', 'valor'],
};
COLS.archivo = COLS.tareas;
var CONFIG_DEFECTO = { horaPlan: '9', dias: '1,2,3,4,5', correoRecordatorio: 'si', correoAsignacion: 'si', correoResumen: 'si', nombreEquipo: 'Mi equipo' };
var CAMPOS_TAREA = ['titulo', 'nota', 'asignadoA', 'fecha', 'prioridad', 'proyecto', 'estado', 'motivo', 'avance', 'visto', 'completado', 'deleted'];

// ---------------- Entrada HTTP ----------------
function doGet() {
  return ContentService.createTextOutput('Control · Equipo funcionando. Úsalo desde la app: ' + URL_APP);
}

function doPost(e) {
  var salida;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    salida = manejar(req);
    salida.ok = true;
  } catch (err) {
    salida = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Identidad (cuenta de Google verificada) ----------------
function verificar(token) {
  if (!token) throw new Error('sesion: falta iniciar sesión con Google');
  var clave = 'tk_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var cache = CacheService.getScriptCache();
  var email = cache.get(clave);
  if (email) return email;
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('sesion: tu sesión de Google venció');
  var info = JSON.parse(r.getContentText());
  if ((info.aud || info.azp) !== CLIENT_ID && info.azp !== CLIENT_ID) throw new Error('sesion: la sesión no es de la app Control');
  if (!info.email || String(info.email_verified) !== 'true') throw new Error('sesion: la cuenta no tiene correo verificado');
  email = String(info.email).toLowerCase();
  var ttl = Math.max(60, Math.min(Number(info.expires_in) || 600, 3000));
  cache.put(clave, email, ttl);
  return email;
}

// ---------------- Libro y hojas ----------------
function libro() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LIBRO_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(NOMBRE_LIBRO);
    props.setProperty('LIBRO_ID', ss.getId());
    var primera = ss.getSheets()[0];
    Object.keys(HOJAS).forEach(function (t, i) {
      var h = i === 0 ? primera.setName(HOJAS[t]) : ss.insertSheet(HOJAS[t]);
      h.getRange(1, 1, h.getMaxRows(), Math.max(COLS[t].length, 1)).setNumberFormat('@'); // todo como texto (fechas sin convertir)
      h.getRange(1, 1, 1, COLS[t].length).setValues([COLS[t]]).setFontWeight('bold');
      h.setFrozenRows(1);
    });
    instalarActivador();
  }
  return ss;
}

function hoja(ss, t) {
  var h = ss.getSheetByName(HOJAS[t]);
  if (!h) {
    h = ss.insertSheet(HOJAS[t]);
    h.getRange(1, 1, h.getMaxRows(), COLS[t].length).setNumberFormat('@');
    h.getRange(1, 1, 1, COLS[t].length).setValues([COLS[t]]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

/** Lee una hoja completa: { h, cols, filas: [obj], fila: {id: n° de fila} } */
function leer(ss, t) {
  var h = hoja(ss, t);
  var v = h.getDataRange().getValues();
  var cols = v[0].map(String);
  // Columnas nuevas (si se actualizó el código)
  var faltan = COLS[t].filter(function (c) { return cols.indexOf(c) < 0; });
  if (faltan.length) {
    h.getRange(1, cols.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    cols = cols.concat(faltan);
  }
  var filas = [], fila = {};
  for (var i = 1; i < v.length; i++) {
    var o = {};
    for (var j = 0; j < cols.length; j++) o[cols[j]] = v[i][j] === undefined ? '' : (v[i][j] instanceof Date ? v[i][j].toISOString() : String(v[i][j]));
    var clave = t === 'config' ? o.clave : o.id;
    if (!clave) continue;
    o._fila = i + 1;
    filas.push(o);
    fila[clave] = o;
  }
  return { h: h, cols: cols, filas: filas, fila: fila, t: t, nuevas: [] };
}

function aFila(tab, o) { return tab.cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : (typeof o[c] === 'object' ? JSON.stringify(o[c]) : String(o[c])); }); }

/** Guarda un registro (actualiza su fila o lo deja para agregar al final). */
function poner(tab, o) {
  var ex = tab.fila[o.id];
  if (ex && ex._fila) {
    for (var k in o) ex[k] = o[k];
    tab.h.getRange(ex._fila, 1, 1, tab.cols.length).setValues([aFila(tab, ex)]);
  } else if (ex) {
    for (var k2 in o) ex[k2] = o[k2];
  } else {
    tab.filas.push(o); tab.fila[o.id] = o; tab.nuevas.push(o);
  }
}
function guardarNuevas(tab) {
  if (!tab.nuevas.length) return;
  var ini = tab.h.getLastRow() + 1;
  var vals = tab.nuevas.map(function (o) { return aFila(tab, o); });
  tab.h.getRange(ini, 1, vals.length, tab.cols.length).setNumberFormat('@').setValues(vals);
  tab.nuevas.forEach(function (o, i) { o._fila = ini + i; });
  tab.nuevas = [];
}

function leerConfig(ss) {
  var tab = leer(ss, 'config');
  var c = {};
  for (var k in CONFIG_DEFECTO) c[k] = CONFIG_DEFECTO[k];
  tab.filas.forEach(function (f) { c[f.clave] = f.valor; });
  return c;
}
function guardarConfig(ss, cambios) {
  var tab = leer(ss, 'config');
  for (var k in cambios) {
    if (!(k in CONFIG_DEFECTO)) continue;
    var ex = tab.fila[k];
    if (ex) tab.h.getRange(ex._fila, 2).setValue(String(cambios[k]));
    else tab.h.appendRow([k, String(cambios[k])]);
  }
}

// ---------------- Fechas (hora de Lima) ----------------
function hoyLima() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function fechaLima(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd') : ''; }
function horaLima(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'HH:mm') : ''; }
function sumarDias(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------------- Permisos ----------------
/** Correos que la persona puede ver y asignar. */
function visibles(me, miembros) {
  var activos = miembros.filter(function (m) { return m.estado === 'activo'; });
  if (me.rol === 'jefe') return activos.map(function (m) { return m.id; });
  var r = [me.id];
  if (me.rol === 'lider') {
    var cola = [me.id];
    while (cola.length) {
      var l = cola.shift();
      activos.forEach(function (m) { if (m.lider === l && r.indexOf(m.id) < 0) { r.push(m.id); if (m.rol === 'lider') cola.push(m.id); } });
    }
  }
  return r;
}

// ---------------- Lógica principal ----------------
function manejar(req) {
  var email = verificar(req.token);
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = libro();
    var M = leer(ss, 'miembros');
    var ahora = new Date();
    var stamp = ahora.getTime();
    var nombre = String(req.nombre || '').slice(0, 80);

    // Primera persona: queda como jefe
    if (!M.filas.length) {
      poner(M, { id: email, email: email, nombre: nombre || email.split('@')[0], rol: 'jefe', lider: '', estado: 'activo', cargo: '', creado: ahora.toISOString(), updatedAt: ahora.toISOString(), _srv: stamp });
      guardarNuevas(M);
      instalarActivador();
    }
    var me = M.fila[email];
    if (!me) {
      poner(M, { id: email, email: email, nombre: nombre || email.split('@')[0], rol: 'ingeniero', lider: '', estado: 'solicitud', cargo: '', creado: ahora.toISOString(), updatedAt: ahora.toISOString(), _srv: stamp });
      guardarNuevas(M);
      return { estado: 'solicitud', email: email };
    }
    if (me.estado === 'solicitud') return { estado: 'solicitud', email: email };
    if (me.estado !== 'activo') return { estado: 'inactivo', email: email };
    if (nombre && (!me.nombre || me.nombre === email.split('@')[0])) poner(M, { id: email, nombre: nombre, updatedAt: ahora.toISOString(), _srv: stamp });

    var cfg = leerConfig(ss);
    if (req.accion === 'config' && me.rol === 'jefe') { guardarConfig(ss, req.config || {}); cfg = leerConfig(ss); }

    var cambios = req.cambios || {};
    var correos = [];

    // --- Miembros: solo el jefe ---
    if (me.rol === 'jefe') {
      (cambios.miembros || []).forEach(function (m) {
        var id = String(m.id || m.email || '').toLowerCase().trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) return;
        var ex = M.fila[id];
        var o = { id: id, email: id, updatedAt: m.updatedAt || ahora.toISOString(), _srv: stamp };
        ['nombre', 'rol', 'lider', 'estado', 'cargo'].forEach(function (k) { if (m[k] !== undefined) o[k] = String(m[k]); });
        if (o.rol && ['jefe', 'lider', 'ingeniero'].indexOf(o.rol) < 0) delete o.rol;
        if (id === me.id) { delete o.rol; delete o.estado; } // el jefe no se quita a sí mismo
        if (!ex) { o.creado = ahora.toISOString(); o.rol = o.rol || 'ingeniero'; o.estado = o.estado || 'activo'; o.nombre = o.nombre || id.split('@')[0]; }
        poner(M, o);
      });
      guardarNuevas(M);
    }

    var V = visibles(me, M.filas);
    var puede = function (correo) { return V.indexOf(correo) >= 0; };

    // --- Tareas ---
    var T = leer(ss, 'tareas');
    (cambios.tareas || []).forEach(function (t) {
      if (!t || !t.id) return;
      var ex = T.fila[t.id];
      var destino = String(t.asignadoA || (ex && ex.asignadoA) || email).toLowerCase();
      var permitido = ex ? (puede(ex.asignadoA) || ex.creadoPor === email) && (destino === ex.asignadoA || puede(destino)) : puede(destino);
      if (!permitido) return;
      var o = { id: t.id, _srv: stamp };
      // Comentarios: se combinan (nadie pierde lo que escribió)
      var previos = ex ? parsear(ex.comentarios, []) : [];
      var nuevos = Array.isArray(t.comentarios) ? t.comentarios : parsear(t.comentarios, []);
      var vistos = {};
      o.comentarios = previos.concat(nuevos).filter(function (c) { var k = c.ts + '|' + c.autor; if (vistos[k]) return false; vistos[k] = 1; return true; })
        .sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
      var masNuevo = !ex || String(t.updatedAt || '') >= String(ex.updatedAt || '');
      if (masNuevo) {
        CAMPOS_TAREA.forEach(function (k) { if (t[k] !== undefined) o[k] = t[k]; });
        o.asignadoA = destino;
        o.updatedAt = t.updatedAt || ahora.toISOString();
      }
      if (!ex) { o.creadoPor = email; o.creado = t.creado || ahora.toISOString(); }
      // Solo quien la creó (o su jefe/líder) puede eliminarla
      if (ex && o.deleted && String(o.deleted) === 'true' && ex.creadoPor !== email && !(puede(ex.asignadoA) && ex.asignadoA !== email)) delete o.deleted;
      var asignacionNueva = masNuevo && destino !== email && (!ex || ex.asignadoA !== destino);
      if (asignacionNueva) { o.visto = ''; correos.push({ a: destino, titulo: t.titulo || (ex && ex.titulo), fecha: t.fecha || (ex && ex.fecha), prioridad: t.prioridad || (ex && ex.prioridad) }); }
      poner(T, o);
    });
    guardarNuevas(T);

    // --- Planes del día (cada uno el suyo) ---
    var P = leer(ss, 'planes');
    (cambios.planes || []).forEach(function (p) {
      if (!p || !p.fecha) return;
      var id = email + '|' + p.fecha;
      var ex = P.fila[id];
      if (ex && String(ex.updatedAt || '') > String(p.updatedAt || '')) return;
      var o = { id: id, email: email, fecha: p.fecha, _srv: stamp, updatedAt: p.updatedAt || ahora.toISOString() };
      ['enviado', 'cierre', 'comentario'].forEach(function (k) { if (p[k] !== undefined) o[k] = String(p[k]).slice(0, 4000); });
      if (!ex) o.creado = ahora.toISOString();
      poner(P, o);
    });
    guardarNuevas(P);

    // Avisos por correo de nuevas asignaciones
    if (cfg.correoAsignacion === 'si') avisarAsignaciones(correos, me, M);

    // --- Respuesta: lo que cambió desde el cursor y la persona puede ver ---
    var huella = V.slice().sort().join(',');
    var cursor = Number(req.cursor) || 0;
    if (req.huella !== huella) cursor = 0; // cambió su equipo: enviar todo de nuevo
    var limite = sumarDias(hoyLima(), -45);
    var tareas = T.filas.filter(function (t) {
      if (Number(t._srv) <= cursor) return false;
      if (!(puede(t.asignadoA) || t.creadoPor === email)) return false;
      if (cursor === 0 && (t.deleted === 'true' || (t.estado === 'hecho' && String(t.completado || t.updatedAt).slice(0, 10) < limite))) return false;
      return true;
    }).map(limpiar);
    var planes = P.filas.filter(function (p) { return Number(p._srv) > cursor && puede(p.email) && (cursor > 0 || p.fecha >= limite); }).map(limpiar);
    var miembros = M.filas.filter(function (m) { return me.rol === 'jefe' || m.estado === 'activo'; }).map(limpiar);

    return {
      estado: 'activo', email: email, rol: me.rol, nombre: (M.fila[email] || me).nombre,
      cursor: new Date().getTime(), huella: huella, completo: cursor === 0,
      config: cfg, miembros: miembros, tareas: tareas, planes: planes,
      libroUrl: me.rol === 'jefe' ? ss.getUrl() : '',
    };
  } finally {
    lock.releaseLock();
  }
}

function limpiar(o) { var r = {}; for (var k in o) if (k !== '_fila') r[k] = o[k]; return r; }
function parsear(s, defecto) { if (!s) return defecto; if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch (e) { return defecto; } }

// ---------------- Correos ----------------
function quedanCorreos(min) { try { return MailApp.getRemainingDailyQuota() > (min || 5); } catch (e) { return false; } }

function avisarAsignaciones(lista, me, M) {
  lista.forEach(function (x) {
    if (!quedanCorreos(15)) return;
    var dest = M.fila[x.a];
    if (!dest) return;
    var cuerpo = 'Hola ' + (dest.nombre || '').split(' ')[0] + ',\n\n' + (me.nombre || me.email) + ' te asignó un pendiente en Control:\n\n'
      + '• ' + x.titulo + (x.fecha ? '\n  Fecha: ' + x.fecha : '') + (x.prioridad ? '\n  Prioridad: ' + x.prioridad : '')
      + '\n\nÁbrelo aquí: ' + URL_APP + '#/midia\n';
    MailApp.sendEmail({ to: x.a, subject: 'Nuevo pendiente: ' + x.titulo, body: cuerpo, name: 'Control' });
  });
}

// ---------------- Recordatorio diario (activador cada hora) ----------------
function instalarActivador() {
  var hay = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'cadaHora'; });
  if (!hay) ScriptApp.newTrigger('cadaHora').timeBased().everyHours(1).create();
}

function cadaHora() {
  var ss = libro();
  var cfg = leerConfig(ss);
  var ahora = new Date();
  var hora = Number(Utilities.formatDate(ahora, TZ, 'H'));
  var dia = Number(Utilities.formatDate(ahora, TZ, 'u')) % 7; // 1=lunes … 0=domingo
  var props = PropertiesService.getScriptProperties();
  if (hora === 3) archivar(ss);
  if (hora !== Number(cfg.horaPlan || 9)) return;
  if (String(cfg.dias || '').split(',').map(Number).indexOf(dia) < 0) return;
  var hoy = hoyLima();
  if (props.getProperty('AVISO_' + hoy)) return;
  props.setProperty('AVISO_' + hoy, '1');
  recordatorio(ss, cfg, hoy);
}

/** Estado del día de cada persona (para el correo de las 9:00). */
function estadoDia(T, P, email, hoy) {
  var suyas = T.filas.filter(function (t) { return t.asignadoA === email && t.deleted !== 'true'; });
  var propiasHoy = suyas.filter(function (t) { return t.creadoPor === email && t.fecha === hoy && fechaLima(t.creado) === hoy; });
  var plan = P.fila[email + '|' + hoy];
  var horas = propiasHoy.map(function (t) { return t.creado; });
  if (plan && plan.enviado) horas.push(plan.enviado);
  horas.sort();
  return {
    plan: horas.length ? horaLima(horas[0]) : '',
    bloqueados: suyas.filter(function (t) { return t.estado === 'bloqueado'; }).length,
    vencidos: suyas.filter(function (t) { return t.estado !== 'hecho' && t.fecha && t.fecha < hoy; }).length,
  };
}

function recordatorio(ss, cfg, hoy) {
  var M = leer(ss, 'miembros'), T = leer(ss, 'tareas'), P = leer(ss, 'planes');
  var activos = M.filas.filter(function (m) { return m.estado === 'activo'; });
  var estados = {};
  activos.forEach(function (m) { estados[m.id] = estadoDia(T, P, m.id, hoy); });
  if (cfg.correoRecordatorio === 'si') {
    activos.forEach(function (m) {
      if (m.rol === 'jefe' || estados[m.id].plan || !quedanCorreos(10)) return;
      MailApp.sendEmail({
        to: m.id, name: 'Control', subject: 'Carga tu plan del día en Control',
        body: 'Buenos días ' + (m.nombre || '').split(' ')[0] + ',\n\nAún no registras tus pendientes de hoy. Tómate 2 minutos y cárgalos aquí:\n' + URL_APP + '#/midia\n\nGracias.',
      });
    });
  }
  if (cfg.correoResumen === 'si') {
    activos.filter(function (m) { return m.rol === 'jefe' || m.rol === 'lider'; }).forEach(function (l) {
      var equipo = visibles(l, M.filas).filter(function (e) { return e !== l.id; });
      if (!equipo.length || !quedanCorreos(5)) return;
      var sin = [], bloq = [], venc = [];
      equipo.forEach(function (e) {
        var m = M.fila[e], s = estados[e] || { plan: '' };
        if (!s.plan) sin.push(m.nombre || e);
        if (s.bloqueados) bloq.push((m.nombre || e) + ' (' + s.bloqueados + ')');
        if (s.vencidos) venc.push((m.nombre || e) + ' (' + s.vencidos + ')');
      });
      var cuerpo = 'Resumen de las ' + cfg.horaPlan + ':00 — ' + hoy + '\n\n'
        + 'Con plan: ' + (equipo.length - sin.length) + ' de ' + equipo.length + '\n'
        + (sin.length ? '\nSin plan del día:\n• ' + sin.join('\n• ') + '\n' : '')
        + (bloq.length ? '\nCon bloqueos:\n• ' + bloq.join('\n• ') + '\n' : '')
        + (venc.length ? '\nCon pendientes vencidos:\n• ' + venc.join('\n• ') + '\n' : '')
        + '\nVer el panel: ' + URL_APP + '#/panel\n';
      MailApp.sendEmail({ to: l.id, name: 'Control', subject: 'Equipo hoy: ' + (equipo.length - sin.length) + '/' + equipo.length + ' con plan', body: cuerpo });
    });
  }
}

/** Pasa a "Archivo" las tareas hechas hace más de 60 días (la hoja principal queda liviana). */
function archivar(ss) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var T = leer(ss, 'tareas');
    var limite = sumarDias(hoyLima(), -60);
    var viejas = [], quedan = [];
    T.filas.forEach(function (t) {
      var fin = String(t.completado || t.updatedAt || '').slice(0, 10);
      ((t.estado === 'hecho' || t.deleted === 'true') && fin && fin < limite ? viejas : quedan).push(t);
    });
    if (!viejas.length) return;
    var A = leer(ss, 'archivo');
    viejas.forEach(function (t) { A.nuevas.push(t); });
    guardarNuevas(A);
    T.h.getRange(2, 1, Math.max(T.h.getLastRow() - 1, 1), T.cols.length).clearContent();
    if (quedan.length) T.h.getRange(2, 1, quedan.length, T.cols.length).setValues(quedan.map(function (o) { return aFila(T, o); }));
  } finally { lock.releaseLock(); }
}
