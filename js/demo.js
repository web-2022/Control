// ============================================================
// demo.js — Datos de ejemplo realistas (proyectos mineros).
// Las fechas se calculan respecto a HOY para que siempre haya
// vencidos, pendientes de hoy y reuniones próximas.
// ============================================================
import * as store from './store.js';
import { hoy, addDias, uid, nowIso } from './util.js';

export async function cargarDemo() {
  const H = hoy();
  const d = (n) => addDias(H, n);

  const personas = [
    { id: uid(), nombre: 'Juan Pérez', rol: 'Ing. de Planeamiento Senior', disciplina: 'Planeamiento minero', email: 'juan.perez@ejemplo.com' },
    { id: uid(), nombre: 'María Quispe', rol: 'Especialista Geomecánica', disciplina: 'Geomecánica / Geotecnia', email: 'maria.quispe@ejemplo.com' },
    { id: uid(), nombre: 'Carlos Rojas', rol: 'Hidrogeólogo', disciplina: 'Hidrogeología y drenaje', email: 'carlos.rojas@ejemplo.com' },
    { id: uid(), nombre: 'Ana Torres', rol: 'Ing. de Costos', disciplina: 'Costos (CAPEX/OPEX)', email: 'ana.torres@ejemplo.com' },
    { id: uid(), nombre: 'Luis Mendoza', rol: 'Ing. Electricista', disciplina: 'Electricidad y suministro eléctrico', email: 'luis.mendoza@ejemplo.com' },
  ];
  const [juan, maria, carlos, ana, luis] = personas.map((p) => p.id);

  const proyectos = [
    {
      id: uid(), nombre: 'Huaylla – PFS Subterránea', codigo: 'Huaylla', cliente: 'Minera Andina S.A.', fase: 'Prefactibilidad (PFS)', color: '#e8a33d', activo: true,
      descripcion: 'Estudio de prefactibilidad, mina subterránea polimetálica 3,000 t/d, método sublevel stoping con relleno en pasta.',
      disciplinas: ['Geomecánica / Geotecnia', 'Diseño de mina', 'Planeamiento minero', 'Hidrogeología y drenaje', 'Ventilación', 'Costos (CAPEX/OPEX)', 'Evaluación económica'],
      hitos: [
        { id: uid(), nombre: 'Caracterización geomecánica', fecha: d(-20), hecho: true, disciplina: 'Geomecánica / Geotecnia' },
        { id: uid(), nombre: 'Selección de método de minado', fecha: d(-5), hecho: true, disciplina: 'Diseño de mina' },
        { id: uid(), nombre: 'Plan de minado preliminar (LOM)', fecha: d(10), hecho: false, disciplina: 'Planeamiento minero' },
        { id: uid(), nombre: 'Estudio hidrogeológico preliminar', fecha: d(14), hecho: false, disciplina: 'Hidrogeología y drenaje' },
        { id: uid(), nombre: 'CAPEX/OPEX ±25–30 %', fecha: d(25), hecho: false, disciplina: 'Costos (CAPEX/OPEX)' },
        { id: uid(), nombre: 'Informe PFS', fecha: d(45), hecho: false, disciplina: 'Gestión del proyecto' },
      ],
    },
    {
      id: uid(), nombre: 'Ampliación Tajo Ccollpa – FS', codigo: 'Ccollpa', cliente: 'Cía. Minera del Sur', fase: 'Factibilidad (FS)', color: '#4c9be8', activo: true,
      descripcion: 'Factibilidad de ampliación del tajo abierto, nuevo botadero de desmonte y recrecimiento de depósito de relaves.',
      disciplinas: ['Diseño de mina', 'Geomecánica / Geotecnia', 'Relaves y depósitos', 'Movimiento de tierras y civil', 'Permisos y ambiental', 'Costos (CAPEX/OPEX)'],
      hitos: [
        { id: uid(), nombre: 'Diseño de fases del tajo', fecha: d(-3), hecho: false, disciplina: 'Diseño de mina' },
        { id: uid(), nombre: 'Estabilidad de taludes (FS)', fecha: d(7), hecho: false, disciplina: 'Geomecánica / Geotecnia' },
        { id: uid(), nombre: 'Ingeniería de movimiento de tierras', fecha: d(20), hecho: false, disciplina: 'Movimiento de tierras y civil' },
        { id: uid(), nombre: 'Modificación de EIA (ITS)', fecha: d(60), hecho: false, disciplina: 'Permisos y ambiental' },
      ],
    },
    {
      id: uid(), nombre: 'Línea 60 kV y Subestación – Detalle', codigo: 'L60', cliente: 'Minera Andina S.A.', fase: 'Ingeniería de detalle', color: '#5cbf7a', activo: true,
      descripcion: 'Ingeniería de detalle de línea de transmisión 60 kV (18 km) y subestación 60/22.9 kV para suministro de la mina.',
      disciplinas: ['Electricidad y suministro eléctrico', 'Movimiento de tierras y civil', 'Permisos y ambiental', 'Costos (CAPEX/OPEX)'],
      hitos: [
        { id: uid(), nombre: 'Estudio de coordinación de protecciones', fecha: d(-8), hecho: true, disciplina: 'Electricidad y suministro eléctrico' },
        { id: uid(), nombre: 'Planos de cimentación de torres', fecha: d(5), hecho: false, disciplina: 'Movimiento de tierras y civil' },
        { id: uid(), nombre: 'Expediente para licitación', fecha: d(30), hecho: false, disciplina: 'Gestión del proyecto' },
      ],
    },
  ];
  for (const p of proyectos) p.avance = Math.round((p.hitos.filter((h) => h.hecho).length / p.hitos.length) * 100);
  const [huay, ccol, l60] = proyectos.map((p) => p.id);

  const reunionSemanal = uid();
  const reuniones = [
    { id: reunionSemanal, titulo: 'Coordinación semanal PFS Huaylla', fecha: H, hora: '09:00', duracion: 60, proyectoId: huay, participantes: [juan, maria, carlos, ana], objetivo: 'Revisar avance por disciplina y bloqueos', estado: 'Programada', minuta: '' },
    { id: uid(), titulo: 'Revisión geotécnica taludes Ccollpa', fecha: H, hora: '15:00', duracion: 45, proyectoId: ccol, participantes: [maria], objetivo: 'Validar factores de seguridad por sector', estado: 'Programada', minuta: '' },
    { id: uid(), titulo: 'Kickoff ingeniería de detalle L60', fecha: d(1), hora: '10:00', duracion: 90, proyectoId: l60, participantes: [luis, ana], objetivo: 'Alcance, cronograma y entregables', estado: 'Programada', minuta: '' },
    { id: uid(), titulo: 'Comité con cliente – Minera Andina', fecha: d(3), hora: '11:00', duracion: 60, proyectoId: huay, participantes: [juan], objetivo: 'Presentar método de minado seleccionado', estado: 'Programada', minuta: '' },
    { id: uid(), titulo: 'Coordinación semanal PFS Huaylla', fecha: d(-7), hora: '09:00', duracion: 60, proyectoId: huay, participantes: [juan, maria, carlos, ana], objetivo: 'Avance semanal', estado: 'Realizada',
      minuta: 'Se confirmó sublevel stoping como método base. Pendiente validar dilución con geomecánica. Hidrogeología requiere data de piezómetros del cliente.' },
  ];

  const P = (o) => ({ estado: 'Pendiente', prioridad: 'media', origen: 'Propio', inbox: false, historial: [{ t: nowIso(), m: 'Creado (ejemplo)' }], ...o });
  const pendientes = [
    P({ titulo: 'Validar dilución y recuperación por tajeo', responsable: maria, proyectoId: huay, disciplina: 'Geomecánica / Geotecnia', fecha: d(-2), prioridad: 'alta', origen: 'Reunión' }),
    P({ titulo: 'Solicitar data de piezómetros al cliente', responsable: carlos, proyectoId: huay, disciplina: 'Hidrogeología y drenaje', fecha: d(-4), estado: 'Esperando a tercero', origen: 'Reunión', notas: 'El cliente indicó que la envía su área de medio ambiente.' }),
    P({ titulo: 'Actualizar secuencia de minado con nuevo cut-off', responsable: juan, proyectoId: huay, disciplina: 'Planeamiento minero', fecha: H, hora: '17:00', prioridad: 'alta', estado: 'En curso' }),
    P({ titulo: 'Revisar estimado CAPEX de rampa principal', responsable: '', proyectoId: huay, disciplina: 'Costos (CAPEX/OPEX)', fecha: H, prioridad: 'alta' }),
    P({ titulo: 'Preparar presentación para comité del cliente', responsable: '', proyectoId: huay, disciplina: 'Gestión del proyecto', fecha: d(2), prioridad: 'alta' }),
    P({ titulo: 'Requerimiento de aire por equipos diésel', responsable: juan, proyectoId: huay, disciplina: 'Ventilación', fecha: d(5) }),
    P({ titulo: 'Análisis de estabilidad sector norte', responsable: maria, proyectoId: ccol, disciplina: 'Geomecánica / Geotecnia', fecha: d(-1), prioridad: 'alta', estado: 'Bloqueado', notas: 'Falta logueo geotécnico de sondajes 2025.' }),
    P({ titulo: 'Metrado de movimiento de tierras del botadero', responsable: ana, proyectoId: ccol, disciplina: 'Movimiento de tierras y civil', fecha: d(4) }),
    P({ titulo: 'Coordinar con consultora ambiental el alcance del ITS', responsable: '', proyectoId: ccol, disciplina: 'Permisos y ambiental', fecha: d(6), origen: 'Llamada' }),
    P({ titulo: 'Esperar cotización de transformador 60/22.9 kV', responsable: luis, proyectoId: l60, disciplina: 'Electricidad y suministro eléctrico', fecha: d(-3), estado: 'Esperando a tercero', origen: 'Correo' }),
    P({ titulo: 'Revisar planos de cimentación de torres', responsable: '', proyectoId: l60, disciplina: 'Movimiento de tierras y civil', fecha: d(1), hora: '15:00' }),
    P({ titulo: 'Enviar valorización de octubre', responsable: '', proyectoId: l60, disciplina: 'Gestión del proyecto', fecha: d(-6), estado: 'Hecho', cerrado: d(-7) + 'T15:00:00.000Z' }),
    P({ titulo: 'Cerrar comentarios del cliente al informe conceptual', responsable: juan, proyectoId: huay, disciplina: 'Gestión del proyecto', fecha: d(-10), estado: 'Hecho', cerrado: d(-11) + 'T15:00:00.000Z' }),
    P({ titulo: 'Enviar matriz de riesgos geotécnicos', responsable: maria, proyectoId: ccol, disciplina: 'Geomecánica / Geotecnia', fecha: d(-5), estado: 'Hecho', cerrado: d(-3) + 'T15:00:00.000Z' }),
    P({ titulo: 'Llamar a proveedor de bombas sumergibles', inbox: true, disciplina: 'Hidrogeología y drenaje' }),
    P({ titulo: 'Idea: plantilla estándar de informe semanal', inbox: true, prioridad: 'baja' }),
  ];

  for (const p of pendientes) p.fase = proyectos.find((x) => x.id === p.proyectoId)?.fase || '';
  // Comentarios de avance de ejemplo
  const t = (dias, hh) => { const f = new Date(); f.setDate(f.getDate() + dias); f.setHours(hh, 15, 0, 0); return f.toISOString(); };
  pendientes[1].comentarios = [
    { t: t(-4, 10), texto: 'Se pidió por correo al área de medio ambiente del cliente.' },
    { t: t(-1, 16), texto: 'Recordé por WhatsApp; ofrecen enviarlo esta semana.' },
  ];
  pendientes[2].comentarios = [{ t: t(0, 11), texto: 'Cut-off actualizado a 4.2 % ZnEq; falta correr la secuencia de los tajeos del nivel 3.' }];
  pendientes[6].comentarios = [{ t: t(-1, 9), texto: 'Bloqueado: el cliente aún no entrega el logueo geotécnico de los sondajes 2025.' }];

  const acuerdos = [
    { id: uid(), reunionId: reuniones[4].id, texto: 'Validar dilución con geomecánica', responsable: maria, fecha: d(-2), pendienteId: pendientes[0].id },
    { id: uid(), reunionId: reuniones[4].id, texto: 'Solicitar data de piezómetros al cliente', responsable: carlos, fecha: d(-4), pendienteId: pendientes[1].id },
  ];
  pendientes[0].reunionId = reuniones[4].id;
  pendientes[1].reunionId = reuniones[4].id;

  await store.guardarVarios('personas', personas);
  await store.guardarVarios('proyectos', proyectos);
  await store.guardarVarios('reuniones', reuniones);
  await store.guardarVarios('pendientes', pendientes);
  await store.guardarVarios('acuerdos', acuerdos);
  const mv = (dias, tipo, monto, moneda, categoria, descripcion, cuenta) => ({ fecha: d(dias), tipo, monto, moneda, categoria, descripcion, cuenta });
  await store.guardarVarios('movimientos', [
    mv(-12, 'ingreso', 8500, 'PEN', 'Sueldo', 'Sueldo noviembre', 'Cuenta sueldo'),
    mv(-9, 'ingreso', 1200, 'USD', 'Consultoría / honorarios', 'Revisión plan de minado', 'Cuenta sueldo'),
    mv(-8, 'gasto', 1800, 'PEN', 'Vivienda', 'Alquiler', 'Cuenta sueldo'),
    mv(-7, 'gasto', 189.9, 'PEN', 'Servicios', 'Internet y celular', 'Tarjeta de crédito'),
    mv(-5, 'gasto', 950, 'PEN', 'Educación', 'Pensión del colegio', 'Cuenta sueldo'),
    mv(-3, 'gasto', 15.99, 'USD', 'Suscripciones', 'Netflix', 'Tarjeta de crédito'),
    mv(-2, 'gasto', 320.5, 'PEN', 'Alimentación', 'Supermercado', 'Tarjeta de crédito'),
    mv(-1, 'gasto', 18.5, 'PEN', 'Transporte', 'Taxi a la oficina', 'Yape / Plin'),
    mv(0, 'gasto', 25, 'PEN', 'Alimentación', 'Almuerzo', 'Efectivo'),
  ]);
  await store.guardarVarios('diario', [{
    id: `dia-${d(-1)}`, fecha: d(-1),
    comentario: 'Día cargado de reuniones con el cliente. Se definió el método de minado base; el riesgo principal sigue siendo la data geotécnica pendiente. Mañana priorizar la secuencia de minado.',
    hechos: [{ id: pendientes[13].id, titulo: pendientes[13].titulo }],
    avances: [{ id: pendientes[1].id, titulo: pendientes[1].titulo, texto: 'Recordé por WhatsApp; ofrecen enviarlo esta semana.' }],
    movidos: [], quedaron: [], pendientesAbiertos: 13,
  }]);
  store.guardarConfig({ demo: true });
}
