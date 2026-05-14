async function initReminders() {
    loadReminderSettings();
    loadUpcomingSessions();
}

function loadReminderSettings() {
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

async function loadUpcomingSessions() {
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: sessions, error } = await supabaseClient
        .from('schedule')
        .select(`
            id,
            lecture_topic,
            date_and_time,
            duration_min,
            courses(course_name),
            schedule_centers(centers(name))
        `)
        .gte('date_and_time', startDate)
        .lte('date_and_time', endDate)
        .order('date_and_time', { ascending: true });

    const tbody = document.getElementById('reminders-list');
    if (!tbody) return;

    if (error || !sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No upcoming sessions in the next 7 days.</td></tr>';
        return;
    }


    const sessionIds = sessions.map(s => s.id);
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

  
    const studentCounts = {};
    for (const sessionId in countsMap) {
        const centerIds = countsMap[sessionId];
        const { count } = await supabaseClient
            .from('students')
            .select('*', { count: 'exact', head: true })
            .in('center_id', centerIds);
        studentCounts[sessionId] = count || 0;
    }

    tbody.innerHTML = sessions.map(session => {
        const date = new Date(session.date_and_time);
        const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit' 
        });

        const centers = session.schedule_centers?.map(sc => sc.centers?.name).join(', ') || '—';
        const studentCount = studentCounts[session.id] || 0;


        const sessionReminderKey = `remind_session_${session.id}`;
        const sessionReminderEnabled = localStorage.getItem(sessionReminderKey) !== 'false';


        const now = new Date();
        const hoursUntil = (date - now) / (1000 * 60 * 60);
        const reminderHours = parseInt(localStorage.getItem('remind_hours') || '24');
        const globalEnabled = localStorage.getItem('remind_enabled') !== 'false';

        let statusBadge;
        if (!globalEnabled || !sessionReminderEnabled) {
            statusBadge = '<span class="badge">Disabled</span>';
        } else if (hoursUntil < 0) {
            statusBadge = '<span class="badge">Past</span>';
        } else if (hoursUntil <= reminderHours) {
            statusBadge = '<span class="badge badge-active">✓ Will Send</span>';
        } else {
            statusBadge = '<span class="badge badge-warn">⏳ Scheduled</span>';
        }

        return `
        <tr>
            <td><strong>${session.lecture_topic}</strong></td>
            <td class="muted">${session.courses?.course_name || '—'}</td>
            <td>
                <div>${dateStr}</div>
                <div class="muted">${timeStr}</div>
            </td>
            <td class="muted">${centers}</td>
            <td>${studentCount} students</td>
            <td>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" 
                           ${sessionReminderEnabled ? 'checked' : ''} 
                           onchange="toggleSessionReminder('${session.id}')"
                           ${hoursUntil < 0 ? 'disabled' : ''}>
                    <span>${hoursUntil < 0 ? 'Past session' : 'Send'}</span>
                </label>
            </td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
}

function toggleSessionReminder(sessionId) {
    const sessionReminderKey = `remind_session_${sessionId}`;
    const checkbox = event.target;
    
    localStorage.setItem(sessionReminderKey, checkbox.checked);
    

    loadUpcomingSessions();
    
    toast(
        checkbox.checked ? 'Reminder enabled for this session' : 'Reminder disabled for this session',
        checkbox.checked ? 'success' : 'info'
    );
}
