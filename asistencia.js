document.addEventListener('DOMContentLoaded', () => {

    // --- ESTADO Y CONFIGURACIÓN INICIAL ---
    let appState = { courses: [], participants: {}, nextParticipantId: 1 };

    const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
        didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); }
    });

    // --- LÓGICA DE PERSISTENCIA ---
    function loadStateFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('inscribCordobaState');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                appState.courses = parsedState.courses || [];
                appState.participants = parsedState.participants || {};
                appState.nextParticipantId = parsedState.nextParticipantId || 1;
                console.log('Estado cargado desde localStorage para la página de asistencia.');
            } else {
                console.warn('No se encontró estado en localStorage.');
            }
        } catch (error) {
            console.error('Error al cargar el estado desde localStorage:', error);
            Swal.fire('Error', 'No se pudieron cargar los datos de los cursos. Vuelva al panel principal e intente de nuevo.', 'error');
        }
    }

    function saveStateToLocalStorage() {
        try {
            const fullState = JSON.parse(localStorage.getItem('inscribCordobaState')) || {};
            fullState.participants = appState.participants;
            fullState.nextParticipantId = appState.nextParticipantId;
            localStorage.setItem('inscribCordobaState', JSON.stringify(fullState));
            console.log('Estado actualizado en localStorage.');
        } catch (error) {
            console.error('Error al guardar el estado en localStorage:', error);
        }
    }

    // --- LÓGICA DE LA VISTA DE ASISTENCIA ---
    function getTodayDateString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    function getTimeStamp() {
        const d = new Date();
        const year = d.getFullYear(), month = (d.getMonth() + 1).toString().padStart(2, '0'), day = d.getDate().toString().padStart(2, '0');
        const h = d.getHours().toString().padStart(2, '0'), m = d.getMinutes().toString().padStart(2, '0'), s = d.getSeconds().toString().padStart(2, '0');
        const ms = d.getMilliseconds().toString().padStart(3, '0');
        return `${year}${month}${day}${h}${m}${s}${ms}`;
    }

    async function generateBrowserToken(timeStamp, keyApp) {
        const dataToHash = timeStamp + keyApp.replace(/-/g, "");
        const encoder = new TextEncoder();
        const data = encoder.encode(dataToHash);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    
    function populateCourseSelect() {
        const select = document.getElementById('asistencia-course-select');
        if (appState.courses.length === 0) {
            select.innerHTML = '<option value="">No hay cursos cargados</option>';
            select.disabled = true;
            document.getElementById('asistencia-search-btn').disabled = true;
            return;
        }
        select.innerHTML = '<option value="">-- Por favor, elija un curso --</option>';
        appState.courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = `(${course.nroEvento}) ${course.name}`;
            select.appendChild(option);
        });
    }

    async function handleAsistenciaSearch() {
        const courseId = parseInt(document.getElementById('asistencia-course-select').value);
        const cuil = document.getElementById('asistencia-cuil-input').value.replace(/[-\s.]/g, '');

        if (!courseId) { return Swal.fire('Atención', 'Debes seleccionar un curso.', 'warning'); }
        if (!cuil || !/^\d{11}$/.test(cuil)) { return Swal.fire('Atención', 'Debes ingresar un CUIL válido de 11 dígitos.', 'warning'); }

        const course = appState.courses.find(c => c.id === courseId);
        const participants = appState.participants[courseId] || [];
        const today = getTodayDateString();

        if (!course.dates.includes(today)) {
            return Swal.fire('Fuera de Fecha', `Hoy (${new Date(today+'T00:00:00').toLocaleDateString()}) no es una fecha de cursado para "${course.name}".`, 'error');
        }
        
        const existingParticipant = participants.find(p => p.cuil.replace(/[-\s.]/g, '') === cuil);

        if (existingParticipant) {
            if (existingParticipant.attendance[today] === 1) {
                return Swal.fire('Ya Registrado', `${existingParticipant.name} ya tiene la asistencia marcada como 'Presente' para hoy.`, 'info');
            }
            const { isConfirmed } = await Swal.fire({
                title: 'Confirmar Asistencia', html: `¿Dar <b>Presente</b> a <br><b>${existingParticipant.name}</b>?`, icon: 'question',
                showCancelButton: true, confirmButtonText: 'Sí, dar presente', cancelButtonText: 'Cancelar'
            });
            if (isConfirmed) {
                existingParticipant.attendance[today] = 1;
                saveStateToLocalStorage();
                Toast.fire({ icon: 'success', title: '¡Asistencia registrada!' });
            }
            return;
        }

        Swal.fire({ title: 'Buscando...', text: 'Asistente no inscripto. Consultando sistema externo...', didOpen: () => Swal.showLoading() });
        
        try {
            // =================================================================
            //           SECCIÓN DE LA API - COMPLETAMENTE ACTUALIZADA
            // =================================================================
            
            // 1. Datos necesarios para la autenticación y la petición
            const keyApp = "7978615148664C41784C38614E5A7559"; // Este valor no se envía, se usa para generar el token
            const timeStamp = getTimeStamp();
            const tokenValue = await generateBrowserToken(timeStamp, keyApp);
            const apiUrl = 'https://cuentacidi.test.cba.gov.ar/api/Usuario/Obtener_Usuario';

            // 2. Construcción del cuerpo (body) del POST con la estructura correcta
            const requestBody = {
                IdAplicacion: 704,
                Contrasenia: "OLYZUXqhnj64515",
                TokenValue: tokenValue,
                TimeStamp: timeStamp,
                CUIL: cuil,
                CUILOperador: "20378513376",
                HashCookieOperador: "74756B6D705031426F5A386B41336F4B484F39706E4B4C2F4F62493D"
            };

            // 3. Llamada fetch con la URL y el cuerpo correctos
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();

            // 4. Verificación de la respuesta de la API (esta parte ya era compatible)
            if (data.Respuesta.CodigoError) {
                throw new Error(data.Respuesta.Resultado || 'La API devolvió un error desconocido.');
            }
            
            const { isConfirmed } = await Swal.fire({
                title: 'Nuevo Asistente Encontrado', icon: 'info',
                html: `<p>Se encontró a:</p>
                       <ul style="text-align: left; list-style-position: inside;">
                           <li><b>Nombre:</b> ${data.NombreFormateado}</li>
                           <li><b>CUIL:</b> ${data.CuilFormateado}</li>
                       </ul>
                       <p>¿Inscribir a <b>"${course.name}"</b> y dar presente?</p>`,
                showCancelButton: true, confirmButtonText: 'Sí, Inscribir y dar Presente', cancelButtonText: 'Cancelar'
            });

            if (isConfirmed) {
                const newParticipant = {
                    id: appState.nextParticipantId++,
                    cuil: data.CUIL, name: data.NombreFormateado, reparticion: 'Inscripto en el día',
                    localidad: data.Domicilio.Localidad || 'N/A', telefono: data.TelFormateado || data.CelFormateado || 'N/A', cargo: 'N/A',
                    esEmpleadoPublico: 'N', attendance: {}, nota: ''
                };
                course.dates.forEach(date => { newParticipant.attendance[date] = 0; });
                newParticipant.attendance[today] = 1;

                if (!appState.participants[courseId]) {
                    appState.participants[courseId] = [];
                }
                appState.participants[courseId].push(newParticipant);
                
                saveStateToLocalStorage();
                Swal.fire('¡Éxito!', `${newParticipant.name} ha sido inscripto y su asistencia fue registrada.`, 'success');
            }
        } catch (error) {
            console.error("Error detallado en la búsqueda:", error);
            Swal.fire('Error', `No se pudo completar la operación: ${error.message}`, 'error');
        }
    }

    // --- EJECUCIÓN INICIAL ---
    loadStateFromLocalStorage();
    populateCourseSelect();

    document.getElementById('asistencia-search-btn').addEventListener('click', handleAsistenciaSearch);
});