// ============================================================
// config.js — Configuración pública de la app.
// El Client ID de Google NO es secreto: identifica a la app ante
// Google y solo funciona desde el dominio autorizado
// (https://web-2022.github.io). Se obtiene en Google Cloud Console →
// APIs y servicios → Credenciales → ID de cliente OAuth (Aplicación web).
// ============================================================
export const GOOGLE_CLIENT_ID = '906324648663-96a20bdnhr0sq2vsfnjuptovd0v5ee39.apps.googleusercontent.com';

// Permisos que pide la app:
//  - drive.file: SOLO los archivos que la propia app crea (no ve el resto del Drive)
//  - openid email profile: saber quién inició sesión (correo y nombre)
export const GOOGLE_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

// Nombre de la hoja que se crea en el Drive de cada usuario
export const NOMBRE_HOJA = 'Control – Mis datos';

// Dirección pública de la app (para el botón Compartir)
export const URL_APP = 'https://web-2022.github.io/Control/';

/** Versión publicada (igual que en sw.js). */
export const VERSION_APP = '1.9.4';
