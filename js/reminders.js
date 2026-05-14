// Email Reminders Module

async function initReminders() {
    loadReminderSettings();
    await loadCenterFilter();
    loadUpcomingSessions();
}

function loadReminderSettings() {
    // Load settings from localStorage
    const enabled = localStorage.getItem('remind_enabled') !== 'false';
    const hours = localStorage.getItem('remind_hours') || '24';
    const students = localStorage.getItem('remind_students') !== 'false';
    const teachers = localStorage.getItem('remind_teachers') === 'true';

    document.getElementById('remind-enabled').checked = enabled;
    document.getElementById('remind-hours').value = hours;
    document.getElementById('remind-students').checked = students;
    document.getElementById('remind-teachers').checked = teachers;
}

function saveReminderSettings() {
    const enabled = document.getElementById('remind-enabled').checked;
    const hours = document.getElementById('remind-hours').value;
    const students = document.getElementById('remind-students').checked;
    const teachers = document.getElementById('remind-teachers').checked;

    localStorage.setItem('remind_enabled', enabled);
    localStorage.setItem('remind_hours', hours);
    localStorage.setItem('remind_students', students);
    localStorage.setItem('remind_teachers', teachers);

    toast('Reminder settings saved!', 'success');
}

async function loadCenterFilter() {
    const { data: centers } = await supabaseClient
        .from('centers')
        .select('id, name')
        .order('name');

    const select = document.getElementById('reminder-center-filter');
    if (!select) return;

    select.innerHTML = '<option value="">— All Centers —</option>' +
        (centers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadUpcomingSessions() {
    const selectedCenterId = document.getElementById('reminder-center-filter')?.value;
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get sessions
    const { data: sessions, error } = await supabaseClient
        .from('schedule')
        .select(`
            id,
            lecture_topic,
            date_and_time,
            duration_min,
            courses(course_name),
            schedule_centers(center_id, centers(name))
        `)
        .gte('date_and_time', startDate)
        .lte('date_and_time', endDate)
        .order('date_and_time', { ascending: true });

    const tbody = document.getElementById('reminders-list');
    if (!tbody) return;

    if (error || !sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No upcoming sessions in the next 7 days.</td></tr>';
        return;
    }

    // Filter by selected center if any
    let filteredSessions = sessions;
    if (selectedCenterId) {
        filteredSessions = sessions.filter(session => 
            session.schedule_centers?.some(sc => sc.center_id === selectedCenterId)
        );
    }

    if (filteredSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No sessions for selected center.</td></tr>';
        return;
    }

    // Get student counts
    const sessionIds = filteredSessions.map(s => s.id);
    const { data: enrollmentCounts } = await supabaseClient
        .from('schedule_centers')
        .select('schedule_id, center_id')
        .in('schedule_id', sessionIds);

    const countsMap = {};
    if (enrollmentCounts) {
        for (const row of enrollmentCounts) {
            if (!countsMap[row.schedule_id]) {
                countsMap[row.schedule_id] = [];
            }
            countsMap[row.schedule_id].push(row.center_id);
        }
    }

    // Get student counts per center
    const studentCounts = {};
    for (const sessionId in countsMap) {
        const centerIds = countsMap[sessionId];
        
        // If filtering by center, only count students in that center
        const relevantCenterIds = selectedCenterId 
            ? centerIds.filter(id => id === selectedCenterId)
            : centerIds;
        
        if (relevantCenterIds.length > 0) {
            const { count } = await supabaseClient
                .from('students')
                .select('*', { count: 'exact', head: true })
                .in('center_id', relevantCenterIds);
            studentCounts[sessionId] = count || 0;
        } else {
            studentCounts[sessionId] = 0;
        }
    }

    tbody.innerHTML = filteredSessions.map(session => {
        const date = new Date(session.date_and_time);
        const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit' 
        });

        const sessionCenters = session.schedule_centers || [];
        
        // Filter centers if a specific center is selected
        const displayCenters = selectedCenterId
            ? sessionCenters.filter(sc => sc.center_id === selectedCenterId)
            : sessionCenters;
        
        const centersText = displayCenters.map(sc => sc.centers?.name).join(', ') || '—';
        const studentCount = studentCounts[session.id] || 0;

        // Calculate reminder status
        const now = new Date();
        const hoursUntil = (date - now) / (1000 * 60 * 60);
        const reminderHours = parseInt(localStorage.getItem('remind_hours') || '24');
        const globalEnabled = localStorage.getItem('remind_enabled') !== 'false';
        const isPast = hoursUntil < 0;

        // Check if reminder is enabled for this session (per-session toggle)
        const sessionReminderKey = `remind_session_${session.id}`;
        const sessionReminderEnabled = localStorage.getItem(sessionReminderKey) !== 'false';

        // Status badge
        let statusBadge;
        if (!globalEnabled) {
            statusBadge = '<span class="badge">Global: Off</span>';
        } else if (isPast) {
            statusBadge = '<span class="badge">Past</span>';
        } else if (!sessionReminderEnabled) {
            statusBadge = '<span class="badge">Disabled</span>';
        } else if (hoursUntil <= reminderHours) {
            statusBadge = '<span class="badge badge-active">✓ Will Send</span>';
        } else {
            statusBadge = '<span class="badge badge-warn">⏳ Scheduled</span>';
        }

        // Toggle checkbox
        const toggleCheckbox = `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" 
                       ${sessionReminderEnabled ? 'checked' : ''} 
                       onchange="toggleSessionReminder('${session.id}')"
                       ${isPast ? 'disabled' : ''}>
                <span>${isPast ? 'Past' : 'Send'}</span>
            </label>`;

        return `
        <tr>
            <td><strong>${session.lecture_topic}</strong></td>
            <td class="muted">${session.courses?.course_name || '—'}</td>
            <td>
                <div>${dateStr}</div>
                <div class="muted">${timeStr}</div>
            </td>
            <td class="muted">${centersText}</td>
            <td>${studentCount} students</td>
            <td>${toggleCheckbox}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
}

function toggleSessionReminder(sessionId) {
    const sessionReminderKey = `remind_session_${sessionId}`;
    const checkbox = event.target;
    
    localStorage.setItem(sessionReminderKey, checkbox.checked);
    
    // Reload the table to update status badges
    loadUpcomingSessions();
    
    toast(
        checkbox.checked ? 'Reminder enabled for this session' : 'Reminder disabled for this session',
        checkbox.checked ? 'success' : 'info',
        2000
    );
}
