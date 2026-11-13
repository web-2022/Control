/**
 * ============================================================
 *  CONTROL — Backend en Google Apps Script
 *  Usa tu Google Sheet como base de datos de la app "Control".
 * ============================================================
 *
 *  INSTALACIÓN (resumen; detalle en README.md):
 *   1. Crea un Google Sheet vacío → Extensiones → Apps Script.
 *   2. Borra el contenido y pega TODO este archivo. Guarda.
 *   3. Ejecuta la función  configurarInicial  (menú ▶ Ejecutar) y acepta permisos.
 *      En "Registro de ejecución" verás tu TOKEN. Cópialo.
 *   4. Implementar → Nueva implementación → Tipo: Aplicación web
 *        Ejecutar como: Yo   |   Quién tiene acceso: Cualquier usuario
 *      Copia la URL que termina en /exec.
 *   5. En la app: Ajustes → pega URL y TOKEN → Probar conexión.
 *
 *  OPCIONAL: ejecuta  activarResumenDiario  para recibir cada día a las 7:00
 *  un correo con tus pendientes vencidos, los de hoy y tus reuniones.
 * ============================================================
 */

// Tabla de la app -> nombre de la hoja
var HOJAS = {
  pendientes: 'Pendientes',
  reuniones: 'Reuniones',
  acuerdos: 'Acuerdos',
  personas: 'Personas',
  proyectos: 'Proyectos',
  diario: 'Diario',
  movimientos: 'Caja'
};
// Columnas que van primero (el resto se agrega solo cuando aparece un campo nuevo)
var COLUMNAS_BASE = {
  pendientes: ['id', 'titulo', 'estado', 'prioridad', 'fecha', 'hora', 'responsable', 'proyectoId', 'disciplina', 'fase', 'origen', 'solicitante', 'descripcion', 'notas', 'comentarios', 'inbox', 'reunionId', 'creado', 'cerrado', 'historial', 'deleted', 'updatedAt', '_srv'],
  reuniones: ['id', 'titulo', 'fecha', 'hora', 'duracion', 'proyectoId', 'participantes', 'objetivo', 'minuta', 'estado', 'enlace', 'creado', 'deleted', 'updatedAt', '_srv'],
  acuerdos: ['id', 'reunionId', 'texto', 'responsable', 'fecha', 'pendienteId', 'creado', 'deleted', 'updatedAt', '_srv'],
  personas: ['id', 'nombre', 'rol', 'disciplina', 'email', 'telefono', 'empresa', 'creado', 'deleted', 'updatedAt', '_srv'],
  proyectos: ['id', 'nombre', 'codigo', 'cliente', 'fase', 'color', 'avance', 'disciplinas', 'hitos', 'descripcion', 'activo', 'creado', 'deleted', 'updatedAt', '_srv'],
  diario: ['id', 'fecha', 'comentario', 'hechos', 'avances', 'movidos', 'quedaron', 'pendientesAbiertos', 'cerradoA', 'creado', 'deleted', 'updatedAt', '_srv'],
  movimientos: ['id', 'fecha', 'tipo', 'monto', 'moneda', 'categoria', 'descripcion', 'cuenta', 'nota', 'creado', 'deleted', 'updatedAt', '_srv']
};

// ------------------------------------------------------------
// Punto de entrada web
// ------------------------------------------------------------
function doGet() {
  return ContentService.createTextOutput('Control API activa ✔ (usa POST desde la app)');
}

