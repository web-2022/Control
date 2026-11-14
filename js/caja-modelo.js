// ============================================================
// caja-modelo.js — Cuentas, deudas y compromisos del mes.
//
// Tipos de cuenta (tabla "cuentas"):
//   liquida  → efectivo, cuentas de banco, Yape: lo que TIENES
//   tarjeta  → tarjeta de crédito: lo que DEBES (sube con compras)
//   prestamo → préstamos / hipoteca: lo que DEBES (baja con pagos)
//   fijo     → gasto fijo mensual (alquiler, pensión, Netflix…)
//   ingreso  → ingreso mensual esperado (sueldo, clases, alquiler que cobras…)
// Cuentas y tarjetas pueden tener "banco" para agruparlas (BCP, Interbank…).
//
// Tipos de movimiento (tabla "movimientos"):
//   ingreso, gasto           → afectan el resultado del mes
//   pago   (cuenta → destino deuda) → baja tu efectivo y baja la deuda
//   transferencia (cuenta → destino) → mueve plata entre tus cuentas
//
// Saldo de una cuenta = saldo que registraste en una fecha + los
// movimientos posteriores. Al "actualizar saldo" (p. ej. el nuevo
// saldo de la deuda que te da el banco) se vuelve a contar desde ahí.
// ============================================================
import * as store from './store.js';
import { hoy, norm, pad } from './util.js';

export const TIPOS_CUENTA = {
  liquida: { nombre: 'Cuenta / efectivo', icono: '💵', grupo: 'Mis cuentas' },
  tarjeta: { nombre: 'Tarjeta de crédito', icono: '💳', grupo: 'Mis deudas' },
  prestamo: { nombre: 'Préstamo / deuda', icono: '🏦', grupo: 'Mis deudas' },
  fijo: { nombre: 'Gasto fijo mensual', icono: '📌', grupo: 'Gastos fijos' },
  ingreso: { nombre: 'Ingreso mensual', icono: '💰', grupo: 'Ingresos del mes' },
};
export const esDeuda = (c) => c && (c.tipo === 'tarjeta' || c.tipo === 'prestamo');

export const cuentas = () => store.todos('cuentas').filter((c) => c.activo !== false)
  .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre));
export const deTipo = (...tipos) => cuentas().filter((c) => tipos.includes(c.tipo));
export const buscarCuenta = (nombre) => (nombre ? cuentas().find((c) => norm(c.nombre) === norm(nombre)) || null : null);
/** Bancos registrados, en el orden de sus cuentas. */
export const bancos = () => [...new Set(cuentas().map((c) => (c.banco || '').trim()).filter(Boolean))];

/**
 * Otras formas de nombrar una cuenta al escribir: "BCP" → la primera cuenta
 * del BCP; "visa BCP", "tarjeta BCP" → la tarjeta del BCP.
 */
export function aliasCuenta(c, lista = cuentas()) {
  const b = (c.banco || '').trim();
  if (!b) return [];
  const delBanco = lista.filter((x) => norm(x.banco) === norm(b));
  if (c.tipo === 'liquida') {
    const primera = delBanco.find((x) => x.tipo === 'liquida') === c;
    return primera ? [b, `cuenta ${b}`, `cuenta del ${b}`, `ahorros ${b}`] : [];
  }
  if (c.tipo === 'tarjeta' && delBanco.find((x) => x.tipo === 'tarjeta') === c) {
    return [`tarjeta ${b}`, `tarjeta del ${b}`, `tarjeta de credito ${b}`, `tarjeta de credito del ${b}`, `visa ${b}`, `mastercard ${b}`, `amex ${b}`, `${b} visa`, `credito ${b}`];
  }
  return [];
}
/** Datos para el intérprete de frases. */
export function detalleParaParser() {
  const l = cuentas();
  return l.filter((c) => c.tipo !== 'fijo' && c.tipo !== 'ingreso').map((c) => ({ nombre: c.nombre, tipo: c.tipo, alias: aliasCuenta(c, l) }));
}

