document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN INICIAL Y LISTENERS ESPECÍFICOS ---
    const importModal = document.getElementById('import-course-modal');
    const importFileInput = document.getElementById('excel-file-input');
    const processExcelBtn = document.getElementById('process-excel-btn');
    
    if (importFileInput) {
        importFileInput.addEventListener('change', () => {
            const fileNameDisplay = document.getElementById('excel-file-name');
            if (importFileInput.files.length > 0) {
                fileNameDisplay.textContent = `Archivo: ${importFileInput.files[0].name}`;
                processExcelBtn.disabled = false;
            } else {
                fileNameDisplay.textContent = '';
                processExcelBtn.disabled = true;
            }
        });
    }
    
    const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
        didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); }
    });

    // --- ESTADO DE LA APLICACIÓN ---
    const appState = {
        courses: [], participants: {}, nextCourseId: 1, nextParticipantId: 1, currentCourseId: null,
        currentFilter: ''
    };

    // --- LÓGICA DE PERSISTENCIA DE DATOS ---
    function saveStateToLocalStorage() {
        try {
            const stateToSave = {
                courses: appState.courses,
                participants: appState.participants,
                nextCourseId: appState.nextCourseId,
                nextParticipantId: appState.nextParticipantId
            };
            localStorage.setItem('inscribCordobaState', JSON.stringify(stateToSave));
            console.log('Estado guardado en localStorage.');
        } catch (error) {
            console.error('Error al guardar el estado en localStorage:', error);
        }
    }

    function loadStateFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('inscribCordobaState');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                appState.courses = parsedState.courses || [];
                appState.participants = parsedState.participants || {};
                appState.nextCourseId = parsedState.nextCourseId || 1;
                appState.nextParticipantId = parsedState.nextParticipantId || 1;
                console.log('Estado cargado desde localStorage.');
            }
        } catch (error) {
            console.error('Error al cargar el estado desde localStorage:', error);
        }
    }

    // --- LÓGICA DE IMPORTACIÓN DE EXCEL ---
    async function askForRoom() {
        const { value: roomCode } = await Swal.fire({
            title: 'Ingrese la sala donde se dictará el curso',
            html: `
                <p style="font-size:0.9rem; color:#6c757d; margin-top:0.5rem; line-height: 1.5;">
                    Sala de gestión (ingrese <b>SG</b>)<br>
                    Sala de informática 1 (ingrese <b>SI1</b>)<br>
                    Sala de informática 2 (ingrese <b>SI2</b>)<br>
                    Sala externa (ingrese <b>SE(Nombre sala)</b>)
                </p>`,
            input: 'text',
            inputPlaceholder: 'Ej: SG o SE(Auditorio Principal)',
            showCancelButton: true,
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'custom-swal-popup', title: 'custom-swal-title', htmlContainer: 'custom-swal-html',
                input: 'custom-swal-input', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-secondary'
            },
            buttonsStyling: false,
            preConfirm: (value) => {
                const upperValue = value.trim().toUpperCase();
                if (!value.trim()) {
                    Swal.showValidationMessage('Debe ingresar un código de sala.'); return false;
                }
                if (upperValue === 'SG' || upperValue === 'SI1' || upperValue === 'SI2' || (upperValue.startsWith('SE(') && upperValue.endsWith(')') && upperValue.length > 4)) {
                    return value.trim();
                } else {
                    Swal.showValidationMessage('El formato ingresado no es correcto. Revise las opciones.'); return false;
                }
            }
        });

        if (roomCode) {
            handleExcelUpload(roomCode);
        } else {
            importFileInput.value = '';
            document.getElementById('excel-file-name').textContent = '';
        }
    }

    async function handleExcelUpload(roomCode) {
        const file = importFileInput.files[0]; if (!file) return;
        Swal.fire({ title: 'Procesando...', text: 'Leyendo la planilla de Excel.', didOpen: () => { Swal.showLoading(); } });

        try {
            let sala = '', capacidad = 0;
            const upperCode = roomCode.toUpperCase();
            if (upperCode === 'SG') { sala = 'Sala de gestión'; capacidad = 60; }
            if (upperCode === 'SI1') { sala = 'Sala de informática 1'; capacidad = 16; }
            if (upperCode === 'SI2') { sala = 'Sala de informática 2'; capacidad = 16; }
            if (upperCode.startsWith('SE(')) { sala = roomCode.substring(3, roomCode.length - 1); capacidad = 100; }

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const getCellValue = (cellAddress) => sheet[cellAddress] ? (sheet[cellAddress].w || sheet[cellAddress].v) : '';
            const nroEvento = parseInt(getCellValue('C4'));
            if (!nroEvento || isNaN(nroEvento)) throw new Error("N° de Evento no encontrado o inválido en la celda C4.");
            if (appState.courses.some(c => c.nroEvento === nroEvento)) throw new Error(`El curso con N° de Evento ${nroEvento} ya existe.`);

            const courseData = { id: appState.nextCourseId++, nroEvento, name: getCellValue('C5'), docentes: getCellValue('C6'), status: 'Publicado', sala, capacidad, dates: [] };

            const dateColumns = ['H', 'I', 'J', 'K', 'L', 'M', 'N'];
            for (const col of dateColumns) {
                const cellAddress = `${col}9`; const cell = sheet[cellAddress];
                if (cell && cell.v && cell.v.toString().toUpperCase() !== 'NOTA') {
                    if (cell.t === 'n' || (typeof cell.v === 'string' && (cell.v.includes('/') || cell.v.includes('-')))) {
                        const date = new Date(XLSX.SSF.format('yyyy-mm-dd', cell.v));
                        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        courseData.dates.push(formattedDate);
                    } else break;
                } else break;
            }
            
            const participants = []; let rowIndex = 10;
            while (getCellValue(`B${rowIndex}`)) {
                const participant = {
                    id: appState.nextParticipantId++, cuil: getCellValue(`B${rowIndex}`), name: getCellValue(`C${rowIndex}`),
                    reparticion: getCellValue(`D${rowIndex}`), localidad: getCellValue(`E${rowIndex}`), telefono: getCellValue(`F${rowIndex}`),
                    cargo: getCellValue(`G${rowIndex}`), esEmpleadoPublico: 'S', attendance: {}, nota: ''
                };
                courseData.dates.forEach(date => { participant.attendance[date] = 0; });
                participants.push(participant);
                rowIndex++;
            }

            appState.courses.push(courseData);
            appState.participants[courseData.id] = participants;
            saveStateToLocalStorage(); 

            closeModal(); renderCourseList(); showView('course-detail'); renderCourseDetail(courseData.id);
            Swal.fire('¡Éxito!', `Se ha cargado el curso "${courseData.name}" con ${participants.length} participantes.`, 'success');
        } catch (error) {
            console.error("Error al procesar el Excel:", error);
            Swal.fire('Error', `Hubo un problema al procesar el archivo: ${error.message}`, 'error');
        } finally {
            importFileInput.value = ''; document.getElementById('excel-file-name').textContent = '';
        }
    }

    // --- LÓGICA DE DESCARGA A EXCEL ---
    function handleDownloadExcel() {
        const course = appState.courses.find(c => c.id === appState.currentCourseId);
        const participants = appState.participants[course.id]; if (!course || !participants) return;
        const courseHeader = [
            ['Planilla Control de Asistencia y Calificación'], [],
            ['NRO DE EVENTO:', null, course.nroEvento], ['CAPACITACION:', null, course.name], ['DOCENTE/S:', null, course.docentes],
            ['FECHA DE INICIO:', null, course.dates.length > 0 ? new Date(course.dates[0] + 'T00:00:00').toLocaleDateString() : ''],
            ['FECHA DE FIN:', null, course.dates.length > 0 ? new Date(course.dates[course.dates.length - 1] + 'T00:00:00').toLocaleDateString() : ''], []
        ];
        const participantHeader = ['N°', 'CUIL', 'APELLIDO Y NOMBRE', 'REPARTICION', 'LOCALIDAD', 'TELEFONO', 'CARGO', ...course.dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString()), 'NOTA'];
        const dataRows = participants.map((p, index) => {
            const attendanceByDate = course.dates.map(date => p.attendance[date] === 1 ? 'Presente' : 'Ausente');
            return [index + 1, p.cuil, p.name, p.reparticion, p.localidad, p.telefono, p.cargo, ...attendanceByDate, p.nota];
        });
        const finalData = [...courseHeader, participantHeader, ...dataRows];
        const worksheet = XLSX.utils.aoa_to_sheet(finalData);
        worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
        worksheet['!cols'] = [{ wch: 4 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, ...course.dates.map(() => ({ wch: 12 })), { wch: 8 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia');
        XLSX.writeFile(workbook, `Asistencia - ${course.name}.xlsx`);
    }

    // --- RENDERIZADO DE VISTAS ---
    function renderCourseList() { const tableBody = document.querySelector('#course-list-table tbody'); tableBody.innerHTML = appState.courses.map(course => ` <tr data-course-id="${course.id}"> <td>${course.name}</td> <td>${course.dates.length > 0 ? new Date(course.dates[0] + 'T00:00:00').toLocaleDateString() : 'N/A'}</td> <td>${appState.participants[course.id]?.length || 0}</td> <td><span class="status-badge status-publicado">Publicado</span></td> <td><button class="btn btn-primary view-details-btn">Ver Detalle</button></td> </tr>`).join(''); }
    
    function renderParticipantList(courseId) {
        const course = appState.courses.find(c => c.id === courseId); let participants = appState.participants[courseId] || [];
        const filterTerm = appState.currentFilter.toLowerCase();
        if (filterTerm) { participants = participants.filter(p => p.name.toLowerCase().includes(filterTerm) || p.cuil.includes(filterTerm)); }
        const tableHead = document.querySelector('#participant-list-table thead');
        const tableBody = document.querySelector('#participant-list-table tbody');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let headerHtml = '<tr><th>Nombre</th><th>CUIL</th><th>Repartición</th><th>Es empleado publico</th>';
        course.dates.forEach(date => headerHtml += `<th style="text-align: center;">${new Date(date + 'T00:00:00').toLocaleDateString()}</th>`);
        headerHtml += '<th>Nota</th><th>Acciones</th></tr>'; tableHead.innerHTML = headerHtml;
        tableBody.innerHTML = participants.map(p => {
            let rowHtml = `<tr data-participant-id="${p.id}"><td>${p.name}</td><td>${p.cuil}</td><td>${p.reparticion}</td><td>${p.esEmpleadoPublico || ''}</td>`;
            course.dates.forEach(date => {
                const status = p.attendance[date]; const courseDate = new Date(date + 'T00:00:00');
                let iconHtml = (status === 1) ? '<span class="attendance-icon attendance-present">✔</span>' : (courseDate > today) ? '<span class="attendance-icon attendance-pending">-</span>' : '<span class="attendance-icon attendance-absent">✖</span>';
                rowHtml += `<td style="text-align: center;">${iconHtml}</td>`;
            });
            rowHtml += `<td><input type="text" class="note-input" data-participant-id="${p.id}" value="${p.nota || ''}"></td>`;
            rowHtml += '<td>';
            course.dates.forEach(date => { rowHtml += `<button class="btn btn-primary btn-sm mark-attendance-btn" data-date="${date}" title="Marcar presente para ${new Date(date + 'T00:00:00').toLocaleDateString()}">P</button>`; });
            rowHtml += `<button class="btn btn-success btn-sm save-note-btn" title="Guardar nota"><i class="fas fa-save"></i></button></td></tr>`;
            return rowHtml;
        }).join('');
    }

    function renderCourseDetail(courseId) {
        const course = appState.courses.find(c => c.id === courseId); if (!course) return; appState.currentCourseId = courseId;
        document.getElementById('course-detail-title-main').textContent = course.name;
        document.getElementById('course-detail-nro-evento').textContent = course.nroEvento;
        document.getElementById('course-detail-docentes').textContent = course.docentes;
        document.getElementById('course-detail-all-dates').textContent = course.dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString()).join(' | ');
        document.getElementById('course-detail-sala').textContent = course.sala || 'No definida';
        const participantCount = appState.participants[courseId]?.length || 0;
        document.getElementById('course-detail-capacidad').textContent = `${participantCount} / ${course.capacidad || 'N/A'}`;
        switchTab('details'); renderParticipantList(courseId);
    }
    
    // --- LÓGICA DE NAVEGACIÓN Y MODALES ---
    function showView(viewId) { document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active')); document.getElementById(`view-${viewId}`).classList.add('active'); document.querySelectorAll('.MuiListItemButton-root').forEach(i => i.classList.remove('Mui-selected')); const activeLink = document.querySelector(`[data-view="${viewId}"]`); if (activeLink) { activeLink.classList.add('Mui-selected'); const headerTitleEl = document.getElementById('header-title'); if (headerTitleEl) { const textSpan = activeLink.querySelector('.MuiListItemText-primary'); if (textSpan) headerTitleEl.textContent = textSpan.textContent.trim(); } } }
    function switchTab(tabId) { document.querySelectorAll('#view-course-detail .tab-content, #view-course-detail .tab-item').forEach(el => el.classList.remove('active')); document.getElementById(`tab-${tabId}`).classList.add('active'); document.querySelector(`.tab-item[data-tab="${tabId}"]`).classList.add('active'); }
    function showQrModal(courseId) { const course = appState.courses.find(c => c.id === courseId); if (!course) return; document.getElementById('qrcode-container').innerHTML = ''; new QRCode(document.getElementById('qrcode-container'), { text: `https://inscribcordoba.com/asistencia?curso=${course.id}`, width: 256, height: 256 }); document.getElementById('qr-modal-title').textContent = `QR para: ${course.name}`; document.getElementById('qr-modal').classList.add('visible'); }
    function closeModal() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('visible')); }

    // --- EVENT LISTENER PRINCIPAL ---
    document.body.addEventListener('click', e => {
        const target = e.target;
        const navLink = target.closest('[data-view]'); if (navLink) { e.preventDefault(); showView(navLink.dataset.view); if (navLink.dataset.view === 'courses') renderCourseList(); }
        if (target.classList.contains('view-details-btn')) { const courseId = parseInt(target.closest('tr').dataset.courseId); renderCourseDetail(courseId); showView('course-detail'); }
        const tabItem = target.closest('.tab-item[data-tab]'); if (tabItem) switchTab(tabItem.dataset.tab);
        if (target.id === 'import-course-btn') { importModal.classList.add('visible'); }
        if (target.id === 'process-excel-btn') { closeModal(); askForRoom(); }
        if (target.id === 'download-excel-btn') { handleDownloadExcel(); }
        if (target.id === 'show-qr-btn') { showQrModal(appState.currentCourseId); }
        if (target.classList.contains('close-modal-btn')) { closeModal(); }
        if (target.classList.contains('mark-attendance-btn')) { const participantId = parseInt(target.closest('tr').dataset.participantId); const dateToMark = target.dataset.date; const participant = appState.participants[appState.currentCourseId].find(p => p.id === participantId); if (participant) { participant.attendance[dateToMark] = 1; renderParticipantList(appState.currentCourseId); saveStateToLocalStorage(); } }
        if (target.closest('.save-note-btn')) {
            const row = target.closest('tr'); const participantId = parseInt(row.dataset.participantId);
            const participant = appState.participants[appState.currentCourseId].find(p => p.id === participantId);
            if (participant) { const noteInput = row.querySelector('.note-input'); participant.nota = noteInput.value; saveStateToLocalStorage(); Toast.fire({ icon: 'success', title: 'Nota guardada' }); }
        }
        if (target.id === 'save-all-notes-btn') {
            const noteInputs = document.querySelectorAll('#participant-list-table .note-input'); let savedCount = 0;
            noteInputs.forEach(input => {
                const participantId = parseInt(input.dataset.participantId); const participant = appState.participants[appState.currentCourseId].find(p => p.id === participantId);
                if (participant) { participant.nota = input.value; savedCount++; }
            });
            saveStateToLocalStorage(); Toast.fire({ icon: 'success', title: `${savedCount} notas guardadas/actualizadas` });
        }
        if (target.id === 'clear-filter-btn') { document.getElementById('participant-filter-input').value = ''; appState.currentFilter = ''; renderParticipantList(appState.currentCourseId); }
    });

    // Listener para el filtro en tiempo real
    document.getElementById('participant-filter-input').addEventListener('keyup', (e) => { appState.currentFilter = e.target.value; renderParticipantList(appState.currentCourseId); });

    // --- INICIALIZACIÓN ---
    loadStateFromLocalStorage();
    showView('dashboard');
    if (appState.courses.length > 0) { renderCourseList(); }
});