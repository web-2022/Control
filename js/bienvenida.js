// ============================================================
// bienvenida.js — Página de inicio limpia para usuarios nuevos
// (por ejemplo, un colega que recibió el enlace compartido) y
// el flujo "Continuar con Google".
// ============================================================
import * as store from './store.js';
import * as G from './google.js';
import { sincronizar, encolarTodo } from './sync.js';
import { cargarDemo } from './demo.js';
import { toast, confirmar } from './ui.js';
import { ic } from './iconos.js';
import { esc } from './util.js';

/** Inicia sesión con Google, crea/encuentra la hoja y sincroniza. Llamar desde un clic. */
export async function conectarGoogle() {
  const perfil = await G.iniciarSesion();
  const cfg = store.config();
  const otraCuenta = cfg.googleEmail && cfg.googleEmail !== perfil.email;
  if (otraCuenta) {
    const ok = await confirmar(`Este dispositivo tiene los datos de ${cfg.googleEmail}. ¿Borrarlos de este dispositivo para entrar como ${perfil.email}? (Sus datos siguen a salvo en su Google Drive.)`, 'Borrar y continuar', true);
    if (!ok) { G.cerrarSesion(); return null; }
    await store.vaciarTodo();
  } else if (cfg.demo) {
    await store.vaciarTodo(); // no subir los datos de ejemplo a su hoja
  }
  store.guardarConfig({
    modo: 'google', googleEmail: perfil.email, googleNombre: perfil.nombre,
    miNombre: store.config().miNombre || (perfil.nombre || '').split(' ')[0],
    apiUrl: '', token: '', lastSync: '',
    ...(otraCuenta || cfg.modo !== 'google' ? { sheetId: '', sheetUrl: '' } : {}),
  });
  localStorage.setItem('control.iniciado', '1');
  await encolarTodo(); // si ya tenía datos propios en el dispositivo, se suben a su hoja
  await sincronizar();
  return perfil;
}

const tarjeta = (icono, titulo, texto) => `
  <div class="bv-tarjeta">${ic(icono)}<b>${esc(titulo)}</b><span>${esc(texto)}</span></div>`;

export function vistaBienvenida() {
  const listo = G.configurado();
  if (listo) G.cargarGIS().catch(() => {}); // precargar para que el clic abra la ventana de Google
  const html = `
  <div class="bienvenida">
    <header class="bv-cab">
      <img src="icons/icon-192.png" alt="" width="44" height="44">
      <span>Control</span>
    </header>

    <section class="bv-hero">
      <h1>Gestiona, controla y administra tus proyectos <em>en tiempo real</em>.</h1>
      <p>Captura tus pendientes por voz, sigue tus reuniones y lo que delegas a tu equipo. Que no se te pase nada y mejora tu productividad.</p>
      <button class="bv-google" data-google ${listo ? '' : 'disabled'}>
        ${ic('usuario')}<span>Continuar con Google</span>
      </button>
      <p class="bv-estado" id="bv-estado">${listo ? 'Gratis. Tus datos quedan en tu propio Google Drive.' : 'El inicio de sesión con Google se está configurando. Mientras tanto puedes ver la demostración.'}</p>
      <div class="bv-sec">
        <button class="btn" data-demo>${ic('hoy')} Ver una demostración</button>
        <button class="btn btn-txt" data-local>Usar sin cuenta (solo en este dispositivo)</button>
      </div>
    </section>

    <section class="bv-grid">
      ${tarjeta('mic', 'Captura por voz', 'Dicta “mañana 10am revisar CAPEX con Ana” y la app entiende fecha, responsable y proyecto.')}
      ${tarjeta('reloj', 'Nada se te pasa', 'Vencidos, pendientes de hoy y alertas antes de cada reunión.')}
      ${tarjeta('calendario', 'Reuniones con acuerdos', 'Minuta por voz; cada acuerdo se vuelve una tarea con responsable y fecha.')}
      ${tarjeta('equipo', 'Seguimiento al equipo', 'Lo que delegaste, por persona, con recordatorio por WhatsApp o correo.')}
      ${tarjeta('proyecto', 'Proyectos por fase', 'Conceptual, PFS, FS, detalle: entregables típicos y avance automático.')}
      ${tarjeta('check', 'Cierre del día', 'Lo hecho, lo pendiente y tu comentario, guardado como diario.')}
    </section>

    <section class="bv-privacidad">
      ${ic('revision')}
      <div><b>Tus datos son tuyos.</b> Se guardan en una hoja llamada “Control – Mis datos” en tu Google Drive. La app solo puede ver esa hoja, nada más de tu Drive, y nadie más tiene acceso salvo que tú la compartas.</div>
    </section>

    <footer class="bv-pie">
      <button class="btn" data-instalar hidden>${ic('descargar')} Instalar app</button>
      <button class="btn" data-compartir>${ic('enviar')} Compartir</button>
    </footer>
    <p class="bv-legal"><a href="privacidad.html">Política de privacidad</a></p>
  </div>`;

  return {
    titulo: 'Bienvenido', html, layout: 'limpio',
    montar(el) {
      const est = el.querySelector('#bv-estado');
      el.querySelector('[data-google]').onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        est.textContent = 'Abriendo Google…';
        try {
          const p = await conectarGoogle();
          if (!p) { b.disabled = false; est.textContent = ''; return; }
          toast(`¡Hola ${(p.nombre || p.email).split(' ')[0]}! Tu hoja “Control – Mis datos” está lista en tu Google Drive.`, null, 6000);
          location.hash = '#/hoy';
        } catch (err) {
          b.disabled = false;
          est.textContent = err.message;
          est.classList.add('rojo');
        }
      };
      el.querySelector('[data-demo]').onclick = async () => {
        localStorage.setItem('control.iniciado', '1');
        if (!store.todos('pendientes').length) await cargarDemo();
        location.hash = '#/hoy';
      };
      el.querySelector('[data-local]').onclick = () => {
        localStorage.setItem('control.iniciado', '1');
        location.hash = '#/hoy';
      };
    },
  };
}
