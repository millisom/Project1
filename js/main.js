// js/main.js
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function init() {
    await fetchCenters();
    await fetchCourses();

    const now = new Date();
    document.getElementById('class-date').valueAsDate = now;
    document.getElementById('overview-month').value =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    document.getElementById('class-date').addEventListener('change', loadAttendanceForDate);
    document.getElementById('overview-month').addEventListener('change', renderOverviewTable);

    const onboardForm = document.getElementById('onboard-form');
    if (onboardForm) onboardForm.addEventListener('submit', onboardStudent);
}

init();
