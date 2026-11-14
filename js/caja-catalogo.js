// ============================================================
// caja-catalogo.js — Categorías y cuentas para el módulo Caja
// (finanzas personales). Editables desde la propia Caja.
// ============================================================

export const MONEDAS = { PEN: { simbolo: 'S/', nombre: 'Soles' }, USD: { simbolo: 'US$', nombre: 'Dólares' } };

/** Categorías con palabras clave (minúsculas, sin tildes) para detectarlas al escribir. */
export const CATEGORIAS_GASTO = [
  { nombre: 'Alimentación', icono: '🍽️', claves: ['almuerzo', 'desayuno', 'cena', 'menu', 'comida', 'restaurante', 'pollo', 'chifa', 'cafe', 'mercado', 'supermercado', 'plaza vea', 'tottus', 'wong', 'metro', 'bodega', 'panaderia', 'delivery', 'rappi', 'pedidosya', 'snack', 'fruta', 'ceviche'] },
  { nombre: 'Transporte', icono: '🚕', claves: ['taxi', 'uber', 'cabify', 'indriver', 'didi', 'bus', 'combi', 'metropolitano', 'pasaje', 'gasolina', 'combustible', 'grifo', 'peaje', 'estacionamiento', 'cochera', 'mecanico', 'soat', 'revision tecnica', 'lavado de auto', 'llanta'] },
  { nombre: 'Vivienda', icono: '🏠', claves: ['alquiler', 'renta', 'hipoteca', 'mantenimiento', 'condominio', 'arbitrios', 'predial', 'reparacion', 'gasfitero', 'electricista', 'muebles'] },
  { nombre: 'Servicios', icono: '💡', claves: ['luz', 'agua', 'internet', 'telefono', 'celular', 'plan movil', 'cable', 'gas', 'sedapal', 'enel', 'luz del sur', 'claro', 'movistar', 'entel', 'bitel'] },
  { nombre: 'Salud', icono: '💊', claves: ['farmacia', 'medicina', 'medico', 'doctor', 'clinica', 'consulta', 'analisis', 'dentista', 'inkafarma', 'mifarma', 'lentes', 'eps'] },
  { nombre: 'Educación', icono: '🎓', claves: ['colegio', 'pension', 'universidad', 'curso', 'matricula', 'libro', 'utiles', 'academia', 'udemy', 'clase', 'taller', 'certificacion'] },
  { nombre: 'Suscripciones', icono: '📺', claves: ['netflix', 'spotify', 'youtube', 'disney', 'hbo', 'max', 'prime', 'icloud', 'google one', 'chatgpt', 'claude', 'suscripcion', 'membresia', 'gimnasio', 'gym'] },
  { nombre: 'Entretenimiento', icono: '🎬', claves: ['cine', 'concierto', 'salida', 'fiesta', 'bar', 'juego', 'entrada', 'paseo', 'ajedrez'] },
  { nombre: 'Ropa y compras', icono: '🛍️', claves: ['ropa', 'zapatillas', 'zapatos', 'polo', 'pantalon', 'saga', 'ripley', 'oechsle', 'compra', 'amazon', 'mercado libre', 'aliexpress', 'falabella'] },
  { nombre: 'Tecnología', icono: '💻', claves: ['laptop', 'computadora', 'monitor', 'teclado', 'mouse', 'audifonos', 'cargador', 'software', 'hosting', 'dominio'] },
  { nombre: 'Deudas y tarjetas', icono: '💳', claves: ['tarjeta', 'cuota', 'prestamo', 'credito', 'deuda', 'interes'] },
  { nombre: 'Seguros', icono: '🛡️', claves: ['seguro', 'rimac', 'pacifico', 'mapfre', 'la positiva'] },
  { nombre: 'Impuestos y trámites', icono: '🧾', claves: ['impuesto', 'sunat', 'tramite', 'notaria', 'reniec', 'multa', 'papeleta'] },
  { nombre: 'Familia', icono: '👨‍👩‍👦', claves: ['hijo', 'hija', 'propina', 'mesada', 'cumpleanos', 'regalo', 'juguete'] },
  { nombre: 'Viajes', icono: '✈️', claves: ['viaje', 'pasaje aereo', 'vuelo', 'hotel', 'airbnb', 'latam', 'sky', 'hospedaje'] },
  { nombre: 'Mascotas', icono: '🐾', claves: ['veterinario', 'mascota', 'perro', 'gato', 'croquetas'] },
  { nombre: 'Donaciones', icono: '🤝', claves: ['donacion', 'ofrenda', 'diezmo', 'colecta'] },
  { nombre: 'Otros gastos', icono: '📦', claves: [] },
];

export const CATEGORIAS_INGRESO = [
  { nombre: 'Sueldo', icono: '💼', claves: ['sueldo', 'salario', 'quincena', 'planilla', 'gratificacion', 'cts', 'bono', 'utilidades'] },
  { nombre: 'Consultoría / honorarios', icono: '📐', claves: ['honorarios', 'consultoria', 'recibo por honorarios', 'asesoria', 'proyecto', 'servicio'] },
  { nombre: 'Clases', icono: '📚', claves: ['clase', 'clases', 'alumno', 'alumnos', 'academia', 'tutoria', 'preparacion'] },
  { nombre: 'Ventas', icono: '🏷️', claves: ['venta', 'vendi'] },
  { nombre: 'Alquileres', icono: '🔑', claves: ['alquiler', 'renta', 'inquilino'] },
  { nombre: 'Inversiones', icono: '📈', claves: ['dividendo', 'interes', 'plazo fijo', 'fondo mutuo', 'acciones', 'inversion'] },
  { nombre: 'Reembolsos', icono: '↩️', claves: ['reembolso', 'devolucion', 'viaticos'] },
  { nombre: 'Trabajos extra', icono: '🛠️', claves: ['cachuelo', 'extra', 'freelance', 'encargo', 'trabajo extra'] },
  { nombre: 'Comisiones', icono: '🤝', claves: ['comision', 'comisiones', 'referido'] },
  { nombre: 'Apoyo familiar', icono: '👨‍👩‍👦', claves: ['apoyo', 'me dieron', 'me regalaron', 'regalo recibido', 'herencia'] },
  { nombre: 'Pensión / jubilación', icono: '🧓', claves: ['jubilacion', 'onp', 'afp', 'pension de jubilacion'] },
  { nombre: 'Otros ingresos', icono: '💰', claves: [] },
];

/** Bancos y cajas usuales en Perú (se puede escribir cualquier otro). */
export const BANCOS = ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'BanBif', 'Banco Pichincha', 'Banco de la Nación', 'Mibanco', 'Banco Falabella', 'Banco Ripley', 'Caja Arequipa', 'Caja Huancayo', 'Caja Piura', 'Caja Cusco', 'Caja Trujillo', 'Banco GNB', 'Citibank'];

export const CUENTAS_DEFECTO = ['Efectivo', 'Cuenta sueldo', 'Tarjeta de crédito', 'Yape / Plin'];

/** Detecta la categoría por palabras clave. */
export function detectarCategoria(texto, tipo, extras = []) {
  const t = ' ' + (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + ' ';
  const lista = [...extras, ...(tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO)];
  for (const c of lista) {
    for (const k of c.claves || []) {
      if (new RegExp(`[^a-z]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t)) return c.nombre;
    }
  }
  return tipo === 'ingreso' ? 'Otros ingresos' : 'Otros gastos';
}

export const iconoCategoria = (nombre) =>
  [...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO].find((c) => c.nombre === nombre)?.icono || '•';
