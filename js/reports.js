// Session Reports Module

async function loadRecentSessions() {
    const { data: sessions, error } = await supabaseClient
        .from('schedule')
        .select('id, lecture_topic, date_and_time')
        .gte('date_and_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('date_and_time', { ascending: false })
        .limit(20);

    if (error) {
        console.error(error);
        return;
    }

    const select = document.getElementById('report-session');
    if (!select) return;

    select.innerHTML = '<option value="">— Select session —</option>';
    sessions.forEach(session => {
        const date = new Date(session.date_and_time);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.lecture_topic} (${dateStr})`;
        select.appendChild(option);
    });
}

async function loadReportCenters() {
    const { data: centers, error } = await supabaseClient
        .from('centers')
        .select('id, name')
        .order('name');

    if (error) {
        console.error(error);
        return;
    }

    const select = document.getElementById('report-center');
    if (!select) return;

    select.innerHTML = '<option value="">— Select center —</option>';
    centers.forEach(center => {
        const option = document.createElement('option');
        option.value = center.id;
        option.textContent = center.name;
        select.appendChild(option);
    });
}

async function submitReport(e) {
    e.preventDefault();
    
    const sessionId = document.getElementById('report-session').value;
    const centerId = document.getElementById('report-center').value;
    const outcome = document.getElementById('report-outcome').value;
    const condition = document.getElementById('report-condition').value.trim();
    const issues = document.getElementById('report-issues').value.trim();
    const count = document.getElementById('report-count').value;

    if (!sessionId || !centerId) {
        return toast("Please select session and center.", "error");
    }

    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
        const { error } = await supabaseClient.from('session_reports').insert([{
            schedule_id: sessionId,
            center_id: centerId,
            outcome: outcome,
            center_condition: condition || null,
            issues: issues || null,
            attendees_count: count ? parseInt(count, 10) : null,
            submitted_by: null, // TODO: Add teacher authentication
        }]);

        if (error) throw error;

        toast("Report submitted successfully!", "success");
        e.target.reset();
        loadReportsList();
    } catch (err) {
        console.error(err);
        toast(`Failed to submit report: ${err.message}`, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report";
    }
}

async function loadReportsList() {
    const { data: reports, error } = await supabaseClient
        .from('session_reports')
        .select(`
            id,
            outcome,
            attendees_count,
            submitted_at,
            schedule:schedule_id (lecture_topic),
            centers:center_id (name)
        `)
        .order('submitted_at', { ascending: false })
        .limit(20);

    const tbody = document.getElementById('reports-list');
    if (!tbody) return;

    if (error || !reports || reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">No reports yet.</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(r => `
        <tr>
            <td>${r.schedule?.lecture_topic || '—'}</td>
            <td>${r.centers?.name || '—'}</td>
            <td><span class="badge badge-${r.outcome?.toLowerCase() || 'active'}">${r.outcome || '—'}</span></td>
            <td>${r.attendees_count || '—'}</td>
            <td class="muted">${new Date(r.submitted_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// Initialize when reports view is shown
function initReports() {
    loadRecentSessions();
    loadReportCenters();
    loadReportsList();

    const reportForm = document.getElementById('report-form');
    if (reportForm) {
        reportForm.removeEventListener('submit', submitReport); // Prevent duplicates
        reportForm.addEventListener('submit', submitReport);
    }
}
