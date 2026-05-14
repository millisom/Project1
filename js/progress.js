async function initProgress() {
    await loadProgressFilters();
    await loadProgressData();
}

async function loadProgressFilters() {
    const { data: centers } = await supabaseClient
        .from('centers')
        .select('id, name')
        .order('name');

    const centerSelect = document.getElementById('progress-center');
    if (centerSelect && centers) {
        centerSelect.innerHTML = '<option value="">— All Centers —</option>' +
            centers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        centerSelect.addEventListener('change', loadProgressData);
    }

   
    const { data: courses } = await supabaseClient
        .from('courses')
        .select('id, course_name')
        .order('course_name');

    const courseSelect = document.getElementById('progress-course');
    if (courseSelect && courses) {
        courseSelect.innerHTML = '<option value="">— All Courses —</option>' +
            courses.map(c => `<option value="${c.id}">${c.course_name}</option>`).join('');
        
        courseSelect.addEventListener('change', loadProgressData);
    }
}

async function loadProgressData() {
    const centerId = document.getElementById('progress-center')?.value;
    const courseId = document.getElementById('progress-course')?.value;

    // Build query
    let query = supabaseClient
        .from('students')
        .select(`
            id,
            full_name,
            email,
            center_id,
            moodle_id,
            centers(name),
            student_enrollments(
                course_id,
                courses(id, course_name)
            )
        `)
        .not('moodle_id', 'is', null);

    if (centerId) {
        query = query.eq('center_id', centerId);
    }

    const { data: students, error } = await query;

    if (error) {
        console.error(error);
        return;
    }

    if (!students || students.length === 0) {
        document.getElementById('progress-list').innerHTML = 
            '<tr><td colspan="6" class="empty">No students found. Try different filters.</td></tr>';
        updateProgressStats([], []);
        return;
    }


    const studentIds = students.map(s => s.id);
    const { data: progressData } = await supabaseClient
        .from('moodle_progress')
        .select('*')
        .in('student_id', studentIds);


    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: attendanceData, error: attendanceError } = await supabaseClient
        .from('attendance')
        .select('student_id, status, class_date, schedule_id')
        .in('student_id', studentIds)
        .gte('class_date', thirtyDaysAgo)
        .not('schedule_id', 'is', null);

    if (attendanceError) {
        console.error('Attendance fetch error:', attendanceError);
    }


    const sessionIds = attendanceData?.map(a => a.schedule_id).filter(Boolean) || [];
    let sessionCourseMap = {};
    
    if (sessionIds.length > 0) {
        const { data: scheduleData } = await supabaseClient
            .from('schedule')
            .select('id, course_id')
            .in('id', sessionIds);
        
        if (scheduleData) {
            scheduleData.forEach(s => {
                sessionCourseMap[s.id] = s.course_id;
            });
        }
    }

    // Combine data
    const combinedData = [];

    students.forEach(student => {
        const enrollments = student.student_enrollments || [];
        
        enrollments.forEach(enrollment => {
            if (courseId && enrollment.course_id !== courseId) return;

            const progress = progressData?.find(p => 
                p.student_id === student.id && p.course_id === enrollment.course_id
            );

            // Filter attendance to THIS course only using the session-course map
            const studentAttendance = attendanceData?.filter(a => 
                a.student_id === student.id && 
                sessionCourseMap[a.schedule_id] === enrollment.course_id
            ) || [];
            
            const totalSessions = studentAttendance.length;
            const presentSessions = studentAttendance.filter(a => a.status === 'Present').length;
            const attendanceRate = totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : 0;

            combinedData.push({
                studentId: student.id,
                studentName: student.full_name,
                centerName: student.centers?.name || '—',
                courseName: enrollment.courses?.course_name || '—',
                moodleProgress: progress?.completion_percent || 0,
                modulesCompleted: progress?.modules_completed || 0,
                modulesTotal: progress?.modules_total || 0,
                attendanceRate: attendanceRate,
                presentCount: presentSessions,
                totalCount: totalSessions,
                lastActivity: progress?.last_activity,
                timeSpent: progress?.time_spent_minutes || 0,
            });
        });
    });

    renderProgressTable(combinedData);
    updateProgressStats(combinedData, attendanceData);
}

