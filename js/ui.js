function toast(message, type = "info", duration = 4000) {
    const container = document.getElementById('toast-container') || (() => {
        const c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
        return c;
    })();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, duration);
}


function resetAllButtons() {
    document.querySelectorAll('.attendance-btn').forEach(btn => {
        btn.classList.remove('selected', 'present', 'absent', 'excused');
        btn.disabled = false;
        if (btn.id.includes('Present')) btn.innerText = 'Present';
        if (btn.id.includes('Absent')) btn.innerText = 'Absent';
        if (btn.id.includes('Excused')) btn.innerText = 'Excused';
    });
}

function updateButtonVisuals(studentId, selectedStatus) {
    if (!document.getElementById(`btn-Present-${studentId}`)) return;
    ['Present', 'Absent', 'Excused'].forEach(status => {
        const btn = document.getElementById(`btn-${status}-${studentId}`);
        if (!btn) return;
        btn.classList.remove('selected', 'present', 'absent', 'excused');
        if (status === selectedStatus) {
            btn.classList.add('selected', status.toLowerCase());
            btn.innerText = `✓ ${status}`;
            btn.disabled = true;
        } else {
            btn.innerText = status;
            btn.disabled = false;
        }
    });
}


async function renderOverviewTable() {
    if (typeof currentStudents === 'undefined' || currentStudents.length === 0) return;
    const monthVal = document.getElementById('overview-month').value;
    if (!monthVal) return;

    const [year, month] = monthVal.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${daysInMonth}`;

    const { data: records } = await supabaseClient
        .from('attendance')
        .select('student_id, status, class_date')
        .in('student_id', currentStudents.map(s => s.id))
        .gte('class_date', startDate)
        .lte('class_date', endDate);

    const lookup = {};
    currentStudents.forEach(s => lookup[s.id] = {});
    if (records) records.forEach(r => lookup[r.student_id][r.class_date] = r.status);

    let headHTML = '<tr><th class="sticky-col">Student</th>';
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month - 1, i);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        headHTML += `<th class="${isWeekend ? 'weekend' : ''}">${i}</th>`;
    }
    headHTML += '<th>Attended</th></tr>';
    document.getElementById('overview-head').innerHTML = headHTML;

    let bodyHTML = '';
    currentStudents.forEach(student => {
        let presentCount = 0;
        let totalMarked = 0;
        let cells = '';
        for (let i = 1; i <= daysInMonth; i++) {
            const dateKey = `${year}-${month}-${String(i).padStart(2, '0')}`;
            const status = lookup[student.id][dateKey];
            const cls = status ? `cell-${status.toLowerCase()}` : '';
            const letter = status ? status[0] : '';
            if (status) totalMarked++;
            if (status === 'Present') presentCount++;
            cells += `<td id="cell-${student.id}-${dateKey}" class="${cls}" title="${status || 'No record'}">${letter}</td>`;
        }
        const pct = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;
        bodyHTML += `<tr>
            <td class="sticky-col">${student.full_name}</td>
            ${cells}
            <td class="rate"><strong>${pct}%</strong> <span class="muted">(${presentCount}/${totalMarked})</span></td>
        </tr>`;
    });
    document.getElementById('overview-body').innerHTML = bodyHTML;
}

function liveUpdateOverviewCell(studentId, selectedDate, status) {
    const cell = document.getElementById(`cell-${studentId}-${selectedDate}`);
    if (cell) {
        cell.className = `cell-${status.toLowerCase()}`;
        cell.innerText = status[0];
        cell.title = status;
    }
}


function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.getElementById(viewId.replace('view-', 'nav-')).classList.add('active');


    if (viewId === 'view-onboarding') {
        populateOnboardingDropdowns();
        loadOnboardingList();
    }
    if (viewId === 'view-reports') {
        if (typeof loadPendingReports !== 'undefined') {
            loadPendingReports();
        }
    }
}

function handleCenterChange(selectElement) {
    const selectedId = selectElement.value;
    if (selectedId) {
        document.getElementById('center-name').textContent = selectElement.options[selectElement.selectedIndex].text;
        fetchStudents(selectedId);
    } else {
        document.getElementById('center-name').textContent = '—';
        document.getElementById('student-list').innerHTML = '';
        document.getElementById('overview-body').innerHTML = '';
        document.getElementById('overview-head').innerHTML = '';
    }
}
