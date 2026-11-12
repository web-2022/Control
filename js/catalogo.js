// ============================================================
// catalogo.js — Listas maestras de la app.
// Disciplinas y entregables típicos de proyectos mineros.
// Las disciplinas se pueden editar desde Ajustes (se guardan en config).
// ============================================================

export const ESTADOS = ['Pendiente', 'En curso', 'Esperando a tercero', 'Bloqueado', 'Hecho', 'Cancelado'];
export const ESTADOS_ABIERTOS = ['Pendiente', 'En curso', 'Esperando a tercero', 'Bloqueado'];
export const PRIORIDADES = ['alta', 'media', 'baja'];
export const ORIGENES = ['Propio', 'Reunión', 'Correo', 'Llamada', 'WhatsApp', 'Cliente'];
export const FASES = ['Conceptual', 'Prefactibilidad (PFS)', 'Factibilidad (FS)', 'Ingeniería de detalle', 'Ejecución / Construcción', 'Operación'];

/**
 * Disciplinas con palabras clave para la detección automática.
 * Las claves están normalizadas (minúsculas, sin tildes) y se evalúan
 * como expresiones regulares. El orden importa: la primera que coincide gana.
 */
export const DISCIPLINAS = [
  { nombre: 'Permisos y ambiental', claves: ['permiso', 'eia\\b', 'eia-?sd', '\\biga\\b', 'its\\b', 'ambiental', 'linea base', 'plan de cierre', 'senace', 'autoridad nacional del agua', 'licencia de uso de agua', 'autorizacion', 'licencia', 'certificacion ambiental', 'dia\\b(?= ambiental)', 'concesion', 'minem', 'osinergmin', 'oefa'] },
  { nombre: 'Costos (CAPEX/OPEX)', claves: ['capex', 'opex', 'costo', 'presupuesto', 'cotizacion', 'metrado', 'apu\\b', 'precio unitario', 'inversion'] },
  { nombre: 'Evaluación económica', claves: ['evaluacion economica', '\\bvan\\b', '\\btir\\b', '\\bnpv\\b', '\\birr\\b', 'flujo de caja', 'modelo financiero', 'payback', 'sensibilidad'] },
  { nombre: 'Geología y recursos', claves: ['geologi', 'recurso', 'reserva', 'sondaje', 'modelo de bloques', 'estimacion', 'logueo', 'muestreo', 'qa/?qc'] },
  { nombre: 'Geomecánica / Geotecnia', claves: ['geomecan', 'geotecn', 'sostenimiento', 'estabilidad', 'talud', '\\brmr\\b', '\\bgsi\\b', 'shotcrete', 'perno', 'subsidencia'] },
  { nombre: 'Hidrogeología y drenaje', claves: ['hidrogeolog', 'drenaje', 'bombeo', 'agua subterranea', 'piezometr', 'napa', 'desagu', 'pozo'] },
  { nombre: 'Hidrología y gestión de aguas', claves: ['hidrolog', 'balance hidrico', 'cuenca', 'precipitacion', 'aguas de contacto', 'tratamiento de agua'] },
  { nombre: 'Ventilación', claves: ['ventilac', 'ventilador', 'caudal de aire', 'circuito de aire', 'chimenea de ventilacion'] },
  { nombre: 'Perforación y voladura', claves: ['voladura', 'perforacion', 'explosiv', 'malla de perforacion', 'fragmentacion'] },
  { nombre: 'Planeamiento minero', claves: ['plan de minado', 'plan de produccion', 'planeamiento', 'secuencia', 'ley de corte', 'cut ?off', 'programa de produccion', 'lom\\b', 'life of mine', 'cronograma de minado', 'tonelaje'] },
  { nombre: 'Diseño de mina', claves: ['metodo de minado', 'diseno', 'tajeo', 'sublevel', 'caving', 'rampa', 'labor', 'galeria', 'crucero', 'pit\\b', 'tajo', 'botadero', 'desmonte', 'stope', 'relleno'] },
  { nombre: 'Relaves y depósitos', claves: ['relave', 'presa', 'deposito de', 'tsf\\b', 'pad de lixiviacion'] },
  { nombre: 'Procesos / Metalurgia', claves: ['metalurg', 'planta', 'flotacion', 'chancado', 'molienda', 'recuperacion', 'lixiviacion', 'concentrado'] },
  { nombre: 'Electricidad y suministro eléctrico', claves: ['electric', 'subestacion', 'linea de transmision', '\\bkv\\b', 'transformador', 'potencia', 'suministro', 'energia', 'tablero', 'media tension', 'coes'] },
  { nombre: 'Movimiento de tierras y civil', claves: ['movimiento de tierras', 'civil', 'plataforma', 'corte y relleno', 'acceso', 'carretera', 'camino', 'obras civiles', 'cimentacion', 'concreto', 'topografi'] },
  { nombre: 'Equipos y mantenimiento', claves: ['equipo', 'flota', 'scoop', 'camion', 'jumbo', 'mantenimiento', 'pala\\b', 'cargador'] },
  { nombre: 'Infraestructura y servicios', claves: ['campamento', 'taller', 'infraestructura', 'almacen', 'polvorin', 'agua potable'] },
  { nombre: 'Seguridad y salud', claves: ['seguridad', '\\bsso\\b', 'iperc', 'incidente', 'accidente', '\\bpets\\b'] },
  { nombre: 'Social y comunidades', claves: ['comunidad', 'social', 'relaciones comunitarias', 'taller participativo', 'convenio'] },
  { nombre: 'Gestión del proyecto', claves: ['cronograma', 'informe', 'reporte', 'propuesta', 'contrato', 'alcance', 'kickoff', 'kick off', 'entregable', 'factura', 'valorizacion', 'orden de servicio'] },
];

