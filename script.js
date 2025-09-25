document.addEventListener('DOMContentLoaded', () => {

    // Listener para el input de archivo CSV
    const csvInput = document.getElementById('participants-csv-input');
    if (csvInput) {
        csvInput.addEventListener('change', handleCsvUpload);
    }

    // SweetAlert2 Toast Mixin para notificaciones de éxito no intrusivas
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    // --- ESTADO DE LA APLICACIÓN (Base de datos en memoria) ---
    const appState = {
        courses: [{
            id: 1,
            name: 'Curso de Ejemplo (Ya Cargado)',
            date: '2023-10-25',
            status: 'Publicado'
        }, ],
        participants: {
            1: [{
                id: 101,
                name: 'Carlos Pérez',
                dni: '12.345.678',
                status: 'Pendiente',
                attendanceCount: 0
            }, {
                id: 102,
                name: 'Ana Gómez',
                dni: '23.456.789',
                status: 'Presente',
                attendanceCount: 1
            }, ],
        },
        nextCourseId: 2,
        nextParticipantId: 103,
        currentCourseId: null,
        createModal: {
            currentStep: 1,
            flowType: null,
            existingCourseId: null,
            data: {
                name: '',
                date: '',
                participants: []
            }
        }
    };

    // --- RENDERIZADO DE VISTAS ---
    function renderCourseList() {
        const tableBody = document.querySelector('#course-list-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = appState.courses.map(course => `
            <tr data-course-id="${course.id}">
                <td>${course.name}</td>
                <td>${new Date(course.date + 'T00:00:00').toLocaleDateString()}</td>
                <td>${appState.participants[course.id]?.length || 0}</td>
                <td><span class="status-badge status-${course.status.toLowerCase()}">${course.status}</span></td>
                <td><button class="btn btn-primary view-details-btn">Ver Detalle</button></td>
            </tr>`).join('');
    }

    function renderParticipantList(courseId) {
        const tableBody = document.querySelector('#participant-list-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = (appState.participants[courseId] || []).map(p => {
            const statusClass = `status-${p.status.toLowerCase()}`;
            const attendanceCounter = p.attendanceCount > 1 ? `<span class="attendance-count">+${p.attendanceCount}</span>` : '';
            return `
                <tr data-participant-id="${p.id}">
                    <td>${p.name}</td>
                    <td>${p.dni}</td>
                    <td><span class="status-badge ${statusClass}">${p.status}</span>${attendanceCounter}</td>
                    <td><button class="btn btn-primary mark-attendance-btn">Marcar Presente</button></td>
                </tr>`;
        }).join('');
    }

    function renderCourseDetail(courseId) {
        const course = appState.courses.find(c => c.id === courseId);
        if (!course) return;
        appState.currentCourseId = courseId;
        document.getElementById('course-detail-title').textContent = course.name;
        document.getElementById('course-detail-date').textContent = `Fecha: ${new Date(course.date + 'T00:00:00').toLocaleDateString()}`;
        switchTab('details');
        renderParticipantList(courseId);
    }

    // --- LÓGICA DE NAVEGACIÓN Y PESTAÑAS ---
    function showView(viewId) {
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        document.querySelectorAll('.MuiListItemButton-root').forEach(i => i.classList.remove('Mui-selected'));
        const activeLink = document.querySelector(`[data-view="${viewId}"]`);
        if (activeLink) {
            activeLink.classList.add('Mui-selected');
            const headerTitleEl = document.getElementById('header-title');
            if (headerTitleEl) {
                const textSpan = activeLink.querySelector('.MuiListItemText-primary');
                if (textSpan) headerTitleEl.textContent = textSpan.textContent.trim();
            }
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('#view-course-detail .tab-content, #view-course-detail .tab-item').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');
        document.querySelector(`.tab-item[data-tab="${tabId}"]`).classList.add('active');
    }

    // --- LÓGICA DE MODALES ---
    const qrModal = document.getElementById('qr-modal');
    const createCourseModal = document.getElementById('create-course-modal');

    function showQrModal(courseId) {
        const course = appState.courses.find(c => c.id === courseId);
        if (!course) return;
        document.getElementById('qrcode-container').innerHTML = '';
        new QRCode(document.getElementById('qrcode-container'), {
            text: `https://inscribcordoba.com/asistencia?curso=${course.id}`,
            width: 256,
            height: 256
        });
        document.getElementById('qr-modal-title').textContent = `QR para: ${course.name}`;
        qrModal.classList.add('visible');
    }

    function resetAndShowCreateModal() {
        appState.createModal = {
            currentStep: 1,
            flowType: null,
            existingCourseId: null,
            data: {
                name: '',
                date: '',
                participants: []
            }
        };
        document.getElementById('course-search').value = '';
        document.getElementById('course-search-results').innerHTML = '';
        document.getElementById('cohort-date').value = '';
        document.getElementById('new-course-name').value = '';
        document.getElementById('new-course-date').value = '';
        document.getElementById('participants-textarea').value = '';
        document.getElementById('participants-csv-input').value = ''; // Limpia el input de archivo
        updateModalStepView();
        createCourseModal.classList.add('visible');
    }

    function closeModal() {
        qrModal.classList.remove('visible');
        createCourseModal.classList.remove('visible');
    }

    function handleSearchCourses() {
        const searchTerm = document.getElementById('course-search').value.toLowerCase();
        const resultsContainer = document.getElementById('course-search-results');
        if (searchTerm.length < 3) {
            resultsContainer.innerHTML = '<p>Escribe al menos 3 letras para buscar.</p>';
            return;
        }
        const matchedCourses = appState.courses.filter(c => c.name.toLowerCase().includes(searchTerm));
        if (matchedCourses.length > 0) {
            resultsContainer.innerHTML = matchedCourses.map(course => `<div class="search-result-item" data-course-id="${course.id}">${course.name}</div>`).join('');
        } else {
            resultsContainer.innerHTML = '<p>No se encontraron cursos. Puedes crear uno nuevo.</p>';
        }
    }

    function handleSelectExistingCourse(courseId) {
        const course = appState.courses.find(c => c.id === courseId);
        if (!course) return;
        appState.createModal.flowType = 'existing';
        appState.createModal.existingCourseId = courseId;
        appState.createModal.data.name = course.name;
        appState.createModal.currentStep = '2a';
        document.getElementById('existing-event-name').textContent = course.name;
        updateModalStepView();
    }

    function handleStartNewCourseFlow() {
        appState.createModal.flowType = 'new';
        appState.createModal.currentStep = '2b';
        updateModalStepView();
    }

    function handleCsvUpload(event) {
        const file = event.target.files[0];
        const textarea = document.getElementById('participants-textarea');
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            Swal.fire({
                icon: 'error',
                title: 'Archivo Incorrecto',
                text: 'Por favor, selecciona un archivo con extensión .csv'
            });
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const text = e.target.result;
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    const firstLine = lines[0].toLowerCase();
                    if (firstLine.includes('nombre') || firstLine.includes('dni')) {
                        lines.shift(); // Quita la cabecera
                    }
                }
                const formattedText = lines.map(line => {
                    let [name, dni] = line.split(',');
                    return `${(name || '').trim().replace(/"/g, '')}, ${(dni || '').trim().replace(/"/g, '')}`;
                }).join('\n');

                textarea.value = formattedText;
                Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: `Se han cargado ${lines.length} participantes. Revísalos y presiona "Siguiente".`
                });
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error de Procesamiento',
                    text: 'No se pudo procesar el archivo. Revisa su formato.'
                });
            }
        };
        reader.onerror = () => Swal.fire({
            icon: 'error',
            title: 'Error de Lectura',
            text: 'No se pudo leer el archivo.'
        });
        reader.readAsText(file);
    }

    function updateModalStepView() {
        const {
            currentStep
        } = appState.createModal;
        document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
        document.getElementById(`modal-step-${currentStep}`).classList.add('active');
        const prevBtn = document.getElementById('modal-prev-btn');
        const nextBtn = document.getElementById('modal-next-btn');
        const createBtn = document.getElementById('modal-create-btn');
        const title = document.getElementById('create-modal-title');
        prevBtn.style.visibility = 'hidden';
        nextBtn.style.display = 'none';
        createBtn.style.display = 'none';
        switch (currentStep) {
            case 1:
                title.textContent = 'Crear Nueva Cohorte (Paso 1 de 4)';
                break;
            case '2a':
                title.textContent = `Añadir Fecha (Paso 2 de 4)`;
                prevBtn.style.visibility = 'visible';
                nextBtn.style.display = 'inline-flex';
                break;
            case '2b':
                title.textContent = `Nuevo Evento (Paso 2 de 4)`;
                prevBtn.style.visibility = 'visible';
                nextBtn.style.display = 'inline-flex';
                break;
            case 3:
                title.textContent = `Añadir Participantes (Paso 3 de 4)`;
                prevBtn.style.visibility = 'visible';
                nextBtn.style.display = 'inline-flex';
                break;
            case 4:
                title.textContent = 'Confirmación (Paso 4 de 4)';
                prevBtn.style.visibility = 'visible';
                createBtn.style.display = 'inline-flex';
                break;
        }
    }

    function handleModalNext() {
        const { currentStep, data } = appState.createModal;
        if (currentStep === '2a') {
            data.date = document.getElementById('cohort-date').value;
            if (!data.date) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Campo Requerido',
                    text: 'Por favor, selecciona una fecha.'
                });
                return;
            }
            appState.createModal.currentStep = 3;
        } else if (currentStep === '2b') {
            data.name = document.getElementById('new-course-name').value;
            data.date = document.getElementById('new-course-date').value;
            if (!data.name || !data.date) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Datos Incompletos',
                    text: 'Por favor, completa el nombre y la fecha.'
                });
                return;
            }
            appState.createModal.currentStep = 3;
        } else if (currentStep === 3) {
            const text = document.getElementById('participants-textarea').value;
            data.participants = text.split('\n').filter(line => line.trim() !== '').map(line => {
                const [name, dni] = line.split(',').map(s => s.trim());
                return {
                    name,
                    dni
                };
            });
            if (data.participants.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Lista Vacía',
                    text: 'Por favor, añade al menos un participante.'
                });
                return;
            }
            document.getElementById('confirmation-course-name').textContent = data.name;
            document.getElementById('confirmation-course-date').textContent = new Date(data.date + 'T00:00:00').toLocaleDateString();
            document.getElementById('confirmation-participant-count').textContent = data.participants.length;
            document.getElementById('confirmation-participant-list').innerHTML = data.participants.map(p => `<div>• ${p.name || 'Sin nombre'} (${p.dni || 'Sin DNI'})</div>`).join('');
            appState.createModal.currentStep = 4;
        }
        updateModalStepView();
    }

    function handleModalPrev() {
        const {
            currentStep,
            flowType
        } = appState.createModal;
        if (currentStep === 4) appState.createModal.currentStep = 3;
        else if (currentStep === 3) appState.createModal.currentStep = flowType === 'existing' ? '2a' : '2b';
        else if (currentStep === '2a' || currentStep === '2b') appState.createModal.currentStep = 1;
        updateModalStepView();
    }

    function handleCreateCourse() {
        const {
            data
        } = appState.createModal;
        const newCourseId = appState.nextCourseId++;
        appState.courses.push({
            id: newCourseId,
            name: data.name,
            date: data.date,
            status: 'Publicado'
        });
        appState.participants[newCourseId] = data.participants.map(p => ({
            id: appState.nextParticipantId++,
            name: p.name,
            dni: p.dni,
            status: 'Pendiente',
            attendanceCount: 0
        }));
        closeModal();
        renderCourseList();
        renderCourseDetail(newCourseId);
        showView('course-detail');
        Toast.fire({
            icon: 'success',
            title: 'Cohorte creada exitosamente'
        });
    }

    // --- EVENT LISTENERS ---
    document.body.addEventListener('click', e => {
        const navLink = e.target.closest('[data-view]');
        if (navLink) {
            e.preventDefault();
            showView(navLink.dataset.view);
            if (navLink.dataset.view === 'courses') renderCourseList();
        }
        if (e.target.classList.contains('view-details-btn')) {
            const courseId = parseInt(e.target.closest('tr').dataset.courseId);
            renderCourseDetail(courseId);
            showView('course-detail');
        }
        if (e.target.classList.contains('mark-attendance-btn')) {
            const participantId = parseInt(e.target.closest('tr').dataset.participantId);
            const participant = appState.participants[appState.currentCourseId].find(p => p.id === participantId);
            if (participant) {
                participant.status = 'Presente';
                participant.attendanceCount++;
                renderParticipantList(appState.currentCourseId);
            }
        }
        if (e.target.id === 'create-course-btn') resetAndShowCreateModal();
        if (e.target.id === 'search-event-btn') handleSearchCourses();
        if (e.target.id === 'create-new-event-btn') handleStartNewCourseFlow();
        const searchResult = e.target.closest('.search-result-item');
        if (searchResult) {
            handleSelectExistingCourse(parseInt(searchResult.dataset.courseId));
        }
        if (e.target.id === 'modal-next-btn') handleModalNext();
        if (e.target.id === 'modal-prev-btn') handleModalPrev();
        if (e.target.id === 'modal-create-btn') handleCreateCourse();
        if (e.target.id === 'show-qr-btn') showQrModal(appState.currentCourseId);
        if (e.target.classList.contains('close-modal-btn') || e.target.id === 'create-course-modal' || e.target.id === 'qr-modal') closeModal();
        const tabItem = e.target.closest('.tab-item[data-tab]');
        if (tabItem) switchTab(tabItem.dataset.tab);
    });

    // --- INICIALIZACIÓN ---
    showView('dashboard');
});