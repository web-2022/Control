// Pruebas del intérprete de Caja. Ejecutar: node tests/caja.test.mjs
import { parsearMovimiento, aNumero } from '../js/caja-parser.js';

const ctx = { now: new Date(2026, 10, 13, 12, 0), cuentas: ['BCP', 'Interbank'] };
const casos = [
  ['almuerzo 25', { tipo: 'gasto', monto: 25, moneda: 'PEN', categoria: 'Alimentación', fecha: '2026-11-13', descripcion: 'Almuerzo' }],
  ['netflix 15 dólares', { monto: 15, moneda: 'USD', categoria: 'Suscripciones', descripcion: 'Netflix' }],
  ['ayer taxi 18.50 con yape', { monto: 18.5, categoria: 'Transporte', fecha: '2026-11-12', cuenta: 'Yape / Plin', descripcion: 'Taxi' }],
  ['sueldo 8,500 ingreso', { tipo: 'ingreso', monto: 8500, categoria: 'Sueldo', descripcion: 'Sueldo' }],
  ['cobré 1200 dólares consultoría PFS', { tipo: 'ingreso', monto: 1200, moneda: 'USD', categoria: 'Consultoría / honorarios' }],
  ['gasté 45 soles en menú', { tipo: 'gasto', monto: 45, moneda: 'PEN', categoria: 'Alimentación', descripcion: 'Menú' }],
  ['S/ 120 luz del sur', { monto: 120, categoria: 'Servicios', descripcion: 'Luz del sur' }],
  ['US$ 35.90 hosting', { monto: 35.9, moneda: 'USD', categoria: 'Tecnología' }],
  ['pagué la pensión del colegio 950 con BCP', { monto: 950, categoria: 'Educación', cuenta: 'BCP' }],
  ['clases de matemática 600 ingreso', { tipo: 'ingreso', monto: 600, categoria: 'Clases' }],
  ['supermercado 1.234,50 con tarjeta', { monto: 1234.5, categoria: 'Alimentación', cuenta: 'Tarjeta de crédito' }],
  ['15/11 gasolina 150', { monto: 150, fecha: '2026-11-15', categoria: 'Transporte' }],
  ['alquiler 2 mil', { monto: 2000, categoria: 'Vivienda' }],
  ['farmacia 32.80 efectivo', { monto: 32.8, categoria: 'Salud', cuenta: 'Efectivo', descripcion: 'Farmacia' }],
  ['regalo cumpleaños de mi hijo 80', { monto: 80, categoria: 'Familia' }],
  ['me pagaron 3500 de honorarios', { tipo: 'ingreso', monto: 3500, categoria: 'Consultoría / honorarios' }],
];
let ok = 0;
for (const [f, e] of casos) {
  const r = parsearMovimiento(f, ctx);
  const mal = Object.entries(e).filter(([k, v]) => r[k] !== v);
  if (mal.length) { console.log(`✗ "${f}"`); mal.forEach(([k, v]) => console.log(`    ${k}: esperado ${JSON.stringify(v)}, obtenido ${JSON.stringify(r[k])}`)); }
  else { ok++; console.log(`✓ "${f}" → ${r.tipo} ${r.moneda} ${r.monto} · ${r.categoria} · ${r.descripcion}`); }
}
// Con cuentas y deudas registradas
const ctx2 = { now: new Date(2026, 10, 13, 12, 0), detalle: [
  { nombre: 'Efectivo', tipo: 'liquida' }, { nombre: 'BCP', tipo: 'liquida' }, { nombre: 'Interbank', tipo: 'liquida' },
  { nombre: 'Visa BCP', tipo: 'tarjeta' }, { nombre: 'Hipoteca', tipo: 'prestamo' }] };
