let currentStudents = [];
let currentSession = null;

async function fetchCenters() {
    const { data: centers, error } = await supabaseClient
        .from('centers')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) { console.error(error); return; }

    const select = document.getElementById('center-select');
    const checkboxContainer = document.getElementById('center-checkboxes');

    select.innerHTML = '<option value="">— Select a Center —</option>';
    if (checkboxContainer) checkboxContainer.innerHTML = '';

    centers.forEach(center => {
        const option = document.createElement('option');
        option.value = center.id;
        option.textContent = center.name;
        select.appendChild(option);

        if (checkboxContainer) {
            const div = document.createElement('div');
            div.className = 'check-pill';
            div.innerHTML = `
                <input type="checkbox" class="center-check" value="${center.id}" id="check-${center.id}">
                <label for="check-${center.id}">${center.name}</label>`;
            checkboxContainer.appendChild(div);
        }
    });
}

async function handleCenterChange(select) {
    const centerId = select.value;
    if (!centerId) {
        document.getElementById('session-select').innerHTML = '<option value="">— Select a session —</option>';
        return;
    }

    // Load sessions for this center (past 30 days to future 30 days)
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: centerSessions } = await supabaseClient
        .from('schedule_centers')
        .select('schedule_id')
        .eq('center_id', centerId);

    if (!centerSessions || centerSessions.length === 0) {
        document.getElementById('session-select').innerHTML = '<option value="">— No sessions found —</option>';
        return;
    }

    const scheduleIds = centerSessions.map(s => s.schedule_id);

    const { data: sessions } = await supabaseClient
        .from('schedule')
        .select('id, lecture_topic, date_and_time, duration_min, courses(course_name)')
        .in('id', scheduleIds)
        .gte('date_and_time', startDate)
        .lte('date_and_time', endDate)
        .order('date_and_time', { ascending: true });

    const sessionSelect = document.getElementById('session-select');
    sessionSelect.innerHTML = '<option value="">— Select a session —</option>';

    if (!sessions || sessions.length === 0) {
        sessionSelect.innerHTML = '<option value="">— No sessions scheduled —</option>';
        return;
    }

    // Separate sessions into categories
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySessions = [];
    const upcomingSessions = [];
    const pastSessions = [];

    sessions.forEach(session => {
        const sessionDate = new Date(session.date_and_time);
        const sessionEndTime = new Date(sessionDate.getTime() + (session.duration_min || 0) * 60000);
        const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
        
        // Today's sessions (including those not finished yet)
        if (sessionDay.getTime() === today.getTime()) {
            todaySessions.push(session);
        } 
        // Future sessions
        else if (sessionDate > now) {
            upcomingSessions.push(session);
        } 
        // Past sessions
        else {
            pastSessions.push(session);
        }
    });

    // Helper function to create option element
    function createSessionOption(session) {
        const date = new Date(session.date_and_time);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const courseName = session.courses?.course_name || 'Unknown Course';
        
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${dateStr} ${timeStr} - ${session.lecture_topic} (${courseName})`;
        option.dataset.sessionData = JSON.stringify(session);
        
        return option;
    }

    // Render sessions in organized groups
    if (todaySessions.length > 0) {
        const todayGroup = document.createElement('optgroup');
        todayGroup.label = ' Today';
        todaySessions.forEach(session => {
            todayGroup.appendChild(createSessionOption(session));
        });
        sessionSelect.appendChild(todayGroup);
    }

    if (upcomingSessions.length > 0) {
        const upcomingGroup = document.createElement('optgroup');
        upcomingGroup.label = ' Upcoming';
        upcomingSessions.forEach(session => {
            upcomingGroup.appendChild(createSessionOption(session));
        });
        sessionSelect.appendChild(upcomingGroup);
    }

    if (pastSessions.length > 0) {
        const pastGroup = document.createElement('optgroup');
        pastGroup.label = ' Past Sessions';
        // Reverse order - most recent past sessions first
        pastSessions.reverse().forEach(session => {
            pastGroup.appendChild(createSessionOption(session));
        });
        sessionSelect.appendChild(pastGroup);
    }

    await fetchStudents(centerId);
    
    // Also render the session overview
    await renderSessionOverview();
}

async function fetchStudents(centerId) {
    const { data: students, error } = await supabaseClient
        .from('students')
        .select('*')
        .eq('center_id', centerId)
        .order('full_name');

    if (error) { console.error(error); return; }
    currentStudents = students || [];

    const tableBody = document.getElementById('student-list');
    if (currentStudents.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="empty">No students enrolled in this center yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = currentStudents.map(student => `
        <tr>
            <td>${student.full_name}</td>
            <td class="muted">${student.email}</td>
            <td><span class="badge badge-${(student.status || 'active').toLowerCase()}">${student.status || 'Active'}</span></td>
            <td class="actions">
                <button id="btn-Present-${student.id}" onclick="markAttendance('${student.id}', 'Present')" class="attendance-btn">Present</button>
                <button id="btn-Absent-${student.id}"  onclick="markAttendance('${student.id}', 'Absent')"  class="attendance-btn">Absent</button>
                <button id="btn-Excused-${student.id}" onclick="markAttendance('${student.id}', 'Excused')" class="attendance-btn">Excused</button>
            </td>
        </tr>`).join('');
}

async function loadAttendanceForSession() {
    const sessionSelect = document.getElementById('session-select');
    const selectedOption = sessionSelect.options[sessionSelect.selectedIndex];
    
    if (!selectedOption || !selectedOption.dataset.sessionData) {
        document.getElementById('session-details').style.display = 'none';
        document.getElementById('session-info').textContent = '—';
        return;
    }

    currentSession = JSON.parse(selectedOption.dataset.sessionData);
    
    // Display session details
    const date = new Date(currentSession.date_and_time);
    document.getElementById('detail-topic').textContent = currentSession.lecture_topic;
    document.getElementById('detail-datetime').textContent = date.toLocaleString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    document.getElementById('detail-duration').textContent = `${currentSession.duration_min} minutes`;
    document.getElementById('session-info').textContent = currentSession.lecture_topic;
    document.getElementById('session-details').style.display = 'block';

    // Reset all buttons
    resetAllButtons();

    // Load attendance for this session
    const { data: records } = await supabaseClient
        .from('attendance')
        .select('student_id, status')
        .eq('schedule_id', currentSession.id)
        .in('student_id', currentStudents.map(s => s.id));

    if (records) records.forEach(r => updateButtonVisuals(r.student_id, r.status));
}

async function markAttendance(studentId, status) {
    if (!currentSession) {
        return toast("Please select a session first.", "error");
    }

    const { data: existing } = await supabaseClient
        .from('attendance')
        .select('id')
        .eq('student_id', studentId)
        .eq('schedule_id', currentSession.id);

    if (existing && existing.length > 0) {
        await supabaseClient.from('attendance').update({ status }).eq('id', existing[0].id);
    } else {
        await supabaseClient.from('attendance').insert([{ 
            student_id: studentId, 
            status, 
            schedule_id: currentSession.id,
            class_date: new Date(currentSession.date_and_time).toISOString().split('T')[0]
        }]);
    }
    updateButtonVisuals(studentId, status);
}

async function fetchCourses() {
    const { data: courses, error } = await supabaseClient
        .from('courses')
        .select('id, course_name, moodle_course_id')
        .order('course_name', { ascending: true });

    if (error) { console.error(error); return; }

    const courseSelect = document.getElementById('sched-course');
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">— Select a course —</option>';
        
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.course_name;
            option.dataset.moodleId = course.moodle_course_id;
            courseSelect.appendChild(option);
        });
    }
}

async function onboardStudent(e) {
    e.preventDefault();
    const form = e.target;
    const fullName = form.full_name.value.trim();
    const email = form.email.value.trim();
    const centerId = form.center_id.value;
    
    const selectedCourses = Array.from(document.querySelectorAll('.course-check:checked')).map(cb => ({
        course_id: cb.value,
        moodle_course_id: parseInt(cb.dataset.moodleId, 10)
    }));

    if (!fullName || !email || !centerId) {
        return toast("Name, email, and center are required.", "error");
    }

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
        const { data: newStudent, error } = await supabaseClient.from('students').insert([{
            full_name: fullName,
            email,
            center_id: centerId,
            moodle_id: null,
            status: 'Active',
        }]).select().single();
        
        if (error) throw error;

        if (selectedCourses.length > 0) {
            const enrollmentRows = selectedCourses.map(c => ({
                student_id: newStudent.id,
                course_id: c.course_id,
                moodle_course_id: c.moodle_course_id,
            }));
            
            const { error: enrollError } = await supabaseClient
                .from('student_enrollments')
                .insert(enrollmentRows);
            
            if (enrollError) throw enrollError;
        }

        toast(`Student saved! Moodle account and enrollments in progress (~30 seconds).`, "success", 6000);
        form.reset();
        document.querySelectorAll('.course-check:checked').forEach(cb => cb.checked = false);
        loadOnboardingList();
    } catch (err) {
        console.error(err);
        toast(`Failed to save student: ${err.message}`, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Add Student";
    }
}

async function loadOnboardingList() {
    const { data, error } = await supabaseClient
        .from('students')
        .select('full_name, email, status, moodle_id, created_at, centers(name)')
        .order('created_at', { ascending: false })
        .limit(20);

    const tbody = document.getElementById('onboard-list');
    if (!tbody) return;
    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No students yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(s => {
        let statusBadge;
        if (s.moodle_id) {
            statusBadge = `<span class="badge badge-active">✓ Synced #${s.moodle_id}</span>`;
        } else if (s.status === 'Pending') {
            statusBadge = `<span class="badge badge-warn">⏳ Pending</span>`;
        } else {
            statusBadge = `<span class="badge badge-error">⚠ Not synced</span>`;
        }
        return `
        <tr>
            <td>${s.full_name}</td>
            <td class="muted">${s.email}</td>
            <td>${s.centers?.name || '—'}</td>
            <td>${statusBadge}</td>
            <td class="muted">${new Date(s.created_at).toLocaleDateString()}</td>
        </tr>`;
    }).join('');
}