/** Nombres de cuentas para selects (incluye las antiguas guardadas solo como texto). */
export function nombresCuentas(tipos = ['liquida', 'tarjeta']) {
  const regs = deTipo(...tipos).map((c) => c.nombre);
  return regs;
}

const movimientos = () => store.todos('movimientos');
/** ¿El movimiento ocurrió después del último saldo registrado de la cuenta? */
function posterior(m, c) {
  if (!c.fechaSaldo) return true;
  if (m.fecha > c.fechaSaldo) return true;
  return m.fecha === c.fechaSaldo && (m.creado || '') > (c.saldoEn || '');
}

/** Saldo actual de una cuenta (en su moneda). Para deudas: lo que debes. */
export function saldo(c, tc = 0) {
  let s = Number(c.saldoInicial) || 0;
  const n = norm(c.nombre);
  c = { ...c, moneda: c.moneda || 'PEN' };
  for (const m of movimientos()) {
    if (!posterior(m, c)) continue;
    const monto = Number(m.monto) || 0;
    const origen = norm(m.cuenta) === n, destino = norm(m.destino) === n;
    if (!origen && !destino) continue;
    if (c.tipo === 'liquida') {
      if (origen) {
        if (m.tipo === 'ingreso') s += conv(monto, m.moneda, c.moneda, tc);
        else s -= conv(monto, m.moneda, c.moneda, tc); // gasto, pago, transferencia
      }
      if (destino && m.tipo === 'transferencia') s += m.montoDestino ? Number(m.montoDestino) : conv(monto, m.moneda, c.moneda, tc);
    } else if (esDeuda(c)) {
      if (origen && m.tipo === 'gasto') s += conv(monto, m.moneda, c.moneda, tc); // compra con tarjeta
      if (destino && (m.tipo === 'pago' || m.tipo === 'transferencia')) s -= conv(monto, m.moneda, c.moneda, tc);
    }
  }
  return Math.round(s * 100) / 100;
}
/** Convierte entre monedas con el tipo de cambio (si falta, no convierte). */
function conv(monto, de, a, tc) {
  if (!a || (de || 'PEN') === a) return monto;
  if (!tc) return 0; // sin tipo de cambio no se mezcla dólares con soles
  return de === 'USD' ? monto * tc : monto / tc;
}
export const enSoles = (monto, moneda, tc) => (moneda === 'USD' ? (tc ? monto * tc : null) : monto);

/** Suma por moneda y total en soles (si hay tipo de cambio). */
function totalizar(lista, tc) {
  const r = { PEN: 0, USD: 0, totalPEN: 0, faltaTC: false };
  for (const { monto, moneda } of lista) {
    r[moneda] = (r[moneda] || 0) + monto;
    const s = enSoles(monto, moneda, tc);
    if (s === null) r.faltaTC = true; else r.totalPEN += s;
  }
  return r;
}

export function efectivoDisponible(tc = 0) {
  return totalizar(deTipo('liquida').map((c) => ({ monto: saldo(c, tc), moneda: c.moneda || 'PEN' })), tc);
}
export function totalDeudas(tc = 0) {
  return totalizar(deTipo('tarjeta', 'prestamo').map((c) => ({ monto: Math.max(0, saldo(c, tc)), moneda: c.moneda || 'PEN' })), tc);
}

