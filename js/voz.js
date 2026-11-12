// ============================================================
// voz.js — Dictado por voz con la Web Speech API del navegador.
// Funciona mejor en Chrome / Edge (PC y Android).
// En iPhone/iPad: usar el micrófono del teclado dentro del cuadro de texto.
// ============================================================

const Reconocedor = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const vozDisponible = () => !!Reconocedor;

/**
 * Empieza a escuchar. Devuelve una función para detener.
 * @param {object} cb { onParcial(texto), onFinal(texto), onFin(), onError(msg) }
 */
export function escuchar(cb = {}) {
  if (!Reconocedor) { cb.onError?.('Tu navegador no soporta dictado. Usa Chrome o el micrófono del teclado.'); return () => {}; }
  const rec = new Reconocedor();
  rec.lang = localStorage.getItem('control.vozIdioma') || 'es-PE';
  rec.interimResults = true;
  rec.continuous = !!cb.continuo;   // continuo: para dictar minutas largas
  rec.maxAlternatives = 1;

  let acumulado = '';
  rec.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) acumulado += (acumulado ? ' ' : '') + t.trim();
      else parcial += t;
    }
    cb.onParcial?.((acumulado + ' ' + parcial).trim());
    if (!parcial && acumulado) cb.onFinal?.(acumulado);
  };
  rec.onerror = (e) => {
    const msg = {
      'not-allowed': 'Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.',
      'no-speech': 'No se escuchó nada. Intenta de nuevo.',
      'network': 'El dictado necesita internet en este navegador.',
      'audio-capture': 'No se encontró micrófono.',
    }[e.error] || `Error de voz: ${e.error}`;
    if (e.error !== 'aborted') cb.onError?.(msg);
  };
  rec.onend = () => cb.onFin?.(acumulado);
  try { rec.start(); } catch (e) { cb.onError?.(e.message); }
  return () => { try { rec.stop(); } catch { /* ya detenido */ } };
}
