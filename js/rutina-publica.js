/**
 * rutina-publica.js
 * -----------------------------------------------------------------------
 * Script de rutina.html — la página pública que se abre desde el QR único
 * del gimnasio, SIN login. La persona escribe su DNI y ve su rutina, su
 * progreso reciente y el vencimiento de su cuota, y desde ahí mismo puede
 * marcar su entrada de hoy y cargar los pesos que hizo.
 *
 * A propósito es un script chico y separado del resto de la app (no
 * reutiliza app.js ni firebase-service.js): esos asumen un login real, y
 * acá deliberadamente no lo hay. Todo lo que este script puede leer o
 * escribir está limitado por firestore.rules, no por este código — leé
 * los comentarios de "fichaPublicaGym", "rutinasGym", "entrenamientosGym"
 * y "asistenciasGym" ahí para el detalle de qué se expone y por qué.
 */
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function getExerciseById(id) {
    return (typeof EXERCISE_DATABASE !== 'undefined' ? EXERCISE_DATABASE : []).find(e => e.id === id) || null;
  }
  function inicioDeHoy() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function formatFecha(iso) {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  let db;
  let dniActual = null;
  let fichaActual = null;
  let rutinaActual = null;

  async function buscarPorDni(dni) {
    const errorEl = $('#error-dni-publico');
    const cont = $('#contenido-rutina-publica');
    errorEl.hidden = true;
    cont.innerHTML = `<p class="texto-suave" style="text-align:center">Buscando...</p>`;
    try {
      const fichaDoc = await db.collection('fichaPublicaGym').doc(dni).get();
      if (!fichaDoc.exists) {
        cont.innerHTML = '';
        errorEl.textContent = 'No encontramos ningún socio con ese DNI. Revisá que esté bien escrito, o consultá en recepción.';
        errorEl.hidden = false;
        return;
      }
      dniActual = dni;
      fichaActual = fichaDoc.data();

      const [rutinaDoc, historialSnap, asistenciasSnap] = await Promise.all([
        db.collection('rutinasGym').doc(dni).get(),
        db.collection('entrenamientosGym').where('dni', '==', dni).get(),
        db.collection('asistenciasGym').where('dni', '==', dni).get()
      ]);
      rutinaActual = rutinaDoc.exists ? rutinaDoc.data() : null;
      const historial = historialSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const yaAsistioHoy = asistenciasSnap.docs.some(d => new Date(d.data().fecha).getTime() >= inicioDeHoy());

      renderTodo(historial, yaAsistioHoy);
    } catch (e) {
      console.error('Error buscando por DNI:', e);
      cont.innerHTML = '';
      errorEl.textContent = 'No se pudo cargar la información. Revisá tu conexión e intentá de nuevo.';
      errorEl.hidden = false;
    }
  }

  function renderTodo(historial, yaAsistioHoy) {
    const cont = $('#contenido-rutina-publica');
    const nombreCompleto = [fichaActual.nombre, fichaActual.apellido].filter(Boolean).join(' ');
    const vencida = fichaActual.fechaVencimiento && new Date(fichaActual.fechaVencimiento).getTime() < Date.now();

    cont.innerHTML = `
      <div class="panel" style="margin-bottom:1.2rem">
        <h2 style="margin-bottom:.2rem">${escapeHtml(nombreCompleto)}</h2>
        <p class="texto-suave texto-pequeno">${escapeHtml(fichaActual.modalidad || '')}</p>
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">
          <span class="badge ${vencida ? 'badge-peligro' : 'badge-exito'}">${vencida ? 'Cuota vencida' : 'Cuota al día'}</span>
          ${fichaActual.fechaVencimiento ? `<span class="texto-suave texto-pequeno">Vence el ${formatFecha(fichaActual.fechaVencimiento)}</span>` : ''}
        </div>
        <button class="btn ${yaAsistioHoy ? 'btn-fantasma' : 'btn-primario'} btn-full" id="btn-marcar-asistencia-publico" style="margin-top:1rem" ${yaAsistioHoy ? 'disabled' : ''}>
          ${yaAsistioHoy ? 'Ya registraste tu entrada hoy' : 'Marcar mi entrada de hoy'}
        </button>
      </div>

      <div class="panel" style="margin-bottom:1.2rem">
        <h3>Progreso reciente</h3>
        <div id="lista-progreso-publico" style="margin-top:.8rem"></div>
      </div>

      <div class="panel-header-flex" style="margin-top:1.2rem"><h3>Mi rutina</h3></div>
      <div id="dias-rutina-publica"></div>
      <div id="form-carga-publica" style="margin-top:1rem"></div>
    `;

    pintarProgreso(historial);
    pintarRutina();

    $('#btn-marcar-asistencia-publico').addEventListener('click', async () => {
      try {
        await db.collection('asistenciasGym').add({
          dni: dniActual, nombre: nombreCompleto, entrenadorId: fichaActual.entrenadorId, fecha: new Date().toISOString()
        });
        renderTodo(historial, true);
      } catch (e) {
        console.error('Error marcando asistencia:', e);
        alert('No se pudo registrar la entrada. Probá de nuevo.');
      }
    });
  }

  function pintarProgreso(historial) {
    const cont = $('#lista-progreso-publico');
    if (!historial.length) { cont.innerHTML = `<p class="texto-suave estado-vacio">Todavía no hay cargas registradas.</p>`; return; }
    const ultimas = historial.slice(0, 8);
    const maxVolumen = Math.max(...ultimas.map(h => h.volumenTotal || 0), 1);
    cont.innerHTML = ultimas.map(h => `
      <div style="margin-bottom:.7rem">
        <div style="display:flex;justify-content:space-between;font-size:.85rem">
          <span class="texto-suave">${formatFecha(h.fecha)}${h.diaNombre ? ` · ${escapeHtml(h.diaNombre)}` : ''}</span>
          <strong>${Math.round(h.volumenTotal || 0)} kg</strong>
        </div>
        <div class="barra-carga-mini" style="width:${Math.max(4, Math.round((h.volumenTotal || 0) / maxVolumen * 100))}%"></div>
      </div>`).join('');
  }

  function pintarRutina() {
    const cont = $('#dias-rutina-publica');
    const formCont = $('#form-carga-publica');
    if (!rutinaActual || !rutinaActual.dias || !rutinaActual.dias.length) {
      cont.innerHTML = `<p class="texto-suave estado-vacio">Todavía no tenés una rutina asignada. Consultá con tu entrenador.</p>`;
      formCont.innerHTML = '';
      return;
    }
    cont.innerHTML = rutinaActual.dias.map((dia, di) => `
      <div class="bloque-dia">
        <div class="dia-header"><strong>${escapeHtml(dia.nombre)}</strong></div>
        <div class="lista-ejercicios-dia">
          ${(dia.ejercicios || []).map(item => {
            const ej = getExerciseById(item.ejercicioId);
            if (!ej) return '';
            const primera = (item.seriesObjetivo && item.seriesObjetivo[0]) || {};
            return `<div class="fila-ejercicio-dia">
              <div class="fila-ejercicio-dia-info"><strong>${escapeHtml(ej.nombre)}</strong><span class="texto-suave">${item.seriesObjetivo.length} series × ${primera.reps || '-'} reps${primera.peso ? ` @ ${primera.peso}kg` : ''}</span></div>
            </div>`;
          }).join('') || '<p class="texto-suave texto-pequeno">Sin ejercicios.</p>'}
        </div>
        <button class="btn btn-fantasma btn-full" data-cargar-dia="${di}" style="margin-top:.8rem">Cargar los pesos de hoy — ${escapeHtml(dia.nombre)}</button>
      </div>`).join('');

    $$('[data-cargar-dia]', cont).forEach(b => b.addEventListener('click', () => mostrarFormularioCarga(Number(b.dataset.cargarDia))));
  }

  function mostrarFormularioCarga(di) {
    const dia = rutinaActual.dias[di];
    const formCont = $('#form-carga-publica');
    const ejerciciosValidos = (dia.ejercicios || []).map((item, ei) => ({ item, ei, ej: getExerciseById(item.ejercicioId) })).filter(x => x.ej);
    formCont.innerHTML = `
      <div class="panel">
        <h3>Cargar pesos — ${escapeHtml(dia.nombre)}</h3>
        ${ejerciciosValidos.map(({ item, ei, ej }) => `
          <div class="bloque-dia" style="margin-top:.8rem">
            <div class="dia-header"><strong>${escapeHtml(ej.nombre)}</strong></div>
            <div class="lista-ejercicios-dia">
              ${item.seriesObjetivo.map((serie, si) => `
                <div class="fila-ejercicio-dia">
                  <div class="fila-ejercicio-dia-info" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
                    <span class="texto-suave texto-pequeno" style="width:4rem">Serie ${si + 1}</span>
                    <input type="number" min="0" step="1" placeholder="Reps" data-reps-pub="${ei}:${si}" value="${serie.reps || ''}" style="width:5rem">
                    <input type="number" min="0" step="0.5" placeholder="Kg" data-peso-pub="${ei}:${si}" value="${serie.peso || ''}" style="width:5rem">
                  </div>
                </div>`).join('')}
            </div>
          </div>`).join('') || '<p class="texto-suave texto-pequeno" style="margin-top:.8rem">Este día no tiene ejercicios cargados.</p>'}
        <div style="display:flex;gap:.5rem;margin-top:1rem">
          <button class="btn btn-fantasma" id="btn-cancelar-carga-publica">Cancelar</button>
          <button class="btn btn-primario" id="btn-guardar-carga-publica" style="flex:1">Guardar</button>
        </div>
      </div>`;

    $('#btn-cancelar-carga-publica').addEventListener('click', () => { formCont.innerHTML = ''; });
    $('#btn-guardar-carga-publica').addEventListener('click', async () => {
      const ejerciciosSesion = ejerciciosValidos.map(({ item, ei, ej }) => ({
        ejercicioId: ej.id, nombre: ej.nombre,
        series: item.seriesObjetivo.map((_, si) => ({
          reps: Number($(`[data-reps-pub="${ei}:${si}"]`)?.value) || 0,
          peso: Number($(`[data-peso-pub="${ei}:${si}"]`)?.value) || 0
        }))
      }));
      const volumenTotal = ejerciciosSesion.reduce((t, ej) => t + ej.series.reduce((s, x) => s + x.peso * x.reps, 0), 0);
      try {
        await db.collection('entrenamientosGym').add({
          dni: dniActual, entrenadorId: fichaActual.entrenadorId, diaNombre: dia.nombre,
          ejercicios: ejerciciosSesion, volumenTotal, fecha: new Date().toISOString()
        });
        formCont.innerHTML = `<p class="texto-suave" style="text-align:center">¡Cargado! Volvé a buscar tu DNI para ver el progreso actualizado.</p>`;
      } catch (e) {
        console.error('Error guardando carga:', e);
        alert('No se pudo guardar. Probá de nuevo.');
      }
    });
  }

  function iniciar() {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();

    const inputDni = $('#input-dni-publico');
    function buscar() {
      const dni = inputDni.value.trim();
      if (!dni) return;
      buscarPorDni(dni);
    }
    $('#btn-buscar-dni-publico').addEventListener('click', buscar);
    inputDni.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  }

  iniciar();
})();