function renderProgressTable(data) {
    const tbody = document.getElementById('progress-list');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No progress data yet. Click "Sync from Moodle" to fetch latest data.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(row => {
        const progressBar = `<div class="progress-bar">
            <div class="progress-fill" style="width: ${row.moodleProgress}%"></div>
        </div>`;

        const progressText = `${row.moodleProgress}% (${row.modulesCompleted}/${row.modulesTotal})`;
        const attendanceText = `${row.presentCount}/${row.totalCount} (${row.attendanceRate}%)`;
        
        let statusBadge = '';
        let statusClass = '';
        if (row.moodleProgress >= 80 && row.attendanceRate >= 80) {
            statusBadge = '<span class="badge badge-active">✓ On Track</span>';
        } else if (row.moodleProgress < 50 || row.attendanceRate < 60) {
            statusBadge = '<span class="badge badge-error">⚠ At Risk</span>';
            statusClass = 'at-risk';
        } else {
            statusBadge = '<span class="badge badge-warn">⚡ Needs Attention</span>';
        }

        const lastActive = row.lastActivity 
            ? formatRelativeTime(new Date(row.lastActivity))
            : '—';

        return `
        <tr class="${statusClass}">
            <td>
                <div><strong>${row.studentName}</strong></div>
                <div class="muted">${row.centerName}</div>
            </td>
            <td>${row.courseName}</td>
            <td>
                ${progressBar}
                <div class="muted">${progressText}</div>
            </td>
            <td>
                <div>${attendanceText}</div>
                <div class="muted">${row.attendanceRate >= 80 ? '✓ Good' : row.attendanceRate >= 60 ? '⚡ Fair' : '⚠ Poor'}</div>
            </td>
            <td class="muted">${lastActive}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
}

function updateProgressStats(data, attendanceData) {
    if (data.length === 0) {
        document.getElementById('stat-avg-attendance').textContent = '—';
        document.getElementById('stat-avg-completion').textContent = '—';
        document.getElementById('stat-at-risk').textContent = '—';
        document.getElementById('stat-total-students').textContent = '0';
        return;
    }


    const avgAttendance = Math.round(
        data.reduce((sum, row) => sum + row.attendanceRate, 0) / data.length
    );

    const avgCompletion = Math.round(
        data.reduce((sum, row) => sum + row.moodleProgress, 0) / data.length
    );

    const atRiskCount = data.filter(row => 
        row.moodleProgress < 50 || row.attendanceRate < 60
    ).length;


    const uniqueStudents = new Set(data.map(row => row.studentId)).size;

    document.getElementById('stat-avg-attendance').textContent = `${avgAttendance}%`;
    document.getElementById('stat-avg-completion').textContent = `${avgCompletion}%`;
    document.getElementById('stat-at-risk').textContent = atRiskCount;
    document.getElementById('stat-total-students').textContent = uniqueStudents;
}

async function syncMoodleProgress() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Syncing...';

    try {
        const { data: students } = await supabaseClient
            .from('students')
            .select('id, moodle_id, student_enrollments(course_id, moodle_course_id)')
            .not('moodle_id', 'is', null);

        if (!students || students.length === 0) {
            toast('No students to sync', 'info');
            return;
        }

        toast(`Syncing progress for ${students.length} students...`, 'info', 3000);

        const webhookUrl = 'https://hook.eu1.make.com/nkdxtddq9dyc9d2951pdrv5g4rx1f917';
        
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync_all', count: students.length })
        });

        toast(
            'Progress sync initiated! This will take 1-2 minutes. The table will update automatically.',
            'success',
            5000
        );


        setTimeout(() => {
            loadProgressData();
        }, 3000);

    } catch (err) {
        console.error(err);
        toast(`Sync failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = ' Sync from Moodle';
    }
}

function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}
