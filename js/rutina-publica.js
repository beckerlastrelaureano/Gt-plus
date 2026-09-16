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
  let diaActivo = null;
  let ejercicioExpandido = null;

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
      diaActivo = null;
      ejercicioExpandido = null;

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
        <div class="panel-header-flex"><h3>Progreso por ejercicio</h3><select id="select-ejercicio-progreso-publico"></select></div>
        <div id="tabla-progreso-publico" style="margin-top:.6rem"></div>
      </div>

      <div class="panel" style="margin-bottom:1.2rem">
        <h3>Mis cargas</h3>
        <p class="texto-suave texto-pequeno" style="margin:.2rem 0 .6rem">¿Cargaste algo mal? Lo podés editar o borrar.</p>
        <div id="lista-cargas-publico"></div>
      </div>

      <div class="panel-header-flex" style="margin-top:1.2rem"><h3>Mi rutina</h3></div>
      <div id="dias-rutina-publica"></div>
      <div id="form-carga-publica" style="margin-top:1rem"></div>
    `;

    pintarProgresoPorEjercicio(historial);
    pintarListaCargas(historial);
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

  function pesoMaximoDeCarga(carga) {
    return (carga.ejercicios || []).reduce((max, ej) =>
      (ej.series || []).reduce((m, s) => Math.max(m, Number(s.peso) || 0), max), 0);
  }

  async function recargarHistorialYPintar() {
    const snap = await db.collection('entrenamientosGym').where('dni', '==', dniActual).get();
    const historial = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    pintarProgresoPorEjercicio(historial);
    pintarListaCargas(historial);
  }

  function pintarProgresoPorEjercicio(historial) {
    const select = $('#select-ejercicio-progreso-publico');
    const nombresEjercicios = new Map();
    historial.forEach(c => (c.ejercicios || []).forEach(ej => {
      if (!nombresEjercicios.has(ej.ejercicioId)) nombresEjercicios.set(ej.ejercicioId, ej.nombre || (getExerciseById(ej.ejercicioId)?.nombre) || 'Ejercicio');
    }));
    if (!nombresEjercicios.size) {
      select.innerHTML = `<option value="">Sin cargas</option>`;
      $('#tabla-progreso-publico').innerHTML = `<p class="texto-suave estado-vacio">Todavía no hay cargas registradas.</p>`;
      return;
    }
    const valorPrevio = select.value;
    select.innerHTML = Array.from(nombresEjercicios.entries()).map(([id, nombre]) => `<option value="${id}">${escapeHtml(nombre)}</option>`).join('');
    if (valorPrevio && nombresEjercicios.has(valorPrevio)) select.value = valorPrevio;
    pintarTablaEjercicio(historial, select.value);
    select.onchange = (e) => pintarTablaEjercicio(historial, e.target.value);
  }

  function pintarTablaEjercicio(historial, ejercicioId) {
    const cont = $('#tabla-progreso-publico');
    const filas = historial
      .filter(c => (c.ejercicios || []).some(e => e.ejercicioId === ejercicioId))
      .map(c => {
        const ej = c.ejercicios.find(e => e.ejercicioId === ejercicioId);
        const maxPeso = (ej.series || []).reduce((m, s) => Math.max(m, Number(s.peso) || 0), 0);
        const repsDelMax = (ej.series || []).find(s => (Number(s.peso) || 0) === maxPeso)?.reps || '-';
        return { fecha: c.fecha, maxPeso, reps: repsDelMax };
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    if (!filas.length) { cont.innerHTML = `<p class="texto-suave estado-vacio">Todavía no hay cargas de este ejercicio.</p>`; return; }
    cont.innerHTML = `
      <table class="tabla-progreso">
        <thead><tr><th>Fecha</th><th>Reps</th><th>Peso</th></tr></thead>
        <tbody>${filas.map(f => `<tr><td>${formatFecha(f.fecha)}</td><td>${f.reps}</td><td>${f.maxPeso} kg</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function pintarListaCargas(historial) {
    const cont = $('#lista-cargas-publico');
    if (!historial.length) { cont.innerHTML = `<p class="texto-suave estado-vacio">Todavía no cargaste ningún peso.</p>`; return; }
    cont.innerHTML = historial.map(c => `
      <div class="fila-historial">
        <div class="fila-historial-info"><strong>${formatFecha(c.fecha)}${c.diaNombre ? ` · ${escapeHtml(c.diaNombre)}` : ''}</strong><span class="texto-suave">${(c.ejercicios || []).length} ejercicios · máx ${Math.round(pesoMaximoDeCarga(c))} kg</span></div>
        <div style="display:flex;gap:.4rem">
          <button class="btn-icono" data-editar-carga-pub="${c.id}" title="Editar">✎</button>
          <button class="btn-icono btn-icono-peligro" data-borrar-carga-pub="${c.id}" title="Borrar">🗑</button>
        </div>
      </div>`).join('');
    $$('[data-editar-carga-pub]', cont).forEach(b => b.addEventListener('click', () => {
      const carga = historial.find(c => c.id === b.dataset.editarCargaPub);
      if (carga) abrirModalEditarCargaPublica(carga);
    }));
    $$('[data-borrar-carga-pub]', cont).forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta carga? No se puede deshacer.')) return;
      try {
        await db.collection('entrenamientosGym').doc(b.dataset.borrarCargaPub).delete();
        await recargarHistorialYPintar();
      } catch (e) {
        console.error('Error borrando carga:', e);
        alert('No se pudo borrar. Probá de nuevo.');
      }
    }));
  }

  function abrirModalEditarCargaPublica(carga) {
    // Esta página no tiene el sistema de modales de la app principal —
    // se arma un overlay chico propio, autocontenido.
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,8,.7);display:flex;align-items:center;justify-content:center;padding:1rem;z-index:200';
    overlay.innerHTML = `
      <div class="panel" style="max-width:480px;width:100%;max-height:85vh;overflow-y:auto">
        <h3>Editar carga — ${formatFecha(carga.fecha)}</h3>
        ${(carga.ejercicios || []).map((ej, ei) => `
          <div class="bloque-dia" style="margin-top:.8rem">
            <div class="dia-header"><strong>${escapeHtml(ej.nombre || getExerciseById(ej.ejercicioId)?.nombre || 'Ejercicio')}</strong></div>
            ${(ej.series || []).map((serie, si) => `
              <div class="fila-serie-carga">
                <span class="fila-serie-numero">Serie ${si + 1}</span>
                <label class="campo-mini"><span>Reps</span><input type="number" min="0" step="1" data-ed-reps="${ei}:${si}" value="${serie.reps || ''}"></label>
                <label class="campo-mini"><span>Kg</span><input type="number" min="0" step="0.5" data-ed-peso="${ei}:${si}" value="${serie.peso || ''}"></label>
              </div>`).join('')}
          </div>`).join('')}
        <div style="display:flex;gap:.6rem;margin-top:1rem">
          <button class="btn btn-fantasma" id="btn-cancelar-editar-pub" style="flex:1">Cancelar</button>
          <button class="btn btn-primario" id="btn-guardar-editar-pub" style="flex:1">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-cancelar-editar-pub').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-guardar-editar-pub').addEventListener('click', async () => {
      const ejerciciosEditados = (carga.ejercicios || []).map((ej, ei) => ({
        ...ej,
        series: (ej.series || []).map((_, si) => ({
          reps: Number(overlay.querySelector(`[data-ed-reps="${ei}:${si}"]`)?.value) || 0,
          peso: Number(overlay.querySelector(`[data-ed-peso="${ei}:${si}"]`)?.value) || 0
        }))
      }));
      const volumenTotal = ejerciciosEditados.reduce((t, ej) => t + ej.series.reduce((s, x) => s + x.peso * x.reps, 0), 0);
      try {
        await db.collection('entrenamientosGym').doc(carga.id).update({ ejercicios: ejerciciosEditados, volumenTotal });
        overlay.remove();
        await recargarHistorialYPintar();
      } catch (e) {
        console.error('Error editando carga:', e);
        alert('No se pudo guardar. Probá de nuevo.');
      }
    });
  }

  function pintarRutina() {
    const cont = $('#dias-rutina-publica');
    const formCont = $('#form-carga-publica');
    if (!rutinaActual || !rutinaActual.dias || !rutinaActual.dias.length) {
      cont.innerHTML = `<p class="texto-suave estado-vacio">Todavía no tenés una rutina asignada. Consultá con tu entrenador.</p>`;
      formCont.innerHTML = '';
      return;
    }

    // Nivel 1: lista de días nada más — para no mostrar todo junto.
    if (diaActivo === null) {
      cont.innerHTML = rutinaActual.dias.map((dia, di) => `
        <button class="fila-historial" data-ir-dia="${di}" style="width:100%;text-align:left;cursor:pointer">
          <div class="fila-historial-info"><strong>${escapeHtml(dia.nombre)}</strong><span class="texto-suave">${(dia.ejercicios || []).length} ejercicios</span></div>
          <span class="texto-suave" style="font-size:1.1rem">›</span>
        </button>`).join('');
      $$('[data-ir-dia]', cont).forEach(b => b.addEventListener('click', () => {
        diaActivo = Number(b.dataset.irDia);
        ejercicioExpandido = null;
        pintarRutina();
      }));
      formCont.innerHTML = '';
      return;
    }

    // Nivel 2: ejercicios de ESE día, colapsados — se despliegan al tocarlos.
    const dia = rutinaActual.dias[diaActivo];
    cont.innerHTML = `
      <button class="btn btn-fantasma btn-sm" id="btn-volver-dia">‹ Volver a mis días</button>
      <h3 style="margin:.8rem 0 .6rem">${escapeHtml(dia.nombre)}</h3>
      ${(dia.ejercicios || []).map((item, ei) => {
        const ej = getExerciseById(item.ejercicioId);
        if (!ej) return '';
        const expandido = ejercicioExpandido === ei;
        return `
          <div class="bloque-dia" style="margin-bottom:.6rem">
            <button data-toggle-ejercicio="${ei}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:0;color:inherit;font:inherit">
              <strong>${escapeHtml(ej.nombre)}</strong>
              <span class="texto-suave" style="font-size:1.1rem">${expandido ? '︿' : '﹀'}</span>
            </button>
            ${expandido ? `
              <div style="margin-top:.7rem">
                ${item.seriesObjetivo.map((s, si) => `
                  <div class="fila-serie-carga">
                    <span class="fila-serie-numero">Serie ${si + 1}</span>
                    <span class="texto-suave">${s.reps} reps${s.peso ? ` · ${s.peso} kg` : ''}</span>
                  </div>`).join('')}
              </div>` : ''}
          </div>`;
      }).join('') || '<p class="texto-suave texto-pequeno">Este día no tiene ejercicios.</p>'}
      <button class="btn btn-fantasma btn-full" id="btn-cargar-este-dia" style="margin-top:1rem">Cargar los pesos de hoy</button>
    `;

    $('#btn-volver-dia').addEventListener('click', () => { diaActivo = null; ejercicioExpandido = null; formCont.innerHTML = ''; pintarRutina(); });
    $$('[data-toggle-ejercicio]', cont).forEach(b => b.addEventListener('click', () => {
      const ei = Number(b.dataset.toggleEjercicio);
      ejercicioExpandido = ejercicioExpandido === ei ? null : ei;
      pintarRutina();
    }));
    $('#btn-cargar-este-dia').addEventListener('click', () => mostrarFormularioCarga(diaActivo));
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
            ${item.seriesObjetivo.map((serie, si) => `
              <div class="fila-serie-carga">
                <span class="fila-serie-numero">Serie ${si + 1}</span>
                <label class="campo-mini"><span>Reps</span><input type="number" min="0" step="1" data-reps-pub="${ei}:${si}" value="${serie.reps || ''}"></label>
                <label class="campo-mini"><span>Kg</span><input type="number" min="0" step="0.5" data-peso-pub="${ei}:${si}" value="${serie.peso || ''}"></label>
              </div>`).join('')}
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
        formCont.innerHTML = `<p class="texto-suave" style="text-align:center">¡Cargado!</p>`;
        await recargarHistorialYPintar();
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
