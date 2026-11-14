// ============================================================
// caja.js — Módulo "Caja": finanzas personales en S/ y US$.
//
// Arriba, tres números que responden "¿cuánto puedo gastar?":
//   💵 Efectivo disponible  = saldo de tus cuentas (efectivo, banco, Yape)
//   🟢 Libre para gastar    = disponible − cuotas, tarjetas y gastos fijos
//                             del mes que aún no pagas
//   🏦 Deudas               = préstamos + tarjetas
// Debajo: compromisos del mes (con botón Pagar), resumen del mes
// (los pagos de deuda NO cuentan como gasto), categorías con
// presupuesto, tendencia y la gestión de cuentas, deudas y fijos.
// ============================================================
import * as store from './store.js';
import { parsearMovimiento } from './caja-parser.js';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CUENTAS_DEFECTO, MONEDAS, BANCOS, iconoCategoria } from './caja-catalogo.js';
import * as CM from './caja-modelo.js';
import { modal, toast, confirmar, leerForm, descargar } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, fmtFecha, agrupar, pad, norm, diffDias } from './util.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
let mesActual = hoy().slice(0, 7); // 'AAAA-MM'

// ---------------- Utilidades ----------------
const numero = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // 1,234.50 (formato usual en Perú)
/** "S/ 1,234.50" · "US$ 15.99" · "-S/ 18.50" */
export function dinero(monto, moneda = 'PEN') {
  const n = Number(monto) || 0;
  return `${n < 0 ? '-' : ''}${MONEDAS[moneda]?.simbolo || moneda} ${numero.format(Math.abs(n))}`;
}
const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} ${y}`; };
const moverMes = (m, d) => { const [y, mm] = m.split('-').map(Number); const f = new Date(y, mm - 1 + d, 1); return `${f.getFullYear()}-${pad(f.getMonth() + 1)}`; };
const cfgCaja = () => {
  const c = store.config();
  return { presupuestos: c.cajaPresupuestos || {}, tc: Number(c.tipoCambio) || 0 };
};
const movimientos = () => store.todos('movimientos');
const delMes = (mes) => movimientos().filter((m) => (m.fecha || '').slice(0, 7) === mes);
/** Monto en soles (si es en dólares usa el tipo de cambio; sin T.C. devuelve null). */
const enSoles = (m, tc) => (m.moneda === 'USD' ? (tc ? m.monto * tc : null) : Number(m.monto) || 0);
const suma = (l) => l.reduce((a, m) => a + (Number(m.monto) || 0), 0);
const esResultado = (m) => m.tipo === 'ingreso' || m.tipo === 'gasto' || !m.tipo;
/** Nombres de cuentas para elegir (si aún no configuró cuentas, las de siempre). */
const opcionesCuenta = (tipos) => {
  const n = CM.nombresCuentas(tipos);
  return n.length ? n : CUENTAS_DEFECTO;
};
/** Muestra un total "S/ x · US$ y" (y total en soles si hay T.C.). */
function totalHTML(t, tc, conTotal = true) {
  const partes = [];
  if (t.PEN || !t.USD) partes.push(dinero(t.PEN, 'PEN'));
  if (t.USD) partes.push(dinero(t.USD, 'USD'));
  if (t.USD && tc && conTotal) return `${dinero(t.totalPEN)}<small>${partes.join(' + ')}</small>`;
  return partes.join('<br>');
}

// ---------------- Guardar desde texto ----------------
export async function crearMovimientoDesdeTexto(texto) {
  const detalle = CM.detalleParaParser();
  const r = parsearMovimiento(texto, { detalle, cuentas: detalle.length ? undefined : CUENTAS_DEFECTO });
  if (r.monto === null) {
    toast('No encontré el monto. Ejemplo: “almuerzo 25” o “netflix 15 dólares”.', null, 6000);
    editarMovimiento(null, { tipo: r.tipo, descripcion: r.descripcion, categoria: r.categoria, fecha: r.fecha, moneda: r.moneda, cuenta: r.cuenta, destino: r.destino });
    return null;
  }
  if ((r.tipo === 'pago' && !r.destino) || (r.tipo === 'transferencia' && (!r.cuenta || !r.destino))) {
    toast('Completa a qué deuda o cuenta corresponde.', null, 5000);
    editarMovimiento(null, { ...r, textoOriginal: texto.trim() });
    return null;
  }
  // ¿Es uno de tus ingresos mensuales (sueldo, clases…)? Se marca como cobrado.
  const fijo = r.tipo === 'ingreso' ? CM.deTipo('ingreso').find((c) => norm(texto).includes(norm(c.nombre))) : null;
  if (fijo && !r.cuenta && fijo.destino) r.cuenta = fijo.destino;
  const m = await store.guardar('movimientos', { ...r, ...(fijo ? { fijoId: fijo.id } : {}), textoOriginal: texto.trim() });
  const signo = m.tipo === 'ingreso' ? '＋' : m.tipo === 'transferencia' ? '⇄' : '−';
  const etiqueta = m.tipo === 'pago' ? `Pago a ${m.destino}` : m.tipo === 'transferencia' ? `${m.cuenta} → ${m.destino}` : m.categoria;
  const acciones = [{ texto: 'Editar', fn: () => editarMovimiento(m.id) }];
  const deuda = m.tipo === 'pago' ? CM.buscarCuenta(m.destino) : null;
  if (deuda) acciones.unshift({ texto: 'Nuevo saldo de la deuda', fn: () => editarCuenta(deuda.id, { soloSaldo: true }) });
  toast(`${signo} ${dinero(m.monto, m.moneda)} · ${etiqueta}`, acciones, 7000);
  return m;
}

// ---------------- Editor de movimientos ----------------
export function editarMovimiento(id, defecto = {}) {
  const m = id ? store.obtener('movimientos', id) : { tipo: 'gasto', moneda: 'PEN', fecha: hoy(), ...defecto };
  if (!m) return;
  const tipo0 = m.tipo || 'gasto';
  const optsCat = (tipo, sel) => (tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO)
    .map((c) => `<option ${c.nombre === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  const optsCuenta = (tipos, sel, vacio = '— Sin especificar —') => `<option value="">${vacio}</option>${[...new Set([...opcionesCuenta(tipos), ...(sel ? [sel] : [])])]
    .map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
  const deudas = CM.deTipo('prestamo', 'tarjeta');
  const html = `
  <form class="form form-mov" data-tipo="${esc(tipo0)}">
    <div class="segmentado seg-caja seg-4">
      ${[['gasto', '− Gasto'], ['ingreso', '＋ Ingreso'], ['pago', '🏦 Pago de deuda'], ['transferencia', '⇄ Entre cuentas']].map(([v, t]) =>
        `<label class="seg seg-${v}"><input type="radio" name="tipo" value="${v}" ${tipo0 === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Monto</span><input name="monto" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(m.monto ?? '')}" autofocus class="input-monto"></label>
      <label class="campo campo-corto"><span>Moneda</span><select name="moneda">${Object.entries(MONEDAS).map(([k, v]) => `<option value="${k}" ${m.moneda === k ? 'selected' : ''}>${v.simbolo} ${v.nombre}</option>`).join('')}</select></label>
    </div>
    <label class="campo campo-full solo-pago"><span>¿Qué deuda pagaste?</span>
      <select name="destinoPago">${deudas.length ? deudas.map((d) => `<option ${d.nombre === m.destino ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('') : '<option value="">— Primero registra tus deudas en Caja → Mis deudas —</option>'}</select>
    </label>
    <label class="campo campo-full"><span class="lbl-cuenta">${tipo0 === 'ingreso' ? '¿A qué cuenta entró?' : tipo0 === 'transferencia' ? 'Desde la cuenta' : tipo0 === 'pago' ? 'Pagado desde' : '¿Con qué pagaste?'}</span>
      <select name="cuenta">${optsCuenta(tipo0 === 'gasto' ? ['liquida', 'tarjeta'] : ['liquida'], m.cuenta)}</select>
    </label>
    <label class="campo campo-full solo-transferencia"><span>Hacia la cuenta</span>
      <select name="destinoTransf">${optsCuenta(['liquida'], m.tipo === 'transferencia' ? m.destino : '', '— Elige —')}</select>
    </label>
    <label class="campo campo-full no-transferencia"><span>Descripción</span><input name="descripcion" value="${esc(m.descripcion || '')}" placeholder="Ej.: Almuerzo con el equipo"></label>
    <div class="fila-campos">
      <label class="campo solo-resultado"><span>Categoría</span><select name="categoria">${optsCat(tipo0, m.categoria)}</select></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" required value="${esc(m.fecha || hoy())}"></label>
    </div>
    <label class="campo campo-full solo-pago"><span>Nuevo saldo de la deuda según tu banco (opcional)</span>
      <input name="nuevoSaldo" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Si lo dejas vacío, se resta el monto pagado">
    </label>
    <label class="campo campo-full"><span>Nota</span><textarea name="nota" rows="2">${esc(m.nota || '')}</textarea></label>
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span>
      <button class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  const titulo = id ? 'Editar movimiento' : { gasto: 'Nuevo gasto', ingreso: 'Nuevo ingreso', pago: 'Pago de deuda', transferencia: 'Movimiento entre cuentas' }[tipo0];
  modal(titulo, html, (el, cerrar) => {
    const f = el.querySelector('form');
    const lbl = { gasto: '¿Con qué pagaste?', ingreso: '¿A qué cuenta entró?', pago: 'Pagado desde', transferencia: 'Desde la cuenta' };
    f.querySelectorAll('[name="tipo"]').forEach((r) => r.addEventListener('change', () => {
      f.dataset.tipo = r.value;
      el.querySelector('.lbl-cuenta').textContent = lbl[r.value];
      const sel = f.cuenta.value;
      f.cuenta.innerHTML = optsCuenta(r.value === 'gasto' ? ['liquida', 'tarjeta'] : ['liquida'], sel);
      if (r.value === 'gasto' || r.value === 'ingreso') f.categoria.innerHTML = optsCat(r.value, '');
    }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      d.monto = Math.round(Number(d.monto) * 100) / 100;
      if (!(d.monto > 0)) { toast('Ingresa un monto mayor a cero'); return; }
      const nuevoSaldo = d.nuevoSaldo; delete d.nuevoSaldo;
      if (d.tipo === 'pago') {
        d.destino = d.destinoPago; d.categoria = 'Pago de deuda';
        if (!d.destino) { toast('Elige la deuda que pagaste'); return; }
        if (!d.descripcion) d.descripcion = `Pago ${d.destino}`;
      } else if (d.tipo === 'transferencia') {
        d.destino = d.destinoTransf; d.categoria = 'Transferencia';
        if (!d.cuenta || !d.destino || d.cuenta === d.destino) { toast('Elige dos cuentas distintas'); return; }
        d.descripcion = `Transferencia ${d.cuenta} → ${d.destino}`;
      } else {
        d.destino = '';
        if (!d.descripcion) d.descripcion = d.categoria;
      }
      delete d.destinoPago; delete d.destinoTransf;
      const g = await store.guardar('movimientos', { ...(id ? { id } : {}), ...(defecto.fijoId ? { fijoId: defecto.fijoId } : {}), ...d });
      if (d.tipo === 'pago' && nuevoSaldo !== '' && nuevoSaldo !== undefined) {
        const deuda = CM.buscarCuenta(d.destino);
        if (deuda) { await CM.fijarSaldo(deuda, Number(nuevoSaldo), g.fecha); toast(`Saldo de ${deuda.nombre} actualizado: ${dinero(Number(nuevoSaldo), deuda.moneda)}`); }
      } else toast('Guardado');
      cerrar();
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (await confirmar('¿Eliminar este movimiento?', 'Eliminar', true)) {
        await store.borrar('movimientos', id);
        toast('Eliminado', { texto: 'Deshacer', fn: () => store.guardar('movimientos', { id, deleted: false }) });
        cerrar();
      }
    });
  });
}

// ---------------- Cuentas, deudas y gastos fijos ----------------
export function editarCuenta(id, op = {}) {
  const c = id ? store.obtener('cuentas', id) : { tipo: op.tipo || 'liquida', moneda: 'PEN', activo: true, banco: op.banco || '' };
  if (!c) return;
  const t = c.tipo;
  const saldoActual = id ? CM.saldo(c, cfgCaja().tc) : '';
  const etiquetaSaldo = { liquida: '¿Cuánto tienes hoy en esta cuenta?', tarjeta: '¿Cuánto debes hoy en la tarjeta?', prestamo: '¿Cuánto debes hoy? (saldo según tu banco)', fijo: '', ingreso: '' }[t];
  const sinSaldo = t === 'fijo' || t === 'ingreso';
  const conBanco = t === 'liquida' || t === 'tarjeta' || t === 'prestamo';
  const html = `
  <form class="form">
    ${op.soloSaldo ? `<p class="nota">${t === 'liquida' ? 'Pon el saldo real que tienes hoy. Desde ahora, tus gastos e ingresos lo irán actualizando.' : 'Pon el saldo que te indica tu banco después del último pago. Desde ahora se contará desde este monto.'}</p>` : ''}
    <div class="fila-campos" ${op.soloSaldo ? 'hidden' : ''}>
      <label class="campo"><span>${t === 'fijo' ? 'Nombre del gasto fijo' : t === 'ingreso' ? 'Nombre del ingreso' : 'Nombre'}</span><input name="nombre" required value="${esc(c.nombre || (op.banco ? `${t === 'tarjeta' ? 'Tarjeta' : t === 'prestamo' ? 'Préstamo' : 'Ahorros'} ${op.banco}` : ''))}" placeholder="${{ liquida: 'Ej.: Ahorros BCP, Sueldo Interbank, Efectivo', tarjeta: 'Ej.: Visa BCP', prestamo: 'Ej.: Hipoteca, Préstamo vehicular', fijo: 'Ej.: Alquiler, Pensión colegio', ingreso: 'Ej.: Sueldo, Clases, Alquiler del depa' }[t]}" ${op.soloSaldo ? '' : 'autofocus'}></label>
      <label class="campo campo-corto"><span>Moneda</span><select name="moneda">${Object.entries(MONEDAS).map(([k, v]) => `<option value="${k}" ${c.moneda === k ? 'selected' : ''}>${v.simbolo}</option>`).join('')}</select></label>
    </div>
    ${conBanco && !op.soloSaldo ? `<label class="campo campo-full"><span>Banco o caja (opcional)</span><input name="banco" list="lista-bancos" value="${esc(c.banco || '')}" placeholder="Ej.: BCP, Interbank, BBVA" autocomplete="off"><datalist id="lista-bancos">${[...new Set([...CM.bancos(), ...BANCOS])].map((b) => `<option value="${esc(b)}">`).join('')}</datalist></label>` : ''}
    ${!sinSaldo ? `<label class="campo campo-full"><span>${etiquetaSaldo}</span><input name="saldo" type="number" inputmode="decimal" step="0.01" value="${saldoActual === '' ? '' : esc(saldoActual)}" ${op.soloSaldo ? 'autofocus' : ''} required></label>` : ''}
    ${t !== 'liquida' && !op.soloSaldo ? `<div class="fila-campos">
      <label class="campo"><span>${t === 'fijo' || t === 'ingreso' ? 'Monto mensual' : t === 'tarjeta' ? 'Pago del mes (opcional)' : 'Cuota mensual'}</span><input name="cuota" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(c.cuota ?? '')}" ${t === 'tarjeta' ? 'placeholder="Vacío = todo lo consumido"' : 'required'}></label>
      <label class="campo campo-corto"><span>${t === 'ingreso' ? 'Día que cobras' : 'Día de pago'}</span><input name="diaPago" type="number" min="1" max="31" value="${esc(c.diaPago ?? '')}" required></label>
    </div>` : ''}
    ${(t === 'fijo' || t === 'ingreso') && !op.soloSaldo ? `<label class="campo campo-full"><span>Categoría</span><select name="categoria">${(t === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO).map((x) => `<option ${x.nombre === c.categoria ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}
    ${t === 'ingreso' && !op.soloSaldo ? `<label class="campo campo-full"><span>¿A qué cuenta te llega?</span><select name="destino"><option value="">— Sin especificar —</option>${CM.nombresCuentas(['liquida']).map((n) => `<option ${n === c.destino ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
    ${op.soloSaldo ? '' : `<label class="campo campo-full"><span>Nota</span><input name="nota" value="${esc(c.nota || '')}" placeholder="${t === 'prestamo' ? 'Ej.: Banco, tasa, plazo, fecha final' : ''}"></label>`}
    <div class="acciones-modal">
      ${id && !op.soloSaldo ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span><button class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  const tituloT = { liquida: 'cuenta', tarjeta: 'tarjeta de crédito', prestamo: 'deuda / préstamo', fijo: 'gasto fijo', ingreso: 'ingreso mensual' }[t];
  modal(op.soloSaldo ? `Actualizar saldo · ${c.nombre}` : `${id ? 'Editar' : 'Nueva'} ${tituloT}`, html, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      const saldo = d.saldo; delete d.saldo;
      if (d.cuota !== undefined) d.cuota = d.cuota === '' ? '' : Number(d.cuota);
      if (d.diaPago !== undefined) d.diaPago = Number(d.diaPago) || '';
      const previo = id ? store.obtener('cuentas', id) : null;
      // Si cambió el nombre, actualizar los movimientos que la usan
      if (previo && d.nombre && d.nombre !== previo.nombre) {
        for (const m of movimientos()) {
          const cambios = {};
          if (norm(m.cuenta) === norm(previo.nombre)) cambios.cuenta = d.nombre;
          if (norm(m.destino) === norm(previo.nombre)) cambios.destino = d.nombre;
          if (Object.keys(cambios).length) await store.guardar('movimientos', { id: m.id, ...cambios });
        }
        for (const x of CM.cuentas()) if (norm(x.destino) === norm(previo.nombre)) await store.guardar('cuentas', { id: x.id, destino: d.nombre });
      }
      if (d.banco !== undefined) d.banco = d.banco.trim();
      if (!id && CM.buscarCuenta(d.nombre)) { toast(`Ya tienes una cuenta llamada “${d.nombre}”. Usa otro nombre.`); return; }
      const g = await store.guardar('cuentas', { ...(id ? { id } : { tipo: t, activo: true, orden: CM.cuentas().length }), ...d });
      if (saldo !== undefined && saldo !== '' && (!id || Number(saldo) !== saldoActual)) await CM.fijarSaldo(g, Number(saldo));
      toast('Guardado');
      cerrar();
    });
    el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
      if (await confirmar(`¿Eliminar “${c.nombre}”? Sus movimientos se conservan.`, 'Eliminar', true)) { await store.borrar('cuentas', id); cerrar(); }
    });
  });
}

/** Bloque de formulario para un banco: cuenta(s) de ahorro y tarjeta. */
function bloqueBanco(i, banco = '') {
  const opts = [...new Set([...CM.bancos(), ...BANCOS])].map((b) => `<option value="${esc(b)}">`).join('');
  return `<fieldset class="conf-banco" data-i="${i}">
    <div class="conf-fila conf-fila-banco"><input name="b${i}" list="bancos-${i}" value="${esc(banco)}" placeholder="🏛️ Banco (ej.: BCP)" autocomplete="off"><datalist id="bancos-${i}">${opts}</datalist>
      ${i > 0 ? '<button type="button" class="mini" data-quitar-banco>Quitar</button>' : '<span></span>'}</div>
    <small class="conf-et">Cuenta de ahorros / sueldo</small>
    <div class="conf-fila conf-fila-3"><input name="b${i}_cn" placeholder="Nombre (ej.: Sueldo)"><select name="b${i}_cm"><option value="PEN">S/</option><option value="USD">US$</option></select><input name="b${i}_cs" type="number" step="0.01" inputmode="decimal" placeholder="Saldo hoy"></div>
    <div class="conf-fila conf-fila-3"><input name="b${i}_c2n" placeholder="Otra cuenta (opcional)"><select name="b${i}_c2m"><option value="PEN">S/</option><option value="USD">US$</option></select><input name="b${i}_c2s" type="number" step="0.01" inputmode="decimal" placeholder="Saldo hoy"></div>
    <small class="conf-et">Tarjeta de crédito de este banco (opcional)</small>
    <div class="conf-fila conf-fila-3 conf-fila-igual"><input name="b${i}_ts" type="number" step="0.01" inputmode="decimal" placeholder="Debo hoy"><input name="b${i}_tc" type="number" step="0.01" inputmode="decimal" placeholder="Pago mes"><input name="b${i}_td" type="number" min="1" max="31" placeholder="Día pago"></div>
  </fieldset>`;
}
/** Crea las cuentas y la tarjeta de un bloque de banco. Devuelve cuántas creó. */
async function guardarBloqueBanco(d, i, ordenInicial) {
  const banco = (d[`b${i}`] || '').trim();
  let orden = ordenInicial, n = 0;
  const crear = async (o, saldoHoy) => {
    let nombre = o.nombre.trim();
    if (CM.buscarCuenta(nombre)) nombre = `${nombre} (${banco || 2})`;
    const g = await store.guardar('cuentas', { moneda: 'PEN', activo: true, orden: orden++, banco, ...o, nombre });
    await CM.fijarSaldo(g, Number(saldoHoy) || 0); n++;
  };
  const nombreCta = (txt) => (txt ? (banco && !norm(txt).includes(norm(banco)) ? `${txt.trim()} ${banco}` : txt.trim()) : `Ahorros ${banco}`);
  if (d[`b${i}_cs`] !== '' && d[`b${i}_cs`] !== undefined && (banco || d[`b${i}_cn`])) await crear({ nombre: nombreCta(d[`b${i}_cn`]), tipo: 'liquida', moneda: d[`b${i}_cm`] }, d[`b${i}_cs`]);
  if (d[`b${i}_c2s`] !== '' && d[`b${i}_c2s`] !== undefined && d[`b${i}_c2n`]) await crear({ nombre: nombreCta(d[`b${i}_c2n`]), tipo: 'liquida', moneda: d[`b${i}_c2m`] }, d[`b${i}_c2s`]);
  if (d[`b${i}_ts`] !== '' && d[`b${i}_ts`] !== undefined) await crear({ nombre: banco ? `Tarjeta ${banco}` : 'Tarjeta de crédito', tipo: 'tarjeta', cuota: Number(d[`b${i}_tc`]) || '', diaPago: Number(d[`b${i}_td`]) || '' }, d[`b${i}_ts`]);
  return n;
}
function activarBloquesBanco(el) {
  const cont = el.querySelector('.conf-bancos');
  let i = cont.querySelectorAll('.conf-banco').length;
  el.querySelector('[data-otro-banco]').onclick = () => { cont.insertAdjacentHTML('beforeend', bloqueBanco(i++)); cont.lastElementChild.querySelector('input').focus(); };
  cont.addEventListener('click', (e) => { if (e.target.closest('[data-quitar-banco]')) e.target.closest('.conf-banco').remove(); });
}

/** Configuración inicial: efectivo, bancos, deuda principal e ingresos. */
function configurarInicial() {
  modal('Configura tu efectivo disponible', `
    <p class="nota">Pon cuánto tienes y cuánto debes <b>hoy</b>. Deja en blanco lo que no uses. Desde ahora, cada gasto e ingreso actualizará estos saldos.</p>
    <form class="form conf-caja">
      <h4 class="sub-tit">💵 Efectivo y billeteras</h4>
      <div class="conf-fila"><input name="n0" value="Efectivo"><input name="s0" type="number" step="0.01" inputmode="decimal" placeholder="S/ tengo hoy"></div>
      <div class="conf-fila"><input name="n1" value="Yape / Plin"><input name="s1" type="number" step="0.01" inputmode="decimal" placeholder="S/ tengo hoy"></div>
      <h4 class="sub-tit">🏛️ Mis bancos</h4>
      <div class="conf-bancos">${bloqueBanco(0)}${bloqueBanco(1)}</div>
      <button type="button" class="btn btn-mini" data-otro-banco>${ic('mas2')} Otro banco</button>
      <h4 class="sub-tit">🏦 Préstamo o deuda principal</h4>
      <div class="conf-fila"><input name="dn" placeholder="Nombre (ej.: Hipoteca BCP)"><input name="ds" type="number" step="0.01" inputmode="decimal" placeholder="S/ debo hoy"></div>
      <div class="conf-fila"><input name="dc" type="number" step="0.01" inputmode="decimal" placeholder="Cuota mensual S/"><input name="dd" type="number" min="1" max="31" placeholder="Día de pago"></div>
      <h4 class="sub-tit">💰 Mis ingresos de cada mes</h4>
      <div class="conf-fila conf-fila-3"><input name="i0n" value="Sueldo"><input name="i0m" type="number" step="0.01" inputmode="decimal" placeholder="Monto S/"><input name="i0d" type="number" min="1" max="31" placeholder="Día"></div>
      <div class="conf-fila conf-fila-3"><input name="i1n" placeholder="Otro (ej.: Clases)"><input name="i1m" type="number" step="0.01" inputmode="decimal" placeholder="Monto S/"><input name="i1d" type="number" min="1" max="31" placeholder="Día"></div>
      <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Guardar y ver mi disponible</button></div>
    </form>`, (el, cerrar) => {
    activarBloquesBanco(el);
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      let orden = CM.cuentas().length;
      const crear = async (o, saldoHoy) => { const g = await store.guardar('cuentas', { moneda: 'PEN', activo: true, orden: orden++, ...o }); if (saldoHoy !== undefined) await CM.fijarSaldo(g, Number(saldoHoy) || 0); };
      for (let i = 0; i < 2; i++) if (d[`n${i}`] && d[`s${i}`] !== '') await crear({ nombre: d[`n${i}`], tipo: 'liquida' }, d[`s${i}`]);
      for (const f of el.querySelectorAll('.conf-banco')) orden += await guardarBloqueBanco(d, f.dataset.i, orden);
      if (d.dn && d.ds !== '') await crear({ nombre: d.dn, tipo: 'prestamo', cuota: Number(d.dc) || '', diaPago: Number(d.dd) || '' }, d.ds);
      const liq = CM.deTipo('liquida');
      const primera = (liq.find((c) => /sueldo/i.test(c.nombre)) || liq.find((c) => c.banco))?.nombre || '';
      for (let i = 0; i < 2; i++) if (d[`i${i}n`] && Number(d[`i${i}m`]) > 0) await crear({ nombre: d[`i${i}n`], tipo: 'ingreso', cuota: Number(d[`i${i}m`]), diaPago: Number(d[`i${i}d`]) || 1, categoria: i === 0 && /sueldo/i.test(d.i0n) ? 'Sueldo' : 'Otros ingresos', destino: primera });
      if (!CM.deTipo('liquida').length) { toast('Pon al menos el saldo de una cuenta'); return; }
      toast('¡Listo! Ya ves tu efectivo disponible.');
      cerrar();
    });
  }, { ancho: 'ancho' });
}

/** Agregar un banco con sus cuentas y tarjeta, en un paso. */
function agregarBanco() {
  modal('Agregar banco', `<form class="form conf-caja">
    <p class="nota">Registra tus cuentas y tu tarjeta de este banco con el saldo de hoy.</p>
    <div class="conf-bancos">${bloqueBanco(0)}</div>
    <button type="button" class="btn btn-mini" data-otro-banco>${ic('mas2')} Otro banco</button>
    <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Guardar</button></div>
  </form>`, (el, cerrar) => {
    activarBloquesBanco(el);
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(e.target);
      let orden = CM.cuentas().length, n = 0;
      for (const f of el.querySelectorAll('.conf-banco')) { const k = await guardarBloqueBanco(d, f.dataset.i, orden); orden += k; n += k; }
      if (!n) { toast('Pon el saldo de hoy de al menos una cuenta o tarjeta'); return; }
      toast(`Listo: ${n} cuenta${n > 1 ? 's' : ''} agregada${n > 1 ? 's' : ''}`);
      cerrar();
    });
  }, { ancho: 'ancho' });
}

/** Botón "Cobrado" de un ingreso esperado. */
function cobrarIngreso(x) {
  const c = x.c;
  editarMovimiento(null, { tipo: 'ingreso', monto: x.pendiente, moneda: x.moneda, descripcion: c.nombre, categoria: c.categoria || 'Otros ingresos', fijoId: c.id, cuenta: c.destino || CM.deTipo('liquida')[0]?.nombre || '' });
}

/** Botón "Pagar" de un compromiso: abre el registro ya lleno. */
function pagarCompromiso(x) {
  const c = x.c;
  const liquidas = CM.deTipo('liquida');
  if (c.tipo === 'fijo') editarMovimiento(null, { tipo: 'gasto', monto: x.pendiente, moneda: x.moneda, descripcion: c.nombre, categoria: c.categoria || 'Otros gastos', fijoId: c.id, cuenta: liquidas[0]?.nombre || '' });
  else editarMovimiento(null, { tipo: 'pago', monto: x.pendiente, moneda: x.moneda, destino: c.nombre, descripcion: `Pago ${c.nombre}`, cuenta: liquidas[0]?.nombre || '' });
}

// ---------------- Presupuestos y tipo de cambio ----------------
function editarPresupuestos() {
  const { presupuestos } = cfgCaja();
  modal('Presupuesto mensual por categoría', `
    <p class="nota">Pon cuánto quieres gastar como máximo cada mes (en soles). Deja vacío lo que no quieras controlar.</p>
    <form class="form presupuestos">
      ${CATEGORIAS_GASTO.map((c) => `<label class="pres-fila"><span>${c.icono} ${esc(c.nombre)}</span><input type="number" min="0" step="10" inputmode="decimal" name="${esc(c.nombre)}" value="${esc(presupuestos[c.nombre] ?? '')}" placeholder="S/"></label>`).join('')}
      <div class="acciones-modal"><span class="sep"></span><button class="btn btn-pri">Guardar</button></div>
    </form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = {};
      for (const inp of e.target.querySelectorAll('input')) if (Number(inp.value) > 0) p[inp.name] = Number(inp.value);
      store.guardarConfig({ cajaPresupuestos: p });
      toast('Presupuestos guardados'); cerrar(); refrescarVista?.();
    });
  });
}

function editarTipoCambio() {
  const { tc } = cfgCaja();
  modal('Tipo de cambio', `
    <p class="nota">Sirve para ver tu total del mes en soles cuando tienes movimientos en dólares. Actualízalo cuando quieras (por ejemplo, el del día en tu banco).</p>
    <form class="form"><label class="campo"><span>1 US$ = S/</span><input type="number" name="tc" step="0.001" min="0" inputmode="decimal" value="${esc(tc || '')}" placeholder="3.750" autofocus></label>
    <div class="acciones-modal"><button type="button" class="btn" data-quitar>No usar</button><span class="sep"></span><button class="btn btn-pri">Guardar</button></div></form>`, (el, cerrar) => {
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault(); store.guardarConfig({ tipoCambio: Number(e.target.tc.value) || '' }); cerrar(); refrescarVista?.();
    });
    el.querySelector('[data-quitar]').onclick = () => { store.guardarConfig({ tipoCambio: '' }); cerrar(); refrescarVista?.(); };
  });
}