function doPost(e) {
  var salida;
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token) throw new Error('El servidor no tiene TOKEN. Ejecuta configurarInicial en Apps Script.');
    if (req.token !== token) throw new Error('Token incorrecto');

    if (req.accion === 'ping') {
      salida = { ok: true, mensaje: 'Conexión correcta', hoja: SpreadsheetApp.getActive().getName(), horaServidor: ahoraIso() };
    } else if (req.accion === 'subir') {
      salida = subir(req.datos || {});
    } else if (req.accion === 'bajar') {
      salida = bajar(req.desde || '');
    } else {
      throw new Error('Acción desconocida: ' + req.accion);
    }
  } catch (err) {
    salida = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
// Subir: inserta o actualiza registros por id
// ------------------------------------------------------------
function subir(datos) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var srv = ahoraIso();
    var total = 0;
    Object.keys(datos).forEach(function (tabla) {
      if (!HOJAS[tabla]) return;
      var registros = datos[tabla] || [];
      if (!registros.length) return;
      var hoja = obtenerHoja(tabla);
      var encabezados = leerEncabezados(hoja);

      // Agregar columnas nuevas si algún registro trae campos no vistos
      registros.forEach(function (r) {
        Object.keys(r).forEach(function (k) {
          if (encabezados.indexOf(k) < 0) {
            encabezados.push(k);
            hoja.getRange(1, encabezados.length).setValue(k).setFontWeight('bold');
          }
        });
        if (encabezados.indexOf('_srv') < 0) {
          encabezados.push('_srv');
          hoja.getRange(1, encabezados.length).setValue('_srv').setFontWeight('bold');
        }
      });

      // Índice id -> fila (y su updatedAt, para no pisar datos más nuevos)
      var ultima = hoja.getLastRow();
      var iUpd = encabezados.indexOf('updatedAt');
      var existentes = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, encabezados.length).getValues() : [];
      var filaDe = {}, updDe = {};
      for (var i = 0; i < existentes.length; i++) {
        filaDe[String(existentes[i][0])] = i + 2;
        if (iUpd >= 0) updDe[String(existentes[i][0])] = String(existentes[i][iUpd] || '');
      }

      var nuevas = [];
      registros.forEach(function (r) {
        // Gana el cambio más reciente: si el servidor ya tiene una versión más nueva, se ignora
        if (filaDe[String(r.id)] && updDe[String(r.id)] && updDe[String(r.id)] > String(r.updatedAt || '')) return;
        r._srv = srv;
        var fila = encabezados.map(function (k) { return aCelda(r[k]); });
        var n = filaDe[String(r.id)];
        if (n) {
          var rango = hoja.getRange(n, 1, 1, fila.length);
          rango.setNumberFormat('@').setValues([fila]);
        } else {
          nuevas.push(fila);
        }
        total++;
      });
      if (nuevas.length) {
        var inicio = hoja.getLastRow() + 1;
        var rango = hoja.getRange(inicio, 1, nuevas.length, encabezados.length);
        rango.setNumberFormat('@').setValues(nuevas);
      }
    });
    return { ok: true, guardados: total, horaServidor: srv };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// Bajar: devuelve lo que cambió en el servidor desde "desde"
// ------------------------------------------------------------
function bajar(desde) {
  var hora = ahoraIso();
  var res = {};
  Object.keys(HOJAS).forEach(function (tabla) {
    var hoja = obtenerHoja(tabla);
    var ultima = hoja.getLastRow();
    if (ultima < 2) { res[tabla] = []; return; }
    var valores = hoja.getRange(1, 1, ultima, hoja.getLastColumn()).getValues();
    var enc = valores[0].map(String);
    var iSrv = enc.indexOf('_srv');
    var lista = [];
    for (var f = 1; f < valores.length; f++) {
      var fila = valores[f];
      if (!fila[0]) continue;
      if (desde && iSrv >= 0 && String(fila[iSrv]) <= desde) continue;
      var r = {};
      for (var c = 0; c < enc.length; c++) {
        if (!enc[c]) continue;
        var v = deCelda(fila[c]);
        if (v !== '') r[enc[c]] = v;
      }
      lista.push(r);
    }
    res[tabla] = lista;
  });
  return { ok: true, datos: res, horaServidor: hora };
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function obtenerHoja(tabla) {
  var ss = SpreadsheetApp.getActive();
  var nombre = HOJAS[tabla];
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    var cols = COLUMNAS_BASE[tabla];
    hoja.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    // Formato texto para que Sheets no convierta fechas/horas
    hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).setNumberFormat('@');
  }
  return hoja;
}

function leerEncabezados(hoja) {
  var n = hoja.getLastColumn();
  if (n < 1) return [];
  return hoja.getRange(1, 1, 1, n).getValues()[0].map(String);
}

// Valor JS -> celda (objetos y listas como JSON)
function aCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Celda -> valor JS
function deCelda(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof v !== 'string') return v;
  var s = v.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if ((s.charAt(0) === '[' && s.slice(-1) === ']') || (s.charAt(0) === '{' && s.slice(-1) === '}')) {
    try { return JSON.parse(s); } catch (e) { return s; }
  }
  return v;
}

function ahoraIso() { return new Date().toISOString(); }

// ------------------------------------------------------------
// Funciones que ejecutas TÚ desde el editor de Apps Script
// ------------------------------------------------------------

