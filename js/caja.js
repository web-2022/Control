// ============================================================
// caja.js — Módulo "Caja": ingresos y gastos personales en S/ y US$.
// Captura rápida en una línea ("almuerzo 25", "netflix 15 dólares"),
// resumen del mes, gastos por categoría con presupuesto, por cuenta,
// tendencia de 6 meses y exportación a Excel (CSV).
// ============================================================
import * as store from './store.js';
import { parsearMovimiento } from './caja-parser.js';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CUENTAS_DEFECTO, MONEDAS, iconoCategoria } from './caja-catalogo.js';
import { modal, toast, confirmar, leerForm, descargar } from './ui.js';
import { ic } from './iconos.js';
import { esc, hoy, fmtFecha, agrupar, pad } from './util.js';

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
  return {
    cuentas: Array.isArray(c.cajaCuentas) && c.cajaCuentas.length ? c.cajaCuentas : CUENTAS_DEFECTO,
    presupuestos: c.cajaPresupuestos || {},
    tc: Number(c.tipoCambio) || 0,
  };
};
const movimientos = () => store.todos('movimientos');
const delMes = (mes) => movimientos().filter((m) => (m.fecha || '').slice(0, 7) === mes);
/** Monto en soles (si es en dólares usa el tipo de cambio; sin T.C. devuelve null). */
const enSoles = (m, tc) => (m.moneda === 'USD' ? (tc ? m.monto * tc : null) : Number(m.monto) || 0);
const suma = (l) => l.reduce((a, m) => a + (Number(m.monto) || 0), 0);

// ---------------- Guardar desde texto ----------------
export async function crearMovimientoDesdeTexto(texto) {
  const { cuentas } = cfgCaja();
  const r = parsearMovimiento(texto, { cuentas });
  if (r.monto === null) {
    toast('No encontré el monto. Ejemplo: “almuerzo 25” o “netflix 15 dólares”.', null, 6000);
    editarMovimiento(null, { tipo: r.tipo, descripcion: r.descripcion, categoria: r.categoria, fecha: r.fecha, moneda: r.moneda, cuenta: r.cuenta });
    return null;
  }
  const m = await store.guardar('movimientos', { ...r, textoOriginal: texto.trim() });
  toast(`${m.tipo === 'ingreso' ? '＋' : '−'} ${dinero(m.monto, m.moneda)} · ${m.categoria}`, { texto: 'Editar', fn: () => editarMovimiento(m.id) }, 5000);
  return m;
}