function exportarCSV() {
  const celda = (v) => { const s = (v ?? '').toString().replace(/\r?\n/g, ' '); return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const nomTipo = { ingreso: 'Ingreso', gasto: 'Gasto', pago: 'Pago de deuda', transferencia: 'Transferencia' };
  const filas = [['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Destino', 'Moneda', 'Monto', 'Monto con signo', 'Nota'],
    ...movimientos().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((m) => [m.fecha, nomTipo[m.tipo || 'gasto'], m.descripcion, m.categoria, m.cuenta, m.destino, m.moneda, String(m.monto).replace('.', ','), String(m.tipo === 'ingreso' ? m.monto : m.tipo === 'transferencia' ? 0 : -m.monto).replace('.', ','), m.nota])];
  descargar(`caja-${hoy()}.csv`, '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------------- Vista ----------------
let refrescarVista = null;

export function vistaCaja() {
  const { presupuestos, tc } = cfgCaja();
  const H = hoy();
  const configurado = CM.cuentas().length > 0;
  const todos = delMes(mesActual).sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
  const lista = todos.filter(esResultado);
  const pagos = todos.filter((m) => m.tipo === 'pago');
  const ing = lista.filter((m) => m.tipo === 'ingreso');
  const gas = lista.filter((m) => m.tipo !== 'ingreso');
  const monedasUsadas = ['PEN', ...(todos.some((m) => m.moneda === 'USD') ? ['USD'] : [])];
  const totalSoles = (l) => l.reduce((a, m) => a + (enSoles(m, tc) || 0), 0);

  // ---- Tres números principales ----
  let tarjetas = '';
  let bloqueCompromisos = '';
  if (configurado) {
    const ef = CM.efectivoDisponible(tc);
    const libre = CM.libreParaGastar(tc);
    const deu = CM.totalDeudas(tc);
    const comp = CM.compromisos(H.slice(0, 7), tc);
    const pendientes = comp.filter((x) => x.estado !== 'pagado');
    const prox = pendientes[0];
    const cobros = CM.porCobrar(H.slice(0, 7), tc);
    const xCobrar = CM.totalPorCobrar(tc);
    tarjetas = `
    <div class="caja-top">
      <div class="top-card top-ef"><span>💵 Efectivo disponible</span><b>${totalHTML(ef, tc)}</b><small>Lo que tienes hoy en tus cuentas</small></div>
      <div class="top-card top-libre ${libre.totalPEN < 0 || (!tc && libre.PEN < 0) ? 'negativo' : ''}"><span>🟢 Libre para gastar</span><b>${totalHTML(libre, tc)}</b><small>${xCobrar.PEN || xCobrar.USD ? `Aún por cobrar: ${xCobrar.USD ? dinero(xCobrar.PEN) + ' + ' + dinero(xCobrar.USD, 'USD') : dinero(xCobrar.PEN)} (no incluido) · ` : ''}${pendientes.length ? `Ya descontado${pendientes.length > 1 ? 's' : ''} ${pendientes.length} pago${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''} del mes` : 'Este mes ya no tienes pagos pendientes'}</small></div>
      <div class="top-card top-deuda"><span>🏦 Deudas</span><b>${totalHTML(deu, tc)}</b><small>${prox ? `Próximo pago: ${esc(prox.c.nombre)} · ${esc(fmtFecha(prox.fecha))}` : 'Préstamos y tarjetas'}</small></div>
    </div>
    ${ef.faltaTC || libre.faltaTC ? `<p class="nota">Tienes cuentas en dólares: <button class="mini-link" data-tc>pon el tipo de cambio</button> para sumarlas en soles.</p>` : ''}`;
    bloqueCompromisos = comp.length ? `
    <section class="seccion"><h3 class="seccion-tit">${ic('calendario')}Compromisos de ${esc(MESES[Number(H.slice(5, 7)) - 1])}<span class="contador">${pendientes.length} por pagar</span></h3>
      <div class="lista">${comp.map((x, i) => {
        const dias = diffDias(x.fecha, H);
        const etiqueta = x.estado === 'pagado' ? '✓ Pagado' : x.estado === 'vencido' ? `Venció ${fmtFecha(x.fecha)}` : dias === 0 ? 'Vence hoy' : dias <= 3 ? `Vence en ${dias} día${dias > 1 ? 's' : ''}` : `Vence el ${Number(x.fecha.slice(8))}`;
        return `<div class="comp comp-${x.estado} ${x.estado === 'pendiente' && dias <= 3 ? 'comp-pronto' : ''}">
          <span class="mov-ic">${CM.TIPOS_CUENTA[x.c.tipo].icono}</span>
          <span class="mov-txt"><b>${esc(x.c.nombre)}</b><small>${esc(etiqueta)}${x.pagado && x.estado !== 'pagado' ? ` · pagado ${dinero(x.pagado, x.moneda)}` : ''}</small></span>
          <span class="mov-monto">${dinero(x.estado === 'pagado' ? x.monto : x.pendiente, x.moneda)}</span>
          ${x.estado === 'pagado' ? '<span class="comp-ok">✓</span>' : `<button class="btn btn-mini btn-pri" data-pagar="${i}">Pagar</button>`}
        </div>`;
      }).join('')}</div>
    </section>` : '';
    if (cobros.length) bloqueCompromisos += `
    <section class="seccion"><h3 class="seccion-tit">${ic('subir')}Ingresos de ${esc(MESES[Number(H.slice(5, 7)) - 1])}<span class="contador">${cobros.filter((x) => x.estado !== 'cobrado').length} por cobrar</span></h3>
      <div class="lista">${cobros.map((x, i) => `<div class="comp comp-${x.estado === 'cobrado' ? 'pagado' : 'pendiente'}">
          <span class="mov-ic">${iconoCategoria(x.c.categoria) !== '•' ? iconoCategoria(x.c.categoria) : '💰'}</span>
          <span class="mov-txt"><b>${esc(x.c.nombre)}</b><small>${x.estado === 'cobrado' ? '✓ Cobrado' : `Día ${Number(x.fecha.slice(8))}${x.c.destino ? ' · a ' + esc(x.c.destino) : ''}${x.cobrado ? ` · cobrado ${dinero(x.cobrado, x.moneda)}` : ''}`}</small></span>
          <span class="mov-monto verde">${dinero(x.estado === 'cobrado' ? x.monto : x.pendiente, x.moneda)}</span>
          ${x.estado === 'cobrado' ? '<span class="comp-ok">✓</span>' : `<button class="btn btn-mini" data-cobrar="${i}">Cobrado</button>`}
        </div>`).join('')}</div>
    </section>`;
  }

  // ---- Resumen del mes (sin pagos de deuda ni transferencias) ----
  const resumen = monedasUsadas.map((mon) => {
    const i = suma(ing.filter((m) => m.moneda === mon)), g = suma(gas.filter((m) => m.moneda === mon));
    const p = suma(pagos.filter((m) => m.moneda === mon));
    return `<div class="caja-res">
      <span class="caja-mon">${MONEDAS[mon].nombre}</span>
      <div><small>Ingresos</small><b class="verde">${dinero(i, mon)}</b></div>
      <div><small>Gastos</small><b class="rojo">${dinero(g, mon)}</b></div>
      <div><small>Ingresos − gastos</small><b class="${i - g < 0 ? 'rojo' : ''}">${dinero(i - g, mon)}</b></div>
      ${p ? `<div class="caja-pagos"><small>Pagos de deudas (aparte)</small><b>${dinero(p, mon)}</b></div>` : ''}
    </div>`;
  }).join('');
  const hayUSD = monedasUsadas.includes('USD');
  const consolidado = hayUSD && tc
    ? `<p class="nota caja-consol">Todo en soles (T.C. ${tc}): ingresos <b>${dinero(totalSoles(ing))}</b> · gastos <b>${dinero(totalSoles(gas))}</b> · diferencia <b>${dinero(totalSoles(ing) - totalSoles(gas))}</b> <button class="mini-link" data-tc>cambiar</button></p>`
    : hayUSD ? `<p class="nota caja-consol">Tienes movimientos en dólares. <button class="mini-link" data-tc>Pon el tipo de cambio</button> para ver todo sumado en soles.</p>` : '';

  // ---- Gastos por categoría ----
  const porCat = agrupar(gas, (m) => m.categoria || 'Otros gastos');
  const catsConPres = Object.keys(presupuestos).filter((c) => !porCat[c]);
  const filasCat = [...Object.keys(porCat), ...catsConPres].map((c) => {
    const items = porCat[c] || [];
    const sol = items.filter((m) => m.moneda === 'PEN' || tc).reduce((a, m) => a + enSoles(m, tc), 0);
    const usdSinTc = !tc ? suma(items.filter((m) => m.moneda === 'USD')) : 0;
    return { c, sol, usdSinTc, pres: presupuestos[c] || 0 };
  }).sort((a, b) => b.sol - a.sol || b.usdSinTc - a.usdSinTc);
  const maxCat = Math.max(1, ...filasCat.map((x) => Math.max(x.sol, x.pres)));
  const barrasCat = filasCat.map(({ c, sol, usdSinTc, pres }) => {
    const pct = Math.round((sol / maxCat) * 100), pp = pres ? Math.round((pres / maxCat) * 100) : 0;
    const exceso = pres && sol > pres;
    return `<div class="cat-fila">
      <div class="cat-cab"><span>${iconoCategoria(c)} ${esc(c)}</span><b class="${exceso ? 'rojo' : ''}">${dinero(sol)}${usdSinTc ? ` + ${dinero(usdSinTc, 'USD')}` : ''}${pres ? ` <em>/ ${dinero(pres)}</em>` : ''}</b></div>
      <div class="cat-pista"><span class="cat-val ${exceso ? 'exceso' : ''}" style="width:${Math.max(sol ? 2 : 0, pct)}%"></span>${pp ? `<i class="cat-pres" style="left:${pp}%"></i>` : ''}</div>
    </div>`;
  }).join('');

  // ---- Últimos 6 meses (en soles; sin pagos de deuda) ----
  const meses = Array.from({ length: 6 }, (_, i) => moverMes(mesActual, i - 5));
  const serie = meses.map((m) => {
    const l = delMes(m).filter(esResultado);
    return { m, i: totalSoles(l.filter((x) => x.tipo === 'ingreso')), g: totalSoles(l.filter((x) => x.tipo !== 'ingreso')) };
  });
  const maxS = Math.max(1, ...serie.flatMap((x) => [x.i, x.g]));
  const tendencia = `<div class="tendencia">${serie.map((x) => `
    <div class="tend-col ${x.m === mesActual ? 'actual' : ''}" title="${esc(nombreMes(x.m))}: ingresos ${dinero(x.i)}, gastos ${dinero(x.g)}">
      <div class="tend-barras"><span class="tb-i" style="height:${Math.round((x.i / maxS) * 100)}%"></span><span class="tb-g" style="height:${Math.round((x.g / maxS) * 100)}%"></span></div>
      <small>${MESES[Number(x.m.slice(5)) - 1].slice(0, 3)}</small>
    </div>`).join('')}</div>
    <p class="nota"><i class="punto" style="background:var(--verde)"></i> Ingresos &nbsp; <i class="punto" style="background:var(--rojo)"></i> Gastos · sin pagos de deuda${hayUSD && !tc ? ' · solo soles' : ' · en soles'}</p>`;

  // ---- Movimientos del mes ----
  const porDia = agrupar(todos, (m) => m.fecha);
  const filaMov = (m) => {
    const t = m.tipo || 'gasto';
    const clase = t === 'ingreso' ? 'verde' : t === 'gasto' ? 'rojo' : 'neutro';
    const signo = t === 'ingreso' ? '+' : t === 'transferencia' ? '⇄ ' : '−';
    const icono = t === 'pago' ? '🏦' : t === 'transferencia' ? '⇄' : iconoCategoria(m.categoria);
    const sub = t === 'pago' ? `Pago de deuda → ${m.destino}${m.cuenta ? ' · desde ' + m.cuenta : ''}` : t === 'transferencia' ? 'Entre tus cuentas' : `${m.categoria}${m.cuenta ? ' · ' + m.cuenta : ''}`;
    return `<button class="mov" data-mov="${esc(m.id)}">
      <span class="mov-ic">${icono}</span>
      <span class="mov-txt"><b>${esc(m.descripcion || m.categoria)}</b><small>${esc(sub)}</small></span>
      <span class="mov-monto ${clase}">${signo}${dinero(m.monto, m.moneda)}</span>
    </button>`;
  };
  const movsHtml = Object.keys(porDia).sort().reverse().map((d) => `<div class="dia-movs"><h4 class="sub-tit">${esc(fmtFecha(d))}</h4><div class="lista">${porDia[d].map(filaMov).join('')}</div></div>`).join('');

  // ---- Cuentas, deudas y gastos fijos ----
  const filaCuenta = (c) => {
        const s = c.tipo === 'fijo' || c.tipo === 'ingreso' ? null : CM.saldo(c, tc);
        const detalle = c.tipo === 'fijo' || c.tipo === 'ingreso' ? `${dinero(c.cuota || 0, c.moneda)} · día ${c.diaPago || '?'}${c.tipo === 'ingreso' && c.destino ? ' · a ' + c.destino : ''}`
          : CM.esDeuda(c) ? `${c.cuota ? `Cuota ${dinero(c.cuota, c.moneda)}` : 'Pago: todo lo consumido'}${c.diaPago ? ` · día ${c.diaPago}` : ''}` : (c.fechaSaldo ? `Saldo actualizado: ${fmtFecha(c.fechaSaldo).toLowerCase()}` : '');
        return `<div class="cta-fila">
          <button class="cta-info" data-cuenta="${esc(c.id)}"><span>${CM.TIPOS_CUENTA[c.tipo].icono} <b>${esc(c.nombre)}</b></span><small>${esc(detalle)}</small></button>
          ${s !== null ? `<b class="${c.tipo === 'liquida' ? (s < 0 ? 'rojo' : '') : 'deuda'}">${dinero(s, c.moneda || 'PEN')}</b>` : ''}
          ${c.tipo !== 'fijo' && c.tipo !== 'ingreso' ? `<button class="mini" data-saldo="${esc(c.id)}" title="Actualizar saldo">Actualizar</button>` : ''}
        </div>`;
  };
  const grupo = (tipos, titulo, tipoNuevo, textoNuevo, lista = CM.deTipo(...tipos)) => `<div class="grupo-cuentas"><h4 class="sub-tit">${titulo}</h4>
      ${lista.map(filaCuenta).join('') || (CM.bancos().length && tipoNuevo !== 'ingreso' && tipoNuevo !== 'fijo' ? '' : '<p class="nota">Aún no registras ninguna.</p>')}
      <button class="btn btn-mini" data-nueva-cuenta="${tipoNuevo}">${ic('mas2')} ${textoNuevo}</button>
    </div>`;
  // Cuentas y tarjetas agrupadas por banco
  const sumaMon = (l) => { const r = {}; for (const c of l) { const m = c.moneda || 'PEN'; r[m] = (r[m] || 0) + CM.saldo(c, tc); } return Object.entries(r).filter(([, v]) => v).map(([m, v]) => dinero(v, m)).join(' + ') || dinero(0); };
  const bloquesBanco = CM.bancos().map((b) => {
    const l = CM.deTipo('liquida', 'tarjeta', 'prestamo').filter((c) => norm(c.banco) === norm(b));
    const tiene = l.filter((c) => c.tipo === 'liquida'), debe = l.filter((c) => c.tipo !== 'liquida');
    return `<div class="grupo-cuentas banco">
      <h4 class="banco-cab"><span>🏛️ ${esc(b)}</span><small>${tiene.length ? `Tienes <b>${sumaMon(tiene)}</b>` : ''}${tiene.length && debe.length ? ' · ' : ''}${debe.length ? `Debes <b class="deuda">${sumaMon(debe)}</b>` : ''}</small></h4>
      ${l.map(filaCuenta).join('')}
      <div class="banco-acc"><button class="mini" data-nueva-cuenta="liquida" data-banco="${esc(b)}">+ Cuenta</button><button class="mini" data-nueva-cuenta="tarjeta" data-banco="${esc(b)}">+ Tarjeta</button><button class="mini" data-nueva-cuenta="prestamo" data-banco="${esc(b)}">+ Préstamo</button></div>
    </div>`;
  }).join('');
  const sinBanco = (...tipos) => CM.deTipo(...tipos).filter((c) => !(c.banco || '').trim());

  const html = `
  <header class="vista-cab">
    <div><h1>Caja</h1><p class="sub">Tu efectivo, tus deudas y tus gastos</p></div>
    <div class="vista-acc">
      <button class="btn" data-nuevo="gasto">− Gasto</button>
      <button class="btn" data-nuevo="pago">🏦 Pago</button>
      <button class="btn btn-pri" data-nuevo="ingreso">＋ Ingreso</button>
    </div>
  </header>
  ${configurado ? tarjetas : `<div class="aviso aviso-config">${ic('campana')}<span><b>Configura tu efectivo disponible:</b> registra cuánto tienes hoy en tus cuentas y cuánto debes. Así sabrás cuánto puedes gastar este mes después de tus cuotas.</span><button class="btn btn-mini btn-pri" data-configurar>Configurar (2 min)</button></div>`}
  <div class="cap-linea">
    ${ic('mas2')}
    <input type="text" id="cap-caja" placeholder="“almuerzo 25” · “pagué cuota hipoteca 5200 desde BCP” · “sueldo 8500 ingreso”" inputmode="text" enterkeyhint="done" aria-label="Registrar movimiento">
    <button class="icon-btn" data-mic-caja title="Dictar">${ic('mic')}</button>
  </div>
  ${bloqueCompromisos}
  <div class="mes-nav">
    <button class="icon-btn" data-mes="-1" aria-label="Mes anterior">${ic('atras')}</button>
    <b>${esc(nombreMes(mesActual))}</b>
    <button class="icon-btn" data-mes="1" aria-label="Mes siguiente">${ic('flecha')}</button>
    ${mesActual !== H.slice(0, 7) ? '<button class="btn btn-mini" data-mes="0">Este mes</button>' : ''}
  </div>
  <div class="caja-resumen">${resumen}</div>
  ${consolidado}
  <div class="rejilla-2">
    <div>
      <section class="seccion"><h3 class="seccion-tit">${ic('lista')}Movimientos<span class="contador">${todos.length}</span></h3>
        ${todos.length ? movsHtml : `<div class="vacio vacio-grande">${ic('mas2')}<b>Sin movimientos en ${esc(nombreMes(mesActual))}</b><span>Escribe arriba “almuerzo 25” y pulsa Enter.</span></div>`}
      </section>
    </div>
    <div>
      <section class="seccion"><h3 class="seccion-tit">${ic('usuario')}Cuentas, deudas y fijos</h3>
        ${bloquesBanco}
        <button class="btn btn-mini btn-solo" data-agregar-banco>${ic('mas2')} Agregar banco</button>
        ${grupo(['liquida'], '💵 Efectivo y otras cuentas', 'liquida', 'Cuenta', sinBanco('liquida'))}
        ${grupo(['prestamo', 'tarjeta'], '🏦 Otras deudas', 'prestamo', 'Deuda o préstamo', sinBanco('prestamo', 'tarjeta'))}
        ${grupo(['ingreso'], '💰 Ingresos de cada mes', 'ingreso', 'Ingreso (sueldo, clases, alquiler…)')}
        ${grupo(['fijo'], '📌 Gastos fijos mensuales', 'fijo', 'Gasto fijo')}
      </section>
      <section class="seccion"><h3 class="seccion-tit">${ic('bandera')}Gastos por categoría<button class="mini-link" data-pres>Presupuestos</button></h3>
        ${barrasCat || '<div class="vacio vacio-mini">Sin gastos este mes</div>'}
      </section>
      ${ing.length ? `<section class="seccion"><h3 class="seccion-tit">${ic('subir')}Ingresos por categoría</h3>
        ${Object.entries(agrupar(ing, (m) => m.categoria)).map(([c, l]) => `<div class="cuenta-fila"><span>${iconoCategoria(c)} ${esc(c)}</span><b class="verde">${monedasUsadas.map((mon) => l.some((m) => m.moneda === mon) ? dinero(suma(l.filter((m) => m.moneda === mon)), mon) : '').filter(Boolean).join(' · ')}</b></div>`).join('')}
      </section>` : ''}
      <section class="seccion"><h3 class="seccion-tit">${ic('hoy')}Últimos 6 meses</h3>${tendencia}</section>
      <div class="botones-rapidos">
        <button class="btn btn-mini" data-tc>Tipo de cambio${tc ? `: ${tc}` : ''}</button>
        <button class="btn btn-mini" data-csv-caja>${ic('descargar')} Exportar a Excel</button>
      </div>
    </div>
  </div>`;

  return {
    titulo: 'Caja', html,
    montar(el, refrescar) {
      refrescarVista = refrescar;
      const comp = configurado ? CM.compromisos(H.slice(0, 7), tc) : [];
      el.querySelectorAll('[data-nuevo]').forEach((b) => b.onclick = () => editarMovimiento(null, { tipo: b.dataset.nuevo }));
      el.querySelector('[data-configurar]')?.addEventListener('click', configurarInicial);
      el.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => pagarCompromiso(comp[Number(b.dataset.pagar)]));
      el.querySelectorAll('[data-cuenta]').forEach((b) => b.onclick = () => editarCuenta(b.dataset.cuenta));
      el.querySelectorAll('[data-saldo]').forEach((b) => b.onclick = () => editarCuenta(b.dataset.saldo, { soloSaldo: true }));
      el.querySelectorAll('[data-nueva-cuenta]').forEach((b) => b.onclick = () => editarCuenta(null, { tipo: b.dataset.nuevaCuenta, banco: b.dataset.banco || '' }));
      el.querySelector('[data-agregar-banco]')?.addEventListener('click', agregarBanco);
      const cobros = configurado ? CM.porCobrar(H.slice(0, 7), tc) : [];
      el.querySelectorAll('[data-cobrar]').forEach((b) => b.onclick = () => cobrarIngreso(cobros[Number(b.dataset.cobrar)]));
      el.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => {
        const d = Number(b.dataset.mes);
        mesActual = d === 0 ? hoy().slice(0, 7) : moverMes(mesActual, d);
        refrescar();
      });
      el.querySelectorAll('[data-mov]').forEach((b) => b.onclick = () => editarMovimiento(b.dataset.mov));
      el.querySelector('[data-pres]').onclick = editarPresupuestos;
      el.querySelectorAll('[data-tc]').forEach((b) => b.onclick = editarTipoCambio);
      el.querySelector('[data-csv-caja]').onclick = exportarCSV;
      const inp = el.querySelector('#cap-caja');
      inp.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && inp.value.trim()) {
          const t = inp.value; inp.value = '';
          const m = await crearMovimientoDesdeTexto(t);
          if (m && m.fecha.slice(0, 7) !== mesActual) { mesActual = m.fecha.slice(0, 7); refrescar(); }
        }
      });
      el.querySelector('[data-mic-caja]').onclick = async () => {
        const { escuchar, vozDisponible } = await import('./voz.js');
        if (!vozDisponible()) { toast('Usa el micrófono del teclado'); inp.focus(); return; }
        inp.placeholder = 'Escuchando… (ej.: “taxi 18 soles con yape”)';
        escuchar({
          onParcial: (t) => { inp.value = t; },
          onFin: async () => { inp.placeholder = '“almuerzo 25” · “pagué cuota hipoteca 5200 desde BCP”'; if (inp.value.trim()) { const t = inp.value; inp.value = ''; await crearMovimientoDesdeTexto(t); } },
          onError: (m) => toast(m),
        });
      };
    },
  };
}
