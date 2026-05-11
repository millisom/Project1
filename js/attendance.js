let currentStudents = [];

async function fetchCenters() {
    const { data: centers, error } = await supabaseClient
        .from('centers')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) { console.error(error); return; }

    const select = document.getElementById('center-select');
    const checkboxContainer = document.getElementById('center-checkboxes');

    select.innerHTML = '<option value="">— Select a Center —</option>';
    checkboxContainer.innerHTML = '';

    centers.forEach(center => {
        const option = document.createElement('option');
        option.value = center.id;
        option.textContent = center.name;
        select.appendChild(option);

        const div = document.createElement('div');
        div.className = 'check-pill';
        div.innerHTML = `
            <input type="checkbox" class="center-check" value="${center.id}" id="check-${center.id}">
            <label for="check-${center.id}">${center.name}</label>`;
        checkboxContainer.appendChild(div);
    });
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
        document.getElementById('overview-body').innerHTML = '';
        document.getElementById('overview-head').innerHTML = '';
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

    loadAttendanceForDate();
    renderOverviewTable();
}

async function markAttendance(studentId, status) {
    const selectedDate = document.getElementById('class-date').value;
    if (!selectedDate) return toast("Select a date first.", "error");

    const { data: existing } = await supabaseClient
        .from('attendance')
        .select('id')
        .eq('student_id', studentId)
        .eq('class_date', selectedDate);

    if (existing && existing.length > 0) {
        await supabaseClient.from('attendance').update({ status }).eq('id', existing[0].id);
    } else {
        await supabaseClient.from('attendance').insert([{ student_id: studentId, status, class_date: selectedDate }]);
    }
    updateButtonVisuals(studentId, status);
    liveUpdateOverviewCell(studentId, selectedDate, status);
}

async function loadAttendanceForDate() {
    const selectedDate = document.getElementById('class-date').value;
    const centerId = document.getElementById('center-select').value;
    if (!selectedDate || !centerId) return;
    resetAllButtons();
    const { data: records } = await supabaseClient
        .from('attendance')
        .select('student_id, status')
        .eq('class_date', selectedDate)
        .in('student_id', currentStudents.map(s => s.id));
    if (records) records.forEach(r => updateButtonVisuals(r.student_id, r.status));
}

async function fetchCourses() {
    const { data: courses, error } = await supabaseClient
        .from('courses')
        .select('id, course_name, moodle_course_id')
        .order('course_name', { ascending: true });

    if (error) { console.error(error); return; }

    const courseSelect = document.getElementById('sched-course');
    courseSelect.innerHTML = '<option value="">— Select a course —</option>';
    
    courses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.id;  // ← FIXED: Use UUID for Supabase
        option.textContent = course.course_name;
        option.dataset.moodleId = course.moodle_course_id;
        courseSelect.appendChild(option);
    });
}

async function onboardStudent(e) {
    e.preventDefault();
    const form = e.target;
    const fullName = form.full_name.value.trim();
    const email = form.email.value.trim();
    const centerId = form.center_id.value;
    const moodleCourseId = form.moodle_course_id.value;

    if (!fullName || !email || !centerId) {
        return toast("Name, email, and center are required.", "error");
    }

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
        const { error } = await supabaseClient.from('students').insert([{
            full_name: fullName,
            email,
            center_id: centerId,
            moodle_id: null,
            status: 'Active',
            onboarding_course_id: moodleCourseId || null,
        }]);
        if (error) throw error;

        toast(
            `Student saved! Moodle account creation in progress (takes ~30 seconds).`,
            "success",
            6000
        );
        form.reset();
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
    const courseCheckboxes = document.getElementById('onboard-courses'); // Fixed: was 'onboard-course'
    
    if (!cSel || !courseCheckboxes) {
        console.log('Onboarding dropdowns not found, skipping populate');
        return;
    }
    
    const { data: centers } = await supabaseClient.from('centers').select('id, name').order('name');
    const { data: courses } = await supabaseClient.from('courses').select('id, course_name, moodle_course_id').order('course_name');
    
    cSel.innerHTML = '<option value="">— Select center —</option>' +
        (centers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    // Generate checkboxes instead of dropdown options
    courseCheckboxes.innerHTML = (courses || []).filter(c => c.moodle_course_id).map(course => `
        <div class="check-pill">
            <input type="checkbox" class="course-check" value="${course.id}" 
                   data-moodle-id="${course.moodle_course_id}" id="course-${course.id}">
            <label for="course-${course.id}">${course.course_name}</label>
        </div>
    `).join('');
}