// ---------------- Editor ----------------
export function editarMovimiento(id, defecto = {}) {
  const m = id ? store.obtener('movimientos', id) : { tipo: 'gasto', moneda: 'PEN', fecha: hoy(), ...defecto };
  if (!m) return;
  const { cuentas } = cfgCaja();
  const optsCat = (tipo, sel) => (tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO)
    .map((c) => `<option ${c.nombre === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  const html = `
  <form class="form">
    <div class="segmentado seg-caja">
      <label class="seg seg-gasto"><input type="radio" name="tipo" value="gasto" ${m.tipo !== 'ingreso' ? 'checked' : ''}><span>− Gasto</span></label>
      <label class="seg seg-ingreso"><input type="radio" name="tipo" value="ingreso" ${m.tipo === 'ingreso' ? 'checked' : ''}><span>＋ Ingreso</span></label>
    </div>
    <div class="fila-campos">
      <label class="campo"><span>Monto</span><input name="monto" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(m.monto ?? '')}" autofocus class="input-monto"></label>
      <label class="campo campo-corto"><span>Moneda</span><select name="moneda">${Object.entries(MONEDAS).map(([k, v]) => `<option value="${k}" ${m.moneda === k ? 'selected' : ''}>${v.simbolo} ${v.nombre}</option>`).join('')}</select></label>
    </div>
    <label class="campo campo-full"><span>Descripción</span><input name="descripcion" value="${esc(m.descripcion || '')}" placeholder="Ej.: Almuerzo con el equipo"></label>
    <div class="fila-campos">
      <label class="campo"><span>Categoría</span><select name="categoria">${optsCat(m.tipo, m.categoria)}</select></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" required value="${esc(m.fecha || hoy())}"></label>
    </div>
    <label class="campo campo-full"><span>Cuenta / medio de pago</span>
      <select name="cuenta"><option value="">— Sin especificar —</option>${[...new Set([...cuentas, ...(m.cuenta ? [m.cuenta] : [])])].map((c) => `<option ${c === m.cuenta ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__nueva">＋ Nueva cuenta…</option></select>
    </label>
    <label class="campo campo-full"><span>Nota</span><textarea name="nota" rows="2">${esc(m.nota || '')}</textarea></label>
    <div class="acciones-modal">
      ${id ? `<button type="button" class="btn btn-peligro-txt" data-borrar>${ic('basura')} Eliminar</button>` : ''}
      <span class="sep"></span>
      <button class="btn btn-pri">Guardar</button>
    </div>
  </form>`;
  modal(id ? 'Editar movimiento' : (m.tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'), html, (el, cerrar) => {
    const f = el.querySelector('form');
    f.querySelectorAll('[name="tipo"]').forEach((r) => r.addEventListener('change', () => {
      f.categoria.innerHTML = optsCat(r.value, '');
    }));
    f.cuenta.addEventListener('change', () => {
      if (f.cuenta.value !== '__nueva') return;
      const n = (prompt('Nombre de la cuenta (ej.: BCP, Interbank, Tarjeta Visa):') || '').trim();
      if (!n) { f.cuenta.value = ''; return; }
      store.guardarConfig({ cajaCuentas: [...cfgCaja().cuentas.filter((c) => c !== n), n] });
      const o = new Option(n, n, true, true);
      f.cuenta.add(o, f.cuenta.options.length - 1);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = leerForm(f);
      d.monto = Math.round(Number(d.monto) * 100) / 100;
      if (!(d.monto > 0)) { toast('Ingresa un monto mayor a cero'); return; }
      if (d.cuenta === '__nueva') d.cuenta = '';
      if (!d.descripcion) d.descripcion = d.categoria;
      await store.guardar('movimientos', { ...(id ? { id } : {}), ...d });
      toast('Guardado');
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
  const filas = [['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Moneda', 'Monto', 'Monto con signo', 'Nota'],
    ...movimientos().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((m) => [m.fecha, m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', m.descripcion, m.categoria, m.cuenta, m.moneda, String(m.monto).replace('.', ','), String(m.tipo === 'ingreso' ? m.monto : -m.monto).replace('.', ','), m.nota])];
  descargar(`caja-${hoy()}.csv`, '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------------- Vista ----------------
let refrescarVista = null;

export function vistaCaja() {
  const { presupuestos, tc } = cfgCaja();
  const lista = delMes(mesActual).sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
  const ing = lista.filter((m) => m.tipo === 'ingreso');
  const gas = lista.filter((m) => m.tipo !== 'ingreso');
  const monedasUsadas = ['PEN', ...(lista.some((m) => m.moneda === 'USD') ? ['USD'] : [])];

  // Resumen por moneda
  const resumen = monedasUsadas.map((mon) => {
    const i = suma(ing.filter((m) => m.moneda === mon)), g = suma(gas.filter((m) => m.moneda === mon));
    return `<div class="caja-res">
      <span class="caja-mon">${MONEDAS[mon].nombre}</span>
      <div><small>Ingresos</small><b class="verde">${dinero(i, mon)}</b></div>
      <div><small>Gastos</small><b class="rojo">${dinero(g, mon)}</b></div>
      <div><small>Saldo del mes</small><b class="${i - g < 0 ? 'rojo' : ''}">${dinero(i - g, mon)}</b></div>
    </div>`;
  }).join('');
  const hayUSD = monedasUsadas.includes('USD');
  const totalSoles = (l) => l.reduce((a, m) => a + (enSoles(m, tc) || 0), 0);
  const consolidado = hayUSD && tc
    ? `<p class="nota caja-consol">Todo en soles (T.C. ${tc}): ingresos <b>${dinero(totalSoles(ing))}</b> · gastos <b>${dinero(totalSoles(gas))}</b> · saldo <b>${dinero(totalSoles(ing) - totalSoles(gas))}</b> <button class="mini-link" data-tc>cambiar</button></p>`
    : hayUSD ? `<p class="nota caja-consol">Tienes movimientos en dólares. <button class="mini-link" data-tc>Pon el tipo de cambio</button> para ver todo sumado en soles.</p>` : '';

  // Gastos por categoría (en soles; dólares convertidos si hay T.C.)
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

  // Por cuenta
  const porCuenta = agrupar(lista, (m) => m.cuenta || 'Sin especificar');
  const cuentasHtml = Object.entries(porCuenta).map(([cta, l]) => {
    const neto = (mon) => suma(l.filter((m) => m.moneda === mon && m.tipo === 'ingreso')) - suma(l.filter((m) => m.moneda === mon && m.tipo !== 'ingreso'));
    return `<div class="cuenta-fila"><span>${esc(cta)}</span><b>${monedasUsadas.map((mon) => l.some((m) => m.moneda === mon) ? `<span class="${neto(mon) < 0 ? 'rojo' : 'verde'}">${dinero(neto(mon), mon)}</span>` : '').filter(Boolean).join(' · ')}</b></div>`;
  }).join('');

  // Últimos 6 meses (en soles)
  const meses = Array.from({ length: 6 }, (_, i) => moverMes(mesActual, i - 5));
  const serie = meses.map((m) => {
    const l = delMes(m);
    return { m, i: totalSoles(l.filter((x) => x.tipo === 'ingreso')), g: totalSoles(l.filter((x) => x.tipo !== 'ingreso')) };
  });
  const maxS = Math.max(1, ...serie.flatMap((x) => [x.i, x.g]));
  const tendencia = `<div class="tendencia">${serie.map((x) => `
    <div class="tend-col ${x.m === mesActual ? 'actual' : ''}" title="${esc(nombreMes(x.m))}: ingresos ${dinero(x.i)}, gastos ${dinero(x.g)}">
      <div class="tend-barras"><span class="tb-i" style="height:${Math.round((x.i / maxS) * 100)}%"></span><span class="tb-g" style="height:${Math.round((x.g / maxS) * 100)}%"></span></div>
      <small>${MESES[Number(x.m.slice(5)) - 1].slice(0, 3)}</small>
    </div>`).join('')}</div>
    <p class="nota"><i class="punto" style="background:var(--verde)"></i> Ingresos &nbsp; <i class="punto" style="background:var(--rojo)"></i> Gastos ${hayUSD && !tc ? '· (solo soles; pon el tipo de cambio para incluir dólares)' : '· en soles'}</p>`;

  // Lista de movimientos por día
  const porDia = agrupar(lista, (m) => m.fecha);
  const movsHtml = Object.keys(porDia).sort().reverse().map((d) => {
    const items = porDia[d];
    return `<div class="dia-movs"><h4 class="sub-tit">${esc(fmtFecha(d))}</h4><div class="lista">${items.map((m) => `
      <button class="mov" data-mov="${esc(m.id)}">
        <span class="mov-ic">${iconoCategoria(m.categoria)}</span>
        <span class="mov-txt"><b>${esc(m.descripcion || m.categoria)}</b><small>${esc(m.categoria)}${m.cuenta ? ' · ' + esc(m.cuenta) : ''}</small></span>
        <span class="mov-monto ${m.tipo === 'ingreso' ? 'verde' : 'rojo'}">${m.tipo === 'ingreso' ? '+' : '−'}${dinero(m.monto, m.moneda)}</span>
      </button>`).join('')}</div></div>`;
  }).join('');

  const html = `
  <header class="vista-cab">
    <div><h1>Caja</h1><p class="sub">Tus ingresos y gastos personales</p></div>
    <div class="vista-acc">
      <button class="btn" data-nuevo="gasto">− Gasto</button>
      <button class="btn btn-pri" data-nuevo="ingreso">＋ Ingreso</button>
    </div>
  </header>
  <div class="mes-nav">
    <button class="icon-btn" data-mes="-1" aria-label="Mes anterior">${ic('atras')}</button>
    <b>${esc(nombreMes(mesActual))}</b>
    <button class="icon-btn" data-mes="1" aria-label="Mes siguiente">${ic('flecha')}</button>
    ${mesActual !== hoy().slice(0, 7) ? '<button class="btn btn-mini" data-mes="0">Este mes</button>' : ''}
  </div>
  <div class="cap-linea">
    ${ic('mas2')}
    <input type="text" id="cap-caja" placeholder="“almuerzo 25” · “netflix 15 dólares” · “sueldo 8500 ingreso”  (Enter)" inputmode="text" enterkeyhint="done" aria-label="Registrar gasto o ingreso">
    <button class="icon-btn" data-mic-caja title="Dictar">${ic('mic')}</button>
  </div>
  <div class="caja-resumen">${resumen}</div>
  ${consolidado}
  <div class="rejilla-2">
    <div>
      <section class="seccion"><h3 class="seccion-tit">${ic('lista')}Movimientos<span class="contador">${lista.length}</span></h3>
        ${lista.length ? movsHtml : `<div class="vacio vacio-grande">${ic('mas2')}<b>Sin movimientos en ${esc(nombreMes(mesActual))}</b><span>Escribe arriba “almuerzo 25” y pulsa Enter.</span></div>`}
      </section>
    </div>
    <div>
      <section class="seccion"><h3 class="seccion-tit">${ic('bandera')}Gastos por categoría<button class="mini-link" data-pres>Presupuestos</button></h3>
        ${barrasCat || '<div class="vacio vacio-mini">Sin gastos este mes</div>'}
      </section>
      ${ing.length ? `<section class="seccion"><h3 class="seccion-tit">${ic('subir')}Ingresos por categoría</h3>
        ${Object.entries(agrupar(ing, (m) => m.categoria)).map(([c, l]) => `<div class="cuenta-fila"><span>${iconoCategoria(c)} ${esc(c)}</span><b class="verde">${monedasUsadas.map((mon) => l.some((m) => m.moneda === mon) ? dinero(suma(l.filter((m) => m.moneda === mon)), mon) : '').filter(Boolean).join(' · ')}</b></div>`).join('')}
      </section>` : ''}
      ${lista.length ? `<section class="seccion"><h3 class="seccion-tit">${ic('usuario')}Por cuenta</h3>${cuentasHtml}</section>` : ''}
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
      el.querySelectorAll('[data-nuevo]').forEach((b) => b.onclick = () => editarMovimiento(null, { tipo: b.dataset.nuevo }));
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
        inp.placeholder = 'Escuchando… (ej.: “taxi dieciocho soles”)';
        escuchar({
          onParcial: (t) => { inp.value = t; },
          onFin: async () => { inp.placeholder = '“almuerzo 25” · “netflix 15 dólares” (Enter)'; if (inp.value.trim()) { const t = inp.value; inp.value = ''; await crearMovimientoDesdeTexto(t); } },
          onError: (m) => toast(m),
        });
      };
    },
  };
}
