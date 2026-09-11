/**
 * rutina-publica.js
 * -----------------------------------------------------------------------
 * Script de rutina.html — la página pública que se abre desde un QR, SIN
 * login. A propósito es chico y separado del resto de la app: solo hace
 * una lectura pública de "rutinasPublicas/{token}" (permitida por
 * firestore.rules con "allow get: if true") y pinta la rutina en modo
 * solo-lectura. No reutiliza app.js completo porque ese archivo asume
 * todo el flujo de login/sidebar que esta página no tiene.
 *
 * Nota: a diferencia del detalle de ejercicio dentro de la app, acá NO se
 * muestran fotos/GIFs — se prioriza que cargue rápido en el celular de
 * cualquiera que escanee el QR, sin depender de la conexión del gimnasio.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getExerciseById(id) {
    return (typeof EXERCISE_DATABASE !== 'undefined' ? EXERCISE_DATABASE : []).find(e => e.id === id) || null;
  }

  function renderRutina(datos) {
    const cont = $('#contenido-rutina-publica');
    const r = datos.rutina || {};
    const dias = r.dias || [];
    cont.innerHTML = `
      <p class="texto-suave texto-pequeno" style="text-align:center;margin-bottom:.2rem">${escapeHtml(datos.nombreSocio || '')}</p>
      <h2 style="text-align:center;margin-bottom:1.2rem">${escapeHtml(r.nombre || 'Rutina')}</h2>
      ${dias.length ? dias.map(dia => `
        <div class="bloque-dia">
          <div class="dia-header"><strong>${escapeHtml(dia.nombre)}</strong></div>
          <div class="lista-ejercicios-dia">
            ${(dia.ejercicios || []).map(item => {
              const ej = getExerciseById(item.ejercicioId);
              if (!ej) return '';
              const primera = (item.seriesObjetivo && item.seriesObjetivo[0]) || {};
              return `<div class="fila-ejercicio-dia">
                <div class="fila-ejercicio-dia-info">
                  <strong>${escapeHtml(ej.nombre)}</strong>
                  <span class="texto-suave">${item.seriesObjetivo.length} series × ${primera.reps || '-'} reps${primera.peso ? ` @ ${primera.peso}kg` : ''}</span>
                </div>
              </div>`;
            }).join('') || '<p class="texto-suave texto-pequeno">Sin ejercicios.</p>'}
          </div>
        </div>`).join('') : '<p class="texto-suave estado-vacio">Esta rutina todavía no tiene días cargados.</p>'}
      <p class="texto-suave texto-pequeno" style="text-align:center;margin-top:1.4rem">Actualizada ${datos.actualizada ? new Date(datos.actualizada).toLocaleDateString('es-AR') : ''}</p>
    `;
  }

  function mostrarError(mensaje) {
    const cont = $('#contenido-rutina-publica');
    if (cont) cont.innerHTML = `<p class="texto-suave estado-vacio" style="text-align:center">${escapeHtml(mensaje)}</p>`;
  }

  async function iniciar() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) { mostrarError('Falta el código de la rutina en el link.'); return; }
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      const db = firebase.firestore();
      const doc = await db.collection('rutinasPublicas').doc(token).get();
      if (!doc.exists) { mostrarError('Esta rutina ya no está disponible. Pedile a tu entrenador un QR nuevo.'); return; }
      renderRutina(doc.data());
    } catch (e) {
      console.error('Error cargando rutina pública:', e);
      mostrarError('No se pudo cargar la rutina. Revisá tu conexión e intentá de nuevo.');
    }
  }

  iniciar();
})();
