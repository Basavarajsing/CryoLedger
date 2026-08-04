checkAccess('admin');
createHeader('users');
createFooter();

let allUsers = [];
let currentRole = 'all';

async function fetchUsers() {
    try {
        const res = await authenticatedFetch('/api/admin/users');
        const result = await res.json();
        if (result.success) {
            allUsers = result.data;
            updateCounts();
            renderTable();
        } else {
            showAlert('Failed to load users', 'error');
        }
    } catch (err) {
        showAlert('Network error fetching users', 'error');
    }
}

function updateCounts() {
    document.getElementById('count-all').innerText = allUsers.length;
    document.getElementById('count-admin').innerText = allUsers.filter(u => u.role === 'admin').length;
    document.getElementById('count-user').innerText = allUsers.filter(u => u.role === 'user').length;
    document.getElementById('count-distributor').innerText = allUsers.filter(u => u.role === 'distributor').length;
    document.getElementById('count-retailer').innerText = allUsers.filter(u => u.role === 'retailer').length;
}

function renderTable() {
    const searchVal = document.getElementById('search-user').value.toLowerCase();
    const tbody = document.getElementById('users-table-body');

    const filtered = allUsers.filter(u => {
        const matchRole = currentRole === 'all' || u.role === currentRole;
        const matchSearch = u.username.toLowerCase().includes(searchVal) || (u.email && u.email.toLowerCase().includes(searchVal));
        return matchRole && matchSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--color-secondary);">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(u => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--card-border)';
        tr.innerHTML = `
            <td style="padding:1rem;">${u.username}</td>
            <td style="padding:1rem; color:var(--color-secondary);">${u.email || 'N/A'}</td>
            <td style="padding:1rem;">
                <span class="badge" style="background:var(--bg-tertiary); color:var(--accent); text-transform:capitalize;">${u.role}</span>
            </td>
            <td style="padding:1rem; color:var(--color-secondary);">${new Date(u.createdAt).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentRole = e.currentTarget.getAttribute('data-role');
        renderTable();
    });
});

document.getElementById('search-user').addEventListener('input', renderTable);
fetchUsers();