const casos2 = [
  ['pagué la cuota de la hipoteca 5200 desde BCP', { tipo: 'pago', monto: 5200, destino: 'Hipoteca', cuenta: 'BCP' }],
  ['pagué la tarjeta 1500 con interbank', { tipo: 'pago', monto: 1500, destino: 'Visa BCP', cuenta: 'Interbank' }],
  ['pasé 500 del BCP a efectivo', { tipo: 'transferencia', monto: 500, cuenta: 'BCP', destino: 'Efectivo' }],
  ['transferí 1000 de interbank al BCP', { tipo: 'transferencia', monto: 1000, cuenta: 'Interbank', destino: 'BCP' }],
  ['retiré 300 del BCP', { tipo: 'transferencia', monto: 300, cuenta: 'BCP', destino: 'Efectivo' }],
  ['almuerzo 25 con la Visa BCP', { tipo: 'gasto', monto: 25, cuenta: 'Visa BCP', categoria: 'Alimentación' }],
  ['taxi 15 efectivo', { tipo: 'gasto', monto: 15, cuenta: 'Efectivo' }],
];
for (const [f, e] of casos2) {
  const r = parsearMovimiento(f, ctx2);
  const mal = Object.entries(e).filter(([k, v]) => r[k] !== v);
  if (mal.length) { console.log(`✗ "${f}"`); mal.forEach(([k, v]) => console.log(`    ${k}: esperado ${JSON.stringify(v)}, obtenido ${JSON.stringify(r[k])}`)); }
  else { ok++; console.log(`✓ "${f}" → ${r.tipo} ${r.monto} ${r.cuenta}→${r.destino} · ${r.descripcion}`); }
}
// Varios bancos: cuentas y tarjetas agrupadas por banco
const ctx3 = { now: new Date(2026, 10, 13, 12, 0), detalle: [
  { nombre: 'Efectivo', tipo: 'liquida' },
  { nombre: 'Ahorros BCP', tipo: 'liquida', alias: ['BCP', 'cuenta BCP', 'ahorros BCP'] },
  { nombre: 'Sueldo Interbank', tipo: 'liquida', alias: ['Interbank', 'cuenta Interbank'] },
  { nombre: 'Visa BCP', tipo: 'tarjeta', alias: ['tarjeta BCP', 'visa BCP', 'credito BCP'] },
  { nombre: 'Tarjeta Interbank', tipo: 'tarjeta', alias: ['tarjeta Interbank', 'visa Interbank', 'credito Interbank'] },
  { nombre: 'Hipoteca', tipo: 'prestamo' }] };
const casos3 = [
  ['almuerzo 40 con tarjeta interbank', { tipo: 'gasto', cuenta: 'Tarjeta Interbank', categoria: 'Alimentación', descripcion: 'Almuerzo' }],
  ['gasolina 150 con BCP', { tipo: 'gasto', cuenta: 'Ahorros BCP' }],
  ['honorarios 3000 a interbank ingreso', { tipo: 'ingreso', cuenta: 'Sueldo Interbank', categoria: 'Consultoría / honorarios' }],
  ['pagué la tarjeta BCP 1500 desde interbank', { tipo: 'pago', destino: 'Visa BCP', cuenta: 'Sueldo Interbank' }],
  ['pagué la cuota de la hipoteca 5200 desde BCP', { tipo: 'pago', destino: 'Hipoteca', cuenta: 'Ahorros BCP' }],
  ['transferí 1000 de interbank al BCP', { tipo: 'transferencia', cuenta: 'Sueldo Interbank', destino: 'Ahorros BCP' }],
  ['cachuelo 800 ingreso', { tipo: 'ingreso', categoria: 'Trabajos extra' }],
  ['almuerzo 30 con cuenta ahorros', { tipo: 'gasto', cuenta: 'Ahorros BCP', descripcion: 'Almuerzo' }],
  ['taxi 20 con ahorros', { cuenta: 'Ahorros BCP', categoria: 'Transporte' }],
  ['menú 15 de mi cuenta de ahorros', { cuenta: 'Ahorros BCP' }],
  ['clases 600 a sueldo ingreso', { tipo: 'ingreso', cuenta: 'Sueldo Interbank' }],
];
for (const [f, e] of casos3) {
  const r = parsearMovimiento(f, ctx3);
  const mal = Object.entries(e).filter(([k, v]) => r[k] !== v);
  if (mal.length) { console.log(`✗ "${f}"`); mal.forEach(([k, v]) => console.log(`    ${k}: esperado ${JSON.stringify(v)}, obtenido ${JSON.stringify(r[k])}`)); }
  else { ok++; console.log(`✓ "${f}" → ${r.tipo} ${r.monto} ${r.cuenta}→${r.destino} · ${r.categoria}`); }
}
const nums = [['1,234.50', 1234.5], ['1.234,50', 1234.5], ['45,5', 45.5], ['1,500', 1500], ['1.500', 1500], ['18.50', 18.5], ['8,500', 8500]];
for (const [t, v] of nums) { if (aNumero(t) === v) ok++; else console.log(`✗ aNumero(${t}) = ${aNumero(t)} (esperado ${v})`); }
const total = casos.length + casos2.length + casos3.length + nums.length;
console.log(`\n${ok}/${total} pruebas correctas`);
if (ok !== total) process.exit(1);
