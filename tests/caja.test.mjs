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
const nums = [['1,234.50', 1234.5], ['1.234,50', 1234.5], ['45,5', 45.5], ['1,500', 1500], ['1.500', 1500], ['18.50', 18.5], ['8,500', 8500]];
for (const [t, v] of nums) { if (aNumero(t) === v) ok++; else console.log(`✗ aNumero(${t}) = ${aNumero(t)} (esperado ${v})`); }
const total = casos.length + nums.length;
console.log(`\n${ok}/${total} pruebas correctas`);
if (ok !== total) process.exit(1);
