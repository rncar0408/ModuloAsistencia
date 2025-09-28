document.addEventListener('DOMContentLoaded', () => {

    // --- ESTADO Y CONFIGURACIÓN INICIAL ---
    let appState = { courses: [], participants: {}, nextParticipantId: 1 };

    const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
        didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); }
    });
 
    // --- LÓGICA DE PERSISTENCIA ---
    function loadStateFromLocalStorage() {
        console.log('--- Intentando cargar estado desde localStorage ---');
        try {
            const savedState = localStorage.getItem('inscribCordobaState');
            console.log('Valor recuperado de localStorage para inscribCordobaState:', savedState);

            if (savedState) {
                const parsedState = JSON.parse(savedState);
                appState.courses = parsedState.courses || [];
                appState.participants = parsedState.participants || {};
                appState.nextParticipantId = parsedState.nextParticipantId || 1;
                console.log('Estado cargado con éxito desde localStorage.');
                console.log('Cursos cargados:', appState.courses);
                console.log('Participantes cargados:', appState.participants);
            } else {
                console.warn('No se encontró estado en localStorage para la clave "inscribCordobaState". Asegúrese de haber cargado cursos previamente.');
            }
        } catch (error) {
            console.error('Error FATAL al cargar el estado desde localStorage:', error);
            Swal.fire('Error', 'No se pudieron cargar los datos de los cursos. Contacte a administración o revise el localStorage.', 'error');
        }
        console.log('--- Fin de la carga de estado ---');
    }

    function saveStateToLocalStorage() {
        console.log('--- Intentando guardar estado en localStorage ---');
        try {
            // Aseguramos que solo actualizamos las partes que maneja esta página (principalmente participants y nextParticipantId)
            const fullState = JSON.parse(localStorage.getItem('inscribCordobaState')) || {};
            fullState.participants = appState.participants;
            fullState.nextParticipantId = appState.nextParticipantId;
            localStorage.setItem('inscribCordobaState', JSON.stringify(fullState));
            console.log('Estado actualizado en localStorage con los participantes más recientes.');
            console.log('Nuevo estado de participantes guardado:', appState.participants);
        } catch (error) {
            console.error('Error al guardar el estado en localStorage:', error);
            // No mostramos Swal.fire aquí, ya que podría interrumpir el flujo si hay un error al guardar después de una operación exitosa.
        }
        console.log('--- Fin del guardado de estado ---');
    }

    // --- FUNCIONES UTILITARIAS ---
    function getTodayDateString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        // --- PARA PROBAR FECHAS FUTURAS: DESCOMENTAR Y MODIFICAR ESTA LÍNEA ---
        // return '2025-09-26'; 
    }

    function getFormattedTodayDate() {
        const today = new Date();
        return today.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        // --- PARA PROBAR FECHAS FUTURAS: DESCOMENTAR Y MODIFICAR ESTA LÍNEA ---
        // return 'viernes, 26 de septiembre de 2025';
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
    
    // --- LÓGICA DE PROCESAMIENTO DE ASISTENCIA (se ejecuta al cargar la página) ---
    async function processAsistencia() {
        console.log('--- Iniciando processAsistencia ---');
        const urlParams = new URLSearchParams(window.location.search);
        const nroEventoParam = urlParams.get('nroEvento');

        const statusMessageDiv = document.getElementById('status-message');
        statusMessageDiv.innerHTML = '<p>Verificando datos de curso...</p>';

        console.log(`Parámetros de URL recibidos: nroEvento=${nroEventoParam}`);

        if (!nroEventoParam) {
            statusMessageDiv.innerHTML = '<p class="alert alert-danger">Error: Falta el número de evento en la URL. Contacte a administración.</p>';
            return Swal.fire('Error', 'Faltan parámetros (nroEvento) en la URL.', 'error');
        }

        // =================================================================
        //           SOLICITAR CUIL AL USUARIO AL INICIO
        // =================================================================
        let cuilParam;
        try {
            const { value: swalCuil } = await Swal.fire({
                title: 'Ingrese CUIL del participante',
                input: 'text',
                inputPlaceholder: 'Ej: 20-12345678-9',
                inputValidator: (value) => {
                    if (!value) {
                        return 'Debe ingresar un CUIL';
                    }
                    const cleanValue = value.replace(/[-\s.]/g, '');
                    if (!/^\d{11}$/.test(cleanValue)) {
                        return 'El CUIL debe tener 11 dígitos numéricos.';
                    }
                },
                allowOutsideClick: false,
                allowEscapeKey: false,
                showCancelButton: true,
                cancelButtonText: 'Cancelar Asistencia',
            });

            if (swalCuil) {
                cuilParam = swalCuil;
            } else {
                statusMessageDiv.innerHTML = '<p class="alert alert-secondary">Registro de asistencia cancelado por el usuario.</p>';
                return; 
            }
        } catch (error) {
            console.error("Error al solicitar CUIL con SweetAlert:", error);
            statusMessageDiv.innerHTML = '<p class="alert alert-danger">Error al solicitar el CUIL. Intente nuevamente.</p>';
            return Swal.fire('Error', 'Ocurrió un problema al solicitar el CUIL.', 'error');
        }

        const cuilClean = cuilParam.replace(/[-\s.]/g, '');
        const todayString = getTodayDateString();
        const formattedToday = getFormattedTodayDate();

        console.log(`CUIL limpio: ${cuilClean}, Fecha de hoy (string): ${todayString}, Fecha de hoy (formateada): ${formattedToday}`);

        // La validación del CUIL limpio ya se hizo en el inputValidator de SweetAlert
        // if (!/^\d{11}$/.test(cuilClean)) {
        //     statusMessageDiv.innerHTML = '<p class="alert alert-danger">Error: El CUIL proporcionado no es válido (debe tener 11 dígitos).</p>';
        //     return Swal.fire('Error', 'El CUIL proporcionado no es válido.', 'error');
        // }
        
        console.log('Buscando curso con nroEvento:', nroEventoParam);
        console.log('Cursos disponibles en appState:', appState.courses); 

        const course = appState.courses.find(c => c.nroEvento == nroEventoParam); 

        // 1. Verificar si el curso existe
        if (!course) {
            console.error('Curso no encontrado en appState.courses para nroEvento:', nroEventoParam);
            statusMessageDiv.innerHTML = `<p class="alert alert-danger">Error: El curso con número de evento <b>${nroEventoParam}</b> no existe en el registro. Contacte a administración.</p>`;
            return Swal.fire({
                title: 'Curso No Encontrado',
                html: `<div class="alert alert-danger" role="alert">
                           El curso con número de evento <b>${nroEventoParam}</b> no existe en el registro. Contacte a administración.
                       </div>`,
                icon: 'error'
            });
        }
        console.log('Curso encontrado:', course);


        // 2. Verificar si hay clase para la fecha actual
        if (!course.dates.includes(todayString)) {
            console.warn(`No hay clase para el curso ${course.name} en la fecha ${todayString}.`);
            statusMessageDiv.innerHTML = `<p class="alert alert-warning">Advertencia: No hay clases para el curso <b>"${course.name}" (${course.nroEvento})</b> en la fecha de hoy (${formattedToday}). Contacte a administración.</p>`;
            return Swal.fire({
                title: 'Sin Clases Hoy',
                html: `<div class="alert alert-warning" role="alert">
                           No hay clases para el curso <b>"${course.name}" (${course.nroEvento})</b> en la fecha de hoy (${formattedToday}).<br>
                           Contacte a administración si cree que es un error.
                       </div>`,
                icon: 'info'
            });
        }
        console.log(`Clase encontrada para hoy (${todayString}) en el curso "${course.name}".`);


        // 3. Buscar participante en el registro local del curso
        const participantsInCourse = appState.participants[course.id] || [];
        console.log(`Buscando CUIL ${cuilClean} en los participantes del curso ${course.id}:`, participantsInCourse);

        const existingParticipant = participantsInCourse.find(p => p.cuil.replace(/[-\s.]/g, '') === cuilClean);

        if (existingParticipant) {
            console.log('Participante encontrado localmente:', existingParticipant.name);
            // El participante ya está inscrito en este curso
            if (existingParticipant.attendance[todayString] === 1) {
                // Ya tiene asistencia marcada para hoy
                statusMessageDiv.innerHTML = `<p class="alert alert-info">¡Asistencia ya registrada! <b>${existingParticipant.name}</b> ya tiene el presente para hoy en el curso <b>"${course.name}"</b>.</p>`;
                return Swal.fire('Ya Registrado', `${existingParticipant.name} ya tiene la asistencia marcada como 'Presente' para hoy en el curso "${course.name}".`, 'info');
            } else {
                // Participante encontrado, tiene clase hoy, pero no asistencia marcada.
                statusMessageDiv.innerHTML = `<p class="alert alert-info">Listo para registrar asistencia a <b>${existingParticipant.name}</b> en <b>"${course.name}"</b> para <b>${formattedToday}</b>.</p>`;
                const { isConfirmed } = await Swal.fire({
                    title: 'Confirmar Asistencia',
                    html: `¿Dar <b>Presente</b> a <br><b>${existingParticipant.name}</b><br> para el curso <b>"${course.name}" (${course.nroEvento})</b> en la fecha <b>${formattedToday}</b>?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, dar presente',
                    cancelButtonText: 'Cancelar'
                });
                if (isConfirmed) {
                    existingParticipant.attendance[todayString] = 1;
                    saveStateToLocalStorage();
                    statusMessageDiv.innerHTML = `<p class="alert alert-success">¡Asistencia registrada con éxito para <b>${existingParticipant.name}</b> en <b>"${course.name}"</b>!</p>`;
                    Toast.fire({ icon: 'success', title: '¡Asistencia registrada!' });
                } else {
                    statusMessageDiv.innerHTML = `<p class="alert alert-secondary">Registro de asistencia cancelado por el usuario.</p>`;
                }
            }
        } else {
            // Participante no encontrado en el registro local. Intentar buscar en API externa.
            console.log('Participante no encontrado localmente. Consultando API externa...');
            statusMessageDiv.innerHTML = `<p>Asistente no inscripto localmente. Consultando sistema externo para el CUIL <b>${cuilClean}</b>...</p>`;
            Swal.fire({ title: 'Buscando...', text: 'Asistente no inscripto. Consultando sistema externo...', didOpen: () => Swal.showLoading() });
            
            try {
                const keyApp = "7978615148664C41784C38614E5A7559"; 
                const timeStamp = getTimeStamp();
                const tokenValue = await generateBrowserToken(timeStamp, keyApp);
                const apiUrl = 'https://cuentacidi.test.cba.gov.ar/api/Usuario/Obtener_Usuario';

                const requestBody = {
                    IdAplicacion: 704,
                    Contrasenia: "OLYZUXqhnj64515",
                    TokenValue: tokenValue,
                    TimeStamp: timeStamp,
                    CUIL: cuilClean,
                    CUILOperador: "20378513376", 
                    HashCookieOperador: "74756B6D705031426F5A386b41336f4B484F39706e4B4C2F4F62493D"
                };
                console.log('Enviando petición a la API con body:', requestBody);

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                console.log('Respuesta de la API (raw):', response);

                if (!response.ok) {
                    throw new Error(`Error del servidor: ${response.status} - ${response.statusText}`);
                }

                const data = await response.json();
                console.log('Datos de la API (parsed):', data);

                if (data.Respuesta.CodigoError) {
                    throw new Error(data.Respuesta.Resultado || 'La API devolvió un error desconocido.');
                }
                
                Swal.close(); // Cerrar el SweetAlert de "Buscando..."
                statusMessageDiv.innerHTML = `<p class="alert alert-info">Se encontró a <b>${data.NombreFormateado}</b> por CUIL. Listo para inscribir y registrar asistencia.</p>`;

                const { isConfirmed } = await Swal.fire({
                    title: 'Nuevo Asistente Encontrado', icon: 'info',
                    html: `<p>Se encontró a:</p>
                           <ul style="text-align: left; list-style-position: inside;">
                               <li><b>Nombre:</b> ${data.NombreFormateado}</li>
                               <li><b>CUIL:</b> ${data.CuilFormateado}</li>
                           </ul>
                           <p>¿Inscribir a <b>"${course.name}" (${course.nroEvento})</b> y dar presente para la fecha <b>${formattedToday}</b>?</p>`,
                    showCancelButton: true, confirmButtonText: 'Sí, Inscribir y dar Presente', cancelButtonText: 'Cancelar'
                });

                if (isConfirmed) {
                    const newParticipant = {
                        id: appState.nextParticipantId++,
                        cuil: data.CUIL, name: data.NombreFormateado, reparticion: data.Reparticion || 'Inscripto en el día',
                        localidad: data.Domicilio?.Localidad || 'N/A', telefono: data.TelFormateado || data.CelFormateado || 'N/A', cargo: data.Cargo || 'N/A',
                        esEmpleadoPublico: data.EsEmpleadoPublico ? 'S' : 'N', attendance: {}, nota: ''
                    };
                    // Inicializar asistencia para todas las fechas del curso
                    course.dates.forEach(date => { newParticipant.attendance[date] = 0; });
                    // Marcar asistencia para hoy
                    newParticipant.attendance[todayString] = 1;

                    if (!appState.participants[course.id]) {
                        appState.participants[course.id] = [];
                    }
                    appState.participants[course.id].push(newParticipant);
                    
                    saveStateToLocalStorage();
                    statusMessageDiv.innerHTML = `<p class="alert alert-success">¡Éxito! <b>${newParticipant.name}</b> ha sido inscripto en <b>"${course.name}"</b> y su asistencia fue registrada para hoy.</p>`;
                    Swal.fire('¡Éxito!', `${newParticipant.name} ha sido inscripto en "${course.name}" y su asistencia fue registrada para hoy.`, 'success');
                } else {
                    statusMessageDiv.innerHTML = `<p class="alert alert-secondary">Inscripción y registro de asistencia cancelados por el usuario.</p>`;
                }
            } catch (error) {
                console.error("Error detallado en la búsqueda de API:", error);
                statusMessageDiv.innerHTML = `<p class="alert alert-danger">Error: No se pudo completar la operación de búsqueda externa: ${error.message}</p>`;
                Swal.fire('Error', `No se pudo completar la operación de búsqueda externa: ${error.message}`, 'error');
            }
        }
        console.log('--- Fin de processAsistencia ---');
    }

    // --- EJECUCIÓN INICIAL ---
    loadStateFromLocalStorage();
    processAsistencia(); 
});