/** Crea las hojas y genera el token secreto. Ejecútala una vez. */
function configurarInicial() {
  Object.keys(HOJAS).forEach(obtenerHoja);
  var ss = SpreadsheetApp.getActive();
  var cfg = ss.getSheetByName('Config');
  if (!cfg) {
    cfg = ss.insertSheet('Config');
    cfg.getRange('A1:B1').setValues([['clave', 'valor']]).setFontWeight('bold');
    cfg.getRange('A2:B2').setValues([['EMAIL_RESUMEN', Session.getEffectiveUser().getEmail()]]);
    cfg.getRange('A3:B3').setValues([['NOTA', 'El token está en Apps Script → Configuración del proyecto → Propiedades del script']]);
  }
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1 && hoja1.getLastRow() === 0) ss.deleteSheet(hoja1);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('✔ Hojas listas.');
  Logger.log('TU TOKEN (cópialo en Ajustes de la app):  ' + token);
  Logger.log('Ahora: Implementar → Nueva implementación → Aplicación web.');
}

/** Genera un token nuevo (si crees que el anterior se filtró). */
function cambiarToken() {
  var token = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('NUEVO TOKEN: ' + token + '  (actualízalo en la app)');
}

/** Activa el correo diario a las 7:00 (zona horaria del proyecto). */
function activarResumenDiario() {
  desactivarResumenDiario();
  ScriptApp.newTrigger('resumenDiario').timeBased().everyDays(1).atHour(7).create();
  Logger.log('✔ Resumen diario activado (7:00, zona ' + Session.getScriptTimeZone() + ')');
}

function desactivarResumenDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'resumenDiario') ScriptApp.deleteTrigger(t);
  });
}

/** Envía el correo con vencidos, pendientes de hoy y reuniones de hoy. */
function resumenDiario() {
  var tz = Session.getScriptTimeZone();
  var hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var datos = bajar('').datos;
  var personas = {};
  (datos.personas || []).forEach(function (p) { if (!p.deleted) personas[p.id] = p.nombre; });
  var proyectos = {};
  (datos.proyectos || []).forEach(function (p) { if (!p.deleted) proyectos[p.id] = p.nombre; });

  var abiertos = (datos.pendientes || []).filter(function (p) {
    return !p.deleted && p.estado !== 'Hecho' && p.estado !== 'Cancelado';
  });
  var vencidos = abiertos.filter(function (p) { return p.fecha && String(p.fecha) < hoy; });
  var deHoy = abiertos.filter(function (p) { return String(p.fecha) === hoy; });
  var reuniones = (datos.reuniones || []).filter(function (r) { return !r.deleted && String(r.fecha) === hoy; })
    .sort(function (a, b) { return String(a.hora).localeCompare(String(b.hora)); });

  var linea = function (p) {
    var extra = [];
    if (p.hora) extra.push(p.hora);
    extra.push(p.responsable ? (personas[p.responsable] || p.responsable) : 'Yo');
    if (p.proyectoId && proyectos[p.proyectoId]) extra.push(proyectos[p.proyectoId]);
    if (p.fecha && String(p.fecha) < hoy) extra.push('venció ' + p.fecha);
    return '<li><b>' + html(p.titulo) + '</b> <span style="color:#666">— ' + html(extra.join(' · ')) + '</span></li>';
  };
  var cuerpo = '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    '<h2 style="margin:0 0 8px">Control — ' + hoy + '</h2>' +
    '<h3 style="color:#c0392b">Vencidos (' + vencidos.length + ')</h3><ul>' + vencidos.map(linea).join('') + '</ul>' +
    '<h3 style="color:#d68910">Para hoy (' + deHoy.length + ')</h3><ul>' + deHoy.map(linea).join('') + '</ul>' +
    '<h3>Reuniones de hoy (' + reuniones.length + ')</h3><ul>' +
    reuniones.map(function (r) { return '<li><b>' + html(r.hora || '') + '</b> ' + html(r.titulo) + '</li>'; }).join('') + '</ul></div>';

  if (!vencidos.length && !deHoy.length && !reuniones.length) return; // nada que avisar
  var cfg = SpreadsheetApp.getActive().getSheetByName('Config');
  var email = Session.getEffectiveUser().getEmail();
  if (cfg) {
    var filas = cfg.getDataRange().getValues();
    filas.forEach(function (f) { if (f[0] === 'EMAIL_RESUMEN' && f[1]) email = f[1]; });
  }
  MailApp.sendEmail({
    to: email,
    subject: 'Control: ' + vencidos.length + ' vencidos, ' + deHoy.length + ' para hoy, ' + reuniones.length + ' reuniones',
    htmlBody: cuerpo
  });
}

function html(s) {
  return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
