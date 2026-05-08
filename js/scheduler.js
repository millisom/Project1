async function saveSchedule() {
    const topic = document.getElementById('sched-topic').value.trim();
    const time = document.getElementById('sched-time').value;
    const link = document.getElementById('sched-link').value.trim();
    const courseId = document.getElementById('sched-course').value;
    const duration = parseInt(document.getElementById('sched-duration')?.value || '60', 10);
    const selectedCenterIds = Array.from(
        document.querySelectorAll('.center-check:checked')
    ).map(cb => cb.value);

    if (!topic || !time || !courseId) {
        toast("Please fill in topic, time, and course.", "error");
        return;
    }
    if (selectedCenterIds.length === 0) {
        toast("Select at least one target center.", "error");
        return;
    }

    const btn = document.getElementById('sched-save-btn');
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const { data: newEvent, error } = await supabaseClient
            .from('schedule')
            .insert([{
                lecture_topic: topic,
                date_and_time: time,
                meeting_link: link,
                course_id: courseId,
                duration_min: duration,
                moodle_event_id: null,
            }])
            .select()
            .single();

        if (error) throw error;


        const junctionRows = selectedCenterIds.map(cId => ({
            schedule_id: newEvent.id,
            center_id: cId,
        }));
        const { error: jErr } = await supabaseClient
            .from('schedule_centers')
            .insert(junctionRows);
        if (jErr) throw jErr;

        toast(
            `Session saved! Make.com will sync to Moodle calendar within 15 minutes.`,
            "success",
            6000
        );


        document.getElementById('sched-topic').value = '';
        document.getElementById('sched-time').value = '';
        document.getElementById('sched-link').value = '';
        document.querySelectorAll('.center-check:checked').forEach(cb => cb.checked = false);

    } catch (err) {
        console.error(err);
        toast(`Error: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Session";
    }
}