async function populateOnboardingDropdowns() {
    const cSel = document.getElementById('onboard-center');
    const courseCheckboxes = document.getElementById('onboard-courses');
    
    if (!cSel || !courseCheckboxes) {
        console.log('Onboarding dropdowns not found, skipping populate');
        return;
    }
    
    const { data: centers } = await supabaseClient.from('centers').select('id, name').order('name');
    const { data: courses } = await supabaseClient.from('courses').select('id, course_name, moodle_course_id').order('course_name');
    
    cSel.innerHTML = '<option value="">— Select center —</option>' +
        (centers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    courseCheckboxes.innerHTML = (courses || []).filter(c => c.moodle_course_id).map(course => `
        <div class="check-pill">
            <input type="checkbox" class="course-check" value="${course.id}" 
                   data-moodle-id="${course.moodle_course_id}" id="course-${course.id}">
            <label for="course-${course.id}">${course.course_name}</label>
        </div>
    `).join('');
}

function toggleAllCourses() {
    const checkboxes = document.querySelectorAll('.course-check');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });
    
    const btn = event.target;
    btn.textContent = allChecked ? 'Select All' : 'Deselect All';
}

async function renderSessionOverview() {
    const centerId = document.getElementById('center-select')?.value;
    if (!centerId) {
        document.getElementById('session-overview-body').innerHTML = 
            '<tr><td colspan="6" class="empty">Select a center to view sessions.</td></tr>';
        return;
    }

    const timeframeDays = parseInt(document.getElementById('overview-timeframe')?.value || '30');
    const startDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();

    // Get sessions for this center
    const { data: centerSessions } = await supabaseClient
        .from('schedule_centers')
        .select('schedule_id')
        .eq('center_id', centerId);

    if (!centerSessions || centerSessions.length === 0) {
        document.getElementById('session-overview-body').innerHTML = 
            '<tr><td colspan="6" class="empty">No sessions found for this center.</td></tr>';
        return;
    }

    const scheduleIds = centerSessions.map(s => s.schedule_id);

    const { data: sessions } = await supabaseClient
        .from('schedule')
        .select('id, lecture_topic, date_and_time, duration_min, courses(course_name)')
        .in('id', scheduleIds)
        .gte('date_and_time', startDate)
        .lte('date_and_time', endDate)
        .order('date_and_time', { ascending: false });

    if (!sessions || sessions.length === 0) {
        document.getElementById('session-overview-body').innerHTML = 
            '<tr><td colspan="6" class="empty">No sessions in selected timeframe.</td></tr>';
        return;
    }

    // Get attendance for these sessions
    const { data: attendanceRecords } = await supabaseClient
        .from('attendance')
        .select('schedule_id, status, student_id')
        .in('schedule_id', scheduleIds);

    // Get total students in this center
    const { data: centerStudents } = await supabaseClient
        .from('students')
        .select('id')
        .eq('center_id', centerId);

    const totalStudents = centerStudents?.length || 0;

    const tbody = document.getElementById('session-overview-body');
    tbody.innerHTML = sessions.map(session => {
        const sessionAttendance = attendanceRecords?.filter(a => a.schedule_id === session.id) || [];
        const presentCount = sessionAttendance.filter(a => a.status === 'Present').length;
        const totalMarked = sessionAttendance.length;
        const attendanceRate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

        const date = new Date(session.date_and_time);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        let rateBadge = '';
        if (totalMarked === 0) {
            rateBadge = '<span class="badge">No data</span>';
        } else if (attendanceRate >= 80) {
            rateBadge = `<span class="badge badge-active">${attendanceRate}%</span>`;
        } else if (attendanceRate >= 60) {
            rateBadge = `<span class="badge badge-warn">${attendanceRate}%</span>`;
        } else {
            rateBadge = `<span class="badge badge-error">${attendanceRate}%</span>`;
        }

        return `
        <tr>
            <td><strong>${session.lecture_topic}</strong></td>
            <td class="muted">${session.courses?.course_name || '—'}</td>
            <td>
                <div>${dateStr}</div>
                <div class="muted">${timeStr}</div>
            </td>
            <td class="muted">${session.duration_min} min</td>
            <td>
                <div><strong>${presentCount}</strong> / ${totalMarked} marked</div>
                <div class="muted">${totalStudents} total students</div>
            </td>
            <td>
                <button onclick="showSessionAttendanceDetails('${session.id}', '${session.lecture_topic.replace(/'/g, "\\'")}', '${dateStr} ${timeStr}')" 
                        class="btn-link" style="text-decoration: none;">
                    ${rateBadge}
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function showSessionAttendanceDetails(sessionId, sessionTitle, sessionDateTime) {
    document.getElementById('attendance-modal').classList.add('active');
    
    document.getElementById('modal-session-title').textContent = sessionTitle;
    document.getElementById('modal-session-info').innerHTML = `
        <strong>Date & Time:</strong> ${sessionDateTime}
    `;

    const { data: attendanceRecords } = await supabaseClient
        .from('attendance')
        .select('student_id, status, students(full_name, email)')
        .eq('schedule_id', sessionId);

    if (!attendanceRecords || attendanceRecords.length === 0) {
        document.getElementById('modal-student-list').innerHTML = 
            '<tr><td colspan="3" class="empty">No attendance marked for this session yet.</td></tr>';
        document.getElementById('modal-present-count').textContent = '0';
        document.getElementById('modal-absent-count').textContent = '0';
        document.getElementById('modal-excused-count').textContent = '0';
        return;
    }


    const presentCount = attendanceRecords.filter(r => r.status === 'Present').length;
    const absentCount = attendanceRecords.filter(r => r.status === 'Absent').length;
    const excusedCount = attendanceRecords.filter(r => r.status === 'Excused').length;

    document.getElementById('modal-present-count').textContent = presentCount;
    document.getElementById('modal-absent-count').textContent = absentCount;
    document.getElementById('modal-excused-count').textContent = excusedCount;


    const sortOrder = { 'Present': 1, 'Excused': 2, 'Absent': 3 };
    attendanceRecords.sort((a, b) => sortOrder[a.status] - sortOrder[b.status]);


    const tbody = document.getElementById('modal-student-list');
    tbody.innerHTML = attendanceRecords.map(record => {
        let statusBadge = '';
        if (record.status === 'Present') {
            statusBadge = '<span class="badge badge-active">✓ Present</span>';
        } else if (record.status === 'Absent') {
            statusBadge = '<span class="badge badge-error">✗ Absent</span>';
        } else {
            statusBadge = '<span class="badge badge-warn">⚠ Excused</span>';
        }

        return `
        <tr>
            <td><strong>${record.students?.full_name || 'Unknown'}</strong></td>
            <td class="muted">${record.students?.email || '—'}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
}

function closeAttendanceModal() {
    document.getElementById('attendance-modal').classList.remove('active');
}


document.addEventListener('click', function(event) {
    const modal = document.getElementById('attendance-modal');
    if (event.target === modal) {
        closeAttendanceModal();
    }
});


document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAttendanceModal();
    }
});
