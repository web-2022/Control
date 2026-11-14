// ============================================================
// caja-parser.js — Entiende frases de dinero en español.
//   "almuerzo 25"                    -> gasto S/ 25, Alimentación, hoy
//   "netflix 15 dólares"             -> gasto US$ 15, Suscripciones
//   "ayer taxi 18.50 con yape"       -> gasto S/ 18.50, Transporte, ayer, cuenta Yape / Plin
//   "sueldo 8,500 ingreso"           -> ingreso S/ 8500, Sueldo
//   "cobré 1200 dólares consultoría" -> ingreso US$ 1200, Consultoría
// Función pura: se prueba con Node.
// ============================================================
import { normMismaLongitud, ymd, capitalizar } from './util.js';
import { parsear } from './parser.js';
import { detectarCategoria } from './caja-catalogo.js';

const PALABRAS_INGRESO = /\b(ingreso|ingresos|cobre|cobro|cobrar|recibi|recibo|me pagaron|me pago|me depositaron|deposito a mi favor|sueldo|salario|quincena|honorarios|gratificacion|cts|bono|dividendo|reembolso|devolucion|vendi|venta)\b/;
const VERBOS_INICIO = /^(gaste|gasto|pague|pago|compre|compra|ingreso|cobre|recibi|me pagaron|me depositaron|me pago|transferi|pase|movi|retire|saque|abone)\s+/;

/** Convierte "1,234.50", "1.234,50", "45,5", "2 mil" a número. */
export function aNumero(txt, mil = false) {
  let s = String(txt).trim();
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    const dec = coma > punto ? ',' : '.';
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.');
  } else if (coma >= 0) {
    s = /,\d{3}$/.test(s) && !/,\d{3},?\d{0,2}$/.test(s.slice(0, -4)) ? s.replace(/,/g, '') : s.replace(',', '.');
    if ((s.match(/,/g) || []).length) s = s.replace(/,/g, '');
  } else if (punto >= 0) {
    if (/\.\d{3}$/.test(s) && (s.match(/\./g) || []).length >= 1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round((mil ? n * 1000 : n) * 100) / 100 : null;
}

/**
 * @param {string} texto
 * @param {object} ctx { now, cuentas: [nombres], categoriasExtra }
 */
export function parsearMovimiento(texto, ctx = {}) {
  const now = ctx.now || new Date();
  let orig = ' ' + (texto || '').replace(/\s+/g, ' ').trim() + ' ';
  let n = normMismaLongitud(orig);
  const quitar = (m) => {
    const b = ' '.repeat(m[0].length);
    orig = orig.slice(0, m.index) + b + orig.slice(m.index + m[0].length);
    n = n.slice(0, m.index) + b + n.slice(m.index + m[0].length);
  };
  const r = { tipo: 'gasto', monto: null, moneda: 'PEN', categoria: '', cuenta: '', destino: '', fecha: ymd(now), descripcion: '' };

  // Tipo
  if (PALABRAS_INGRESO.test(n)) r.tipo = 'ingreso';
  if (/\b(gaste|gasto|pague|compre)\b/.test(n)) r.tipo = 'gasto';
  const mTipo = /\s(ingreso|gasto)\b(?=\s*$)/.exec(n) || /^\s(ingreso|gasto)\s/.exec(n);
  if (mTipo) { r.tipo = mTipo[1]; quitar(mTipo); }

  // Monto + moneda (con símbolo antes o palabra después)
  const NUM = '(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const patrones = [
    { re: new RegExp(`(us\\$|\\$|usd)\\s*${NUM}(\\s*mil\\b)?`), mon: 'USD', g: 2, gm: 3 },
    { re: new RegExp(`(s\\/\\.?|pen)\\s*${NUM}(\\s*mil\\b)?`), mon: 'PEN', g: 2, gm: 3 },
    { re: new RegExp(`${NUM}(\\s*mil)?\\s*(dolares|dolar|usd|\\$)(?=[\\s,.;]|$)`), mon: 'USD', g: 1, gm: 2 },
    { re: new RegExp(`${NUM}(\\s*mil)?\\s*(soles|sol|lucas|luca|pen)(?=[\\s,.;]|$)`), mon: 'PEN', g: 1, gm: 2 },
  ];
  for (const p of patrones) {
    const m = p.re.exec(n);
    if (m) { r.monto = aNumero(m[p.g], !!m[p.gm]); r.moneda = p.mon; quitar(m); break; }
  }
  if (r.monto === null) {
    // Primer número suelto que no sea fecha (15/11), hora (10:30, 3pm) ni "el 18"
    const re = new RegExp(`(?<![\\d/:])(?<!\\bel\\s)(?<!\\bdia\\s)${NUM}(\\s*mil\\b)?(?![\\d/:]|\\s*(?:am|pm|a\\.\\s?m|p\\.\\s?m|hrs?|horas|de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)))`);
    const m = re.exec(n);
    if (m) { r.monto = aNumero(m[1], !!m[2]); quitar(m); }
  }
  // Palabras de moneda sueltas
  const mMon = /\s(en\s+)?(dolares|dolar)\b/.exec(n);
  if (mMon) { r.moneda = 'USD'; quitar(mMon); }
  const mSol = /\s(en\s+)?(soles)\b/.exec(n);
  if (mSol) quitar(mSol);

  // ---- Pago de deuda y transferencia entre cuentas ----
  const detalle = ctx.detalle || [];
  const esDeudaT = (t) => t === 'tarjeta' || t === 'prestamo';
  const menciones = detalle.map((c) => {
    const k = normMismaLongitud(c.nombre).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const m = new RegExp(`(?:^|\\s)(?:(desde|de|del|con|en|a|al|hacia|para)\\s+(?:la\\s+|el\\s+|mi\\s+)?)?(${k})\\b`).exec(n);
    return m ? { c, m, pos: m.index, fin: m.index + m[0].length } : null;
  }).filter(Boolean)
    .sort((a, b) => b.c.nombre.length - a.c.nombre.length)
    .filter((x, i, arr) => !arr.slice(0, i).some((y) => x.pos < y.fin && y.pos < x.fin)) // "BCP" dentro de "Visa BCP" no cuenta
    .sort((a, b) => a.pos - b.pos);
  const verboPago = /\b(pague|pago|abone|abono|amortice|cancele)\b/.test(n);
  const esTransfer = /\b(transferi|transfiero|transferencia|pase|paso|movi|retire|saque|deposite)\b/.test(n) && !verboPago;
  const deudaMencionada = menciones.find((x) => esDeudaT(x.c.tipo));
  const esPago = !esTransfer && (/\b(cuota|letra|amortice|amortizacion)\b/.test(n)
    || (verboPago && (deudaMencionada || /\b(tarjeta|prestamo|deuda|hipoteca|credito)\b/.test(n))));
  if (esPago || esTransfer) {
    const liquidas = menciones.filter((x) => x.c.tipo === 'liquida');
    if (esPago) {
      r.tipo = 'pago';
      r.destino = deudaMencionada?.c.nombre
        || (/\btarjeta\b/.test(n) ? detalle.find((c) => c.tipo === 'tarjeta')?.nombre : detalle.find((c) => c.tipo === 'prestamo')?.nombre) || '';
      r.cuenta = liquidas[0]?.c.nombre || '';
      r.categoria = 'Pago de deuda';
      for (const x of liquidas.slice(0, 1)) quitar(x.m);
    } else {
      r.tipo = 'transferencia';
      const conDestino = liquidas.find((x) => /^(a|al|hacia|para|en)$/.test(x.m[1] || ''));
      const conOrigen = liquidas.find((x) => /^(desde|de|del)$/.test(x.m[1] || '') && x !== conDestino);
      let origen = conOrigen || liquidas.find((x) => x !== conDestino);
      let destino = conDestino || liquidas.find((x) => x !== origen);
      const efectivo = detalle.find((c) => c.tipo === 'liquida' && /efectivo/.test(normMismaLongitud(c.nombre)));
      if (/\b(retire|saque)\b/.test(n) && !destino && efectivo) destino = { c: efectivo };
      r.cuenta = origen?.c.nombre || '';
      r.destino = destino?.c.nombre || '';
      r.categoria = 'Transferencia';
      for (const x of [origen, destino]) if (x?.m) quitar(x.m);
    }
  }

  // Cuenta / medio de pago
  const cuentas = ctx.cuentas || detalle.map((c) => c.nombre);
  const medios = [
    [/\s(?:con|por|via|desde|en)?\s*(yape|plin)\b/, 'Yape / Plin'],
    [/\s(?:con|en)?\s*(?:la\s+)?(tarjeta(?:\s+de\s+credito)?|credito)\b/, 'Tarjeta de crédito'],
    [/\s(?:en|con)?\s*(efectivo|cash)\b/, 'Efectivo'],
  ];
  if (!r.cuenta && r.tipo !== 'pago' && r.tipo !== 'transferencia') for (const c of [...cuentas].sort((a, b) => b.length - a.length)) {
    const k = normMismaLongitud(c).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const m = new RegExp(`\\s(?:con|en|de|desde|por)?\\s*${k}\\b`).exec(n);
    if (m) { r.cuenta = c; quitar(m); break; }
  }
  if (!r.cuenta && r.tipo !== 'pago' && r.tipo !== 'transferencia') {
    for (const [re, nombre] of medios) {
      const m = re.exec(n);
      if (m) { r.cuenta = (detalle.find((c) => normMismaLongitud(c.nombre) === normMismaLongitud(nombre)) || detalle.find((c) => nombre === 'Tarjeta de crédito' && c.tipo === 'tarjeta'))?.nombre || nombre; quitar(m); break; }
    }
  }

  // Categoría (sobre el texto completo, antes de limpiar)
  if (r.tipo === 'gasto' || r.tipo === 'ingreso') r.categoria = detectarCategoria(texto, r.tipo, ctx.categoriasExtra || []);

  // Fecha y descripción: reutiliza el intérprete de pendientes
  const resto = orig.replace(/\s+/g, ' ').trim();
  const p = parsear(resto, { now });
  if (p.fecha) r.fecha = p.fecha;
  let desc = (p.titulo || '').trim();
  let dn = normMismaLongitud(desc);
  const mv = VERBOS_INICIO.exec(dn);
  if (mv) { desc = desc.slice(mv[0].length); dn = dn.slice(mv[0].length); }
  desc = desc.replace(/^(en|de|por|el|la|los|las|un|una)\s+/i, '').replace(/\s+(en|de|por|con)$/i, '').trim();
  if (r.tipo === 'transferencia') desc = `Transferencia ${r.cuenta || '?'} → ${r.destino || '?'}`;
  if (r.tipo === 'pago' && /^(tarjeta|la tarjeta|cuota|letra|deuda|prestamo|préstamo|)$/i.test(desc.trim())) desc = `Pago ${r.destino}`;
  r.descripcion = capitalizar(desc) || (r.tipo === 'pago' ? `Pago ${r.destino}` : r.categoria);
  return r;
}
