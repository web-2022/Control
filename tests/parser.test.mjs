// Pruebas del parser de lenguaje natural.
// Ejecutar:  node tests/parser.test.mjs
// Fecha de referencia fija: jueves 12/11/2026 a las 12:00.
import { parsear } from '../js/parser.js';

const ctx = {
  now: new Date(2026, 10, 12, 12, 0),
  personas: [
    { id: 'p1', nombre: 'Juan Pérez' },
    { id: 'p2', nombre: 'María Quispe' },
    { id: 'p3', nombre: 'Carlos Rojas' },
    { id: 'p4', nombre: 'Ana Torres' },
    { id: 'p5', nombre: 'Luis Mendoza' },
  ],
  proyectos: [
    { id: 'h', nombre: 'Huaylla – PFS Subterránea', codigo: 'Huaylla' },
    { id: 'c', nombre: 'Ampliación Tajo Ccollpa', codigo: 'Ccollpa' },
    { id: 'l', nombre: 'Línea 60 kV y Subestación', codigo: 'L60' },
  ],
};

const casos = [
  ['mañana 10am revisar costos CAPEX con Ana, prioridad alta',
    { fecha: '2026-11-13', hora: '10:00', responsableId: 'p4', prioridad: 'alta', disciplina: 'Costos (CAPEX/OPEX)', titulo: 'Revisar costos CAPEX' }],
  ['Enviar informe de ventilación a @Juan el viernes',
    { fecha: '2026-11-13', responsableId: 'p1', disciplina: 'Ventilación', titulo: 'Enviar informe de ventilación' }],
  ['#Huaylla revisar secuencia de minado 15/11 !alta',
    { proyectoId: 'h', fecha: '2026-11-15', prioridad: 'alta', disciplina: 'Planeamiento minero', titulo: 'Revisar secuencia de minado' }],
  ['llamar a Carlos por bombeo de drenaje a las 3',
    { hora: '15:00', fecha: '2026-11-12', responsableId: null, disciplina: 'Hidrogeología y drenaje', titulo: 'Llamar a Carlos por bombeo de drenaje' }],
  ['en 3 días entregar cronograma del estudio de factibilidad',
    { fecha: '2026-11-15', titulo: 'Entregar cronograma del estudio de factibilidad' }],
  ['la próxima semana coordinar línea base ambiental con María',
    { fecha: '2026-11-16', responsableId: 'p2', disciplina: 'Permisos y ambiental', titulo: 'Coordinar línea base ambiental' }],
  ['20 de noviembre presentar evaluación económica VAN TIR',
    { fecha: '2026-11-20', disciplina: 'Evaluación económica', titulo: 'Presentar evaluación económica VAN TIR' }],
  ['pasado mañana 9:30 kickoff línea de transmisión 60 kV #L60',
    { fecha: '2026-11-14', hora: '09:30', proyectoId: 'l', disciplina: 'Electricidad y suministro eléctrico', titulo: 'Kickoff línea de transmisión 60 kV' }],
  ['urgente revisar estabilidad de taludes del tajo',
    { prioridad: 'alta', fecha: null, disciplina: 'Geomecánica / Geotecnia', titulo: 'Revisar estabilidad de taludes del tajo' }],
  ['esperando respuesta de Luis sobre cotización de transformador',
    { esperando: true, responsableId: 'p5', disciplina: 'Costos (CAPEX/OPEX)' }],
  ['hoy 4 pm revisar balance hídrico',
    { fecha: '2026-11-12', hora: '16:00', disciplina: 'Hidrología y gestión de aguas', titulo: 'Revisar balance hídrico' }],
  ['fin de mes cerrar presupuesto OPEX #Ccollpa',
    { fecha: '2026-11-30', proyectoId: 'c', disciplina: 'Costos (CAPEX/OPEX)', titulo: 'Cerrar presupuesto OPEX' }],
  ['lunes a las 8 de la mañana revisar plan de cierre',
    { fecha: '2026-11-16', hora: '08:00', disciplina: 'Permisos y ambiental', titulo: 'Revisar plan de cierre' }],
  ['Juan debe enviar el modelo de bloques actualizado el 18',
    { responsableId: 'p1', fecha: '2026-11-18', disciplina: 'Geología y recursos', titulo: 'Juan debe enviar el modelo de bloques actualizado' }],
  ['encargar a María el análisis de sostenimiento para el 25/11',
    { responsableId: 'p2', fecha: '2026-11-25', disciplina: 'Geomecánica / Geotecnia', titulo: 'Encargar el análisis de sostenimiento' }],
  ['revisar plan de voladura',
    { fecha: null, hora: null, disciplina: 'Perforación y voladura', titulo: 'Revisar plan de voladura' }],
  ['mañana en la tarde llamar a SENACE por el EIA',
    { fecha: '2026-11-13', hora: '15:00', responsableId: null, disciplina: 'Permisos y ambiental', titulo: 'Llamar a SENACE por el EIA' }],
  ['a las 10:00 a. m. revisar movimiento de tierras de la plataforma',
    { fecha: '2026-11-12', hora: '10:00', disciplina: 'Movimiento de tierras y civil', titulo: 'Revisar movimiento de tierras de la plataforma' }],
  ['proyecto huaylla actualizar capex',
    { proyectoId: 'h', disciplina: 'Costos (CAPEX/OPEX)', titulo: 'Actualizar capex' }],
  ['pedirle a Carlos los datos de piezómetros para el jueves',
    { responsableId: 'p3', fecha: '2026-11-19', disciplina: 'Hidrogeología y drenaje', titulo: 'Pedirle los datos de piezómetros' }],
  ['revisar diseño de rampa responsable Pedro !media',
    { responsableNombre: 'Pedro', responsableId: null, prioridad: 'media', disciplina: 'Diseño de mina', titulo: 'Revisar diseño de rampa' }],
  ['Reunión con el cliente el 3 de diciembre a las 11',
    { fecha: '2026-12-03', hora: '11:00', titulo: 'Reunión con el cliente' }],
];

let ok = 0;
for (const [frase, esperado] of casos) {
  const r = parsear(frase, ctx);
  const fallos = Object.entries(esperado).filter(([k, v]) => r[k] !== v);
  if (fallos.length) {
    console.log(`✗ "${frase}"`);
    for (const [k, v] of fallos) console.log(`    ${k}: esperado ${JSON.stringify(v)}, obtenido ${JSON.stringify(r[k])}`);
  } else {
    ok++;
    console.log(`✓ "${frase}"  →  ${r.titulo}`);
  }
}
console.log(`\n${ok}/${casos.length} pruebas correctas`);
if (ok !== casos.length) process.exit(1);
