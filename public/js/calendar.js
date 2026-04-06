let currentDate = new Date();
let scheduledPosts = [];
let selectedJobId = null;

function showModalAlert(message, title = "Notification") {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('alertModal').style.display = 'block';
}

async function fetchPosts() {
    try {
        const res = await fetch('/api/scheduled-posts');
        const data = await res.json();
        if (data.success) {
            scheduledPosts = data.posts;
            renderCalendar();
            const totalEl = document.getElementById('totalScheduled');
            if (totalEl) totalEl.innerText = `${scheduledPosts.length} Posts`;
        }
    } catch (err) {
        console.error("Error fetching posts:", err);
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    // Clear previous day cells (keep weekday headers)
    const dayElements = grid.querySelectorAll('.day');
    dayElements.forEach(el => el.remove());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthDisplay = document.getElementById('monthDisplay');
    if (monthDisplay) {
        monthDisplay.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fill empty days before
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day other-month';
        grid.appendChild(div);
    }

    // Fill month days
    for (let d = 1; d <= daysInMonth; d++) {
        const div = document.createElement('div');
        div.className = 'day';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const thisDate = new Date(year, month, d);
        if (thisDate.getTime() === today.getTime()) div.classList.add('today');

        // Check if post is clickable (not in past)
        if (thisDate < today) {
            div.classList.add('past');
        } else {
            div.onclick = () => {
                const dateInput = document.getElementById('targetDate');
                if (dateInput) dateInput.value = dateStr;
                openModal('addModal');
            };
        }

        div.innerHTML = `<div class="day-number">${d}</div><div class="scheduled-items" id="day-${dateStr}"></div>`;
        grid.appendChild(div);

        // Add events for this day
        const dayPosts = scheduledPosts.filter(p => p.publish_datetime && p.publish_datetime.startsWith(dateStr));
        const itemsContainer = div.querySelector('.scheduled-items');
        dayPosts.forEach(post => {
            const item = document.createElement('div');
            item.className = `scheduled-item ${post.status}`;
            const provider = post.account_provider ? post.account_provider.toUpperCase() : '??';
            item.innerHTML = `
                <div class="scheduled-item-title">${post.video_title || 'Untitled'}</div>
                <div class="scheduled-item-account"><span>[${post.account_name || provider}]</span></div>
            `;
            item.onclick = (e) => {
                e.stopPropagation();
                openEditModal(post);
            };
            itemsContainer.appendChild(item);
        });
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

function openAddModal() {
    openModal('addModal');
}

function selectVideo(id) {
    selectedJobId = id;
    document.querySelectorAll('.video-card').forEach(el => el.classList.remove('selected'));
    const card = document.getElementById(`video-${id}`);
    if (card) card.classList.add('selected');
    const targetInput = document.getElementById('targetJobId');
    if (targetInput) targetInput.value = id;
}

async function handleCreate(e) {
    e.preventDefault();
    const jobId = document.getElementById('targetJobId').value;
    const checkboxes = document.querySelectorAll('input[name="targetAccounts"]:checked');
    const accountIds = Array.from(checkboxes).map(cb => cb.value);
    const date = document.getElementById('targetDate').value;
    const time = document.getElementById('targetTime').value;

    if (accountIds.length === 0) {
        showModalAlert("Please select at least one account.");
        return;
    }
    if (!jobId) {
        showModalAlert("Please select a video.");
        return;
    }

    try {
        const res = await fetch('/api/schedule/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, accountIds, publishDatetime: `${date} ${time}` })
        });

        const data = await res.json();
        if (data.success) {
            const card = document.getElementById(`video-${jobId}`);
            if (card) card.remove();

            closeModal('addModal');
            // Reset selection
            document.querySelectorAll('input[name="targetAccounts"]').forEach(cb => cb.checked = false);
            document.querySelectorAll('.video-card').forEach(el => el.classList.remove('selected'));
            document.getElementById('targetJobId').value = '';
            fetchPosts();
            showModalAlert("Content scheduled successfully!");
        } else {
            showModalAlert(data.error, "Error");
        }
    } catch (err) {
        showModalAlert("Network error occurred.");
    }
}

function openEditModal(post) {
    const idInput = document.getElementById('editId');
    const titleEl = document.getElementById('editTitle');
    const subtitleEl = document.getElementById('editSubtitle');
    const datetimeInput = document.getElementById('editDatetime');

    if (idInput) idInput.value = post.id;
    if (titleEl) titleEl.innerText = post.video_title || 'Untitled Video';
    if (subtitleEl) subtitleEl.innerText = `Channel: ${post.account_name} (${post.account_provider})`;
    if (datetimeInput) datetimeInput.value = post.publish_datetime.replace(' ', 'T').substring(0, 16);

    openModal('editModal');
}

async function handleUpdate() {
    const id = document.getElementById('editId').value;
    const dt = document.getElementById('editDatetime').value.replace('T', ' ');

    try {
        const res = await fetch('/api/schedule/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, publishDatetime: dt })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('editModal');
            fetchPosts();
            showModalAlert("Schedule updated successfully!");
        } else {
            showModalAlert(data.error, "Error");
        }
    } catch (err) {
        showModalAlert("Network error.");
    }
}

async function handleDelete() {
    if (typeof window.customConfirm === 'function') {
        const confirmed = await window.customConfirm("Are you sure you want to delete this schedule?", "Delete Confirm", true);
        if (!confirmed) return;
    } else {
        if (!confirm("Are you sure you want to delete this schedule?")) return;
    }

    const id = document.getElementById('editId').value;
    try {
        const res = await fetch('/api/schedule/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('editModal');
            fetchPosts();
        } else {
            showModalAlert(data.error, "Error");
        }
    } catch (err) {
        showModalAlert("Network error.");
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchPosts();
});
