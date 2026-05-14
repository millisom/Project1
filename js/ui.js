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


function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.getElementById(viewId.replace('view-', 'nav-')).classList.add('active');


    if (viewId === 'view-onboarding') {
        populateOnboardingDropdowns();
        loadOnboardingList();
    }
    if (viewId === 'view-progress') {
        initProgress();
    }
    if (viewId === 'view-reports') {
        initReports();
    }
    if (viewId === 'view-whatsapp') {
        if (typeof initReminders === 'function') {
            initReminders();
        } else {
            console.warn('Reminders module not loaded');
        }
    }
}

function resetAllButtons() {
    document.querySelectorAll('.attendance-btn').forEach(btn => {
        btn.classList.remove('btn-selected');
    });
}

function updateButtonVisuals(studentId, status) {
    const states = ['Present', 'Absent', 'Excused'];
    states.forEach(state => {
        const btn = document.getElementById(`btn-${state}-${studentId}`);
        if (btn) {
            if (state === status) {
                btn.classList.add('btn-selected');
            } else {
                btn.classList.remove('btn-selected');
            }
        }
    });
}