/** Fecha de pago de un compromiso en el mes 'AAAA-MM' (ajusta días 29–31). */
function fechaEnMes(mes, dia) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${mes}-${pad(Math.min(Math.max(1, Number(dia) || 1), ultimo))}`;
}

/**
 * Compromisos del mes: cuotas de préstamos, pago de tarjetas y gastos fijos.
 * Devuelve [{ c, fecha, monto, pagado, pendiente, estado }].
 */
export function compromisos(mes = hoy().slice(0, 7), tc = 0) {
  const H = hoy();
  const movsMes = movimientos().filter((m) => (m.fecha || '').slice(0, 7) === mes);
  return deTipo('prestamo', 'tarjeta', 'fijo').map((c) => {
    let monto = Number(c.cuota) || 0;
    if (c.tipo === 'tarjeta' && !monto) monto = Math.max(0, saldo(c, tc)); // sin "pago del mes": todo lo consumido
    if (!monto) return null;
    const n = norm(c.nombre);
    const pagos = movsMes.filter((m) => (c.tipo === 'fijo'
      ? m.tipo === 'gasto' && (m.fijoId === c.id || norm(m.descripcion).includes(n))
      : m.tipo === 'pago' && norm(m.destino) === n));
    const pagado = pagos.reduce((a, m) => a + conv(Number(m.monto) || 0, m.moneda, c.moneda, tc), 0);
    const pendiente = Math.max(0, Math.round((monto - pagado) * 100) / 100);
    const fecha = fechaEnMes(mes, c.diaPago);
    const marcado = (c.pagadoMes || '').split(',').includes(mes); // "ya lo pagué" sin registrar movimiento
    const estado = marcado || pendiente <= 0.009 ? 'pagado' : fecha < H ? 'vencido' : 'pendiente';
    return { c, fecha, monto, pagado, pendiente: marcado ? 0 : pendiente, estado, marcado, moneda: c.moneda || 'PEN' };
  }).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Ingresos esperados del mes (tipo "ingreso"): sueldo, clases, alquileres…
 * Cobrado si hay un ingreso del mes con su fijoId o cuya descripción lo nombra.
 */
export function porCobrar(mes = hoy().slice(0, 7), tc = 0) {
  const movsMes = movimientos().filter((m) => (m.fecha || '').slice(0, 7) === mes && m.tipo === 'ingreso');
  return deTipo('ingreso').map((c) => {
    const monto = Number(c.cuota) || 0;
    if (!monto) return null;
    const n = norm(c.nombre);
    const cobrado = movsMes.filter((m) => m.fijoId === c.id || norm(m.descripcion).includes(n))
      .reduce((a, m) => a + conv(Number(m.monto) || 0, m.moneda, c.moneda || 'PEN', tc), 0);
    const pendiente = Math.max(0, Math.round((monto - cobrado) * 100) / 100);
    const fecha = fechaEnMes(mes, c.diaPago);
    return { c, fecha, monto, cobrado, pendiente, estado: pendiente <= 0.009 ? 'cobrado' : 'pendiente', moneda: c.moneda || 'PEN' };
  }).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
export function totalPorCobrar(tc = 0) {
  return totalizar(porCobrar(hoy().slice(0, 7), tc).filter((x) => x.estado !== 'cobrado').map((x) => ({ monto: x.pendiente, moneda: x.moneda })), tc);
}

/** Libre para gastar = efectivo disponible − lo comprometido que falta pagar este mes. */
export function libreParaGastar(tc = 0) {
  const ef = efectivoDisponible(tc);
  const pend = totalizar(compromisos(hoy().slice(0, 7), tc).filter((x) => x.estado !== 'pagado').map((x) => ({ monto: x.pendiente, moneda: x.moneda })), tc);
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    PEN: r2(ef.PEN - pend.PEN), USD: r2(ef.USD - pend.USD),
    totalPEN: r2(ef.totalPEN - pend.totalPEN), faltaTC: ef.faltaTC || pend.faltaTC,
    comprometido: pend,
  };
}

/** Marca (o desmarca) un compromiso como pagado en el mes, sin mover plata. */
export function marcarPagado(c, mes, si = true) {
  const l = new Set((c.pagadoMes || '').split(',').filter(Boolean));
  if (si) l.add(mes); else l.delete(mes);
  return store.guardar('cuentas', { id: c.id, pagadoMes: [...l].sort().slice(-12).join(',') });
}

/** Registra un nuevo saldo (de una cuenta o deuda) a partir de hoy. */
export function fijarSaldo(c, nuevoSaldo, fecha = hoy()) {
  return store.guardar('cuentas', { id: c.id, saldoInicial: Math.round(Number(nuevoSaldo) * 100) / 100, fechaSaldo: fecha, saldoEn: new Date().toISOString() });
}