/** Entregables típicos por fase de estudio (se pueden cargar a un proyecto). */
export const ENTREGABLES_TIPICOS = {
  'Conceptual': [
    ['Revisión de información existente', 'Gestión del proyecto'],
    ['Modelo de recursos (revisión)', 'Geología y recursos'],
    ['Alternativas de método de minado', 'Diseño de mina'],
    ['Escenarios de producción', 'Planeamiento minero'],
    ['Estimado CAPEX/OPEX ±40–50 %', 'Costos (CAPEX/OPEX)'],
    ['Evaluación económica preliminar', 'Evaluación económica'],
    ['Mapeo de permisos críticos', 'Permisos y ambiental'],
    ['Informe conceptual', 'Gestión del proyecto'],
  ],
  'Prefactibilidad (PFS)': [
    ['Caracterización geomecánica', 'Geomecánica / Geotecnia'],
    ['Selección de método de minado', 'Diseño de mina'],
    ['Plan de minado preliminar (LOM)', 'Planeamiento minero'],
    ['Estudio hidrogeológico preliminar', 'Hidrogeología y drenaje'],
    ['Requerimiento de ventilación', 'Ventilación'],
    ['Alternativas de suministro eléctrico', 'Electricidad y suministro eléctrico'],
    ['Infraestructura y movimiento de tierras (alternativas)', 'Movimiento de tierras y civil'],
    ['Alternativas de depósito de relaves', 'Relaves y depósitos'],
    ['CAPEX/OPEX ±25–30 %', 'Costos (CAPEX/OPEX)'],
    ['Evaluación económica y sensibilidades', 'Evaluación económica'],
    ['Línea base ambiental (inicio)', 'Permisos y ambiental'],
    ['Informe PFS', 'Gestión del proyecto'],
  ],
  'Factibilidad (FS)': [
    ['Modelo geomecánico y diseño de sostenimiento', 'Geomecánica / Geotecnia'],
    ['Diseño de mina definitivo', 'Diseño de mina'],
    ['Plan de minado y programa de producción', 'Planeamiento minero'],
    ['Modelo hidrogeológico y plan de drenaje', 'Hidrogeología y drenaje'],
    ['Diseño del circuito de ventilación', 'Ventilación'],
    ['Ingeniería básica de suministro eléctrico y subestación', 'Electricidad y suministro eléctrico'],
    ['Ingeniería de movimiento de tierras y accesos', 'Movimiento de tierras y civil'],
    ['Flota y equipos', 'Equipos y mantenimiento'],
    ['CAPEX/OPEX ±10–15 %', 'Costos (CAPEX/OPEX)'],
    ['Modelo financiero', 'Evaluación económica'],
    ['EIA / IGA y plan de cierre', 'Permisos y ambiental'],
    ['Cronograma de ejecución', 'Gestión del proyecto'],
    ['Informe FS', 'Gestión del proyecto'],
  ],
  'Ingeniería de detalle': [
    ['Planos de construcción de labores', 'Diseño de mina'],
    ['Especificaciones técnicas de sostenimiento', 'Geomecánica / Geotecnia'],
    ['Diseño de detalle de drenaje y bombeo', 'Hidrogeología y drenaje'],
    ['Ingeniería de detalle de ventilación', 'Ventilación'],
    ['Ingeniería de detalle eléctrica (línea, SE, distribución)', 'Electricidad y suministro eléctrico'],
    ['Planos de movimiento de tierras y obras civiles', 'Movimiento de tierras y civil'],
    ['Metrados y presupuesto de obra', 'Costos (CAPEX/OPEX)'],
    ['Expediente para licitación', 'Gestión del proyecto'],
    ['Permisos de construcción / autorizaciones', 'Permisos y ambiental'],
  ],
  'Ejecución / Construcción': [
    ['Seguimiento de avance físico', 'Gestión del proyecto'],
    ['Control de costos vs presupuesto', 'Costos (CAPEX/OPEX)'],
    ['Plan de seguridad de obra', 'Seguridad y salud'],
    ['Comisionamiento', 'Gestión del proyecto'],
  ],
  'Operación': [
    ['Plan anual de minado', 'Planeamiento minero'],
    ['Reconciliación mina-planta', 'Planeamiento minero'],
    ['Presupuesto anual OPEX', 'Costos (CAPEX/OPEX)'],
  ],
};

/** Colores para identificar proyectos. */
export const COLORES = ['#e8a33d', '#4c9be8', '#5cbf7a', '#d9675b', '#a07be0', '#3fb8b0', '#d4669c', '#8f9bb3'];

/** Detecta la disciplina a partir de un texto (normalizado o no). */
export function detectarDisciplina(texto, disciplinas = DISCIPLINAS) {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const d of disciplinas) {
    for (const c of d.claves || []) {
      try {
        if (new RegExp('\\b' + c, 'i').test(t)) return d.nombre;
      } catch { /* clave mal escrita por el usuario: se ignora */ }
    }
  }
  return null;
}
