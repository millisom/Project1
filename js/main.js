const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function init() {
    await fetchCenters();
    await fetchCourses();


    const onboardForm = document.getElementById('onboard-form');
    if (onboardForm) onboardForm.addEventListener('submit', onboardStudent);
}

init();
