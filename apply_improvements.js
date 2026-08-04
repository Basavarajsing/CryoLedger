const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const publicDir = path.join(__dirname, 'public');
const jsDir = path.join(publicDir, 'js');
const serverFile = path.join(__dirname, 'server.js');

console.log("Starting improvements...");

// 1. Add User Management backend route
let serverCode = fs.readFileSync(serverFile, 'utf8');
if (!serverCode.includes('/api/admin/users')) {
    const userRoute = `
// User Management Route
app.get('/api/admin/users', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});
`;
    // Find a good place to insert, right before module.exports or end of file
    serverCode += userRoute;
    fs.writeFileSync(serverFile, serverCode);
    console.log("Added /api/admin/users route.");
}

// 2. Add Users link to navigation
const utilsFile = path.join(jsDir, 'utils.js');
let utilsCode = fs.readFileSync(utilsFile, 'utf8');
if (!utilsCode.includes('users.html')) {
    utilsCode = utilsCode.replace(
        '<li><a href="records.html" class="${activePage === \'records\' ? \'active\' : \'\'}">Product Records</a></li>',
        '<li><a href="records.html" class="${activePage === \'records\' ? \'active\' : \'\'}">Product Records</a></li>\n            <li><a href="users.html" class="${activePage === \'users\' ? \'active\' : \'\'}">User Management</a></li>'
    );
    fs.writeFileSync(utilsFile, utilsCode);
    console.log("Added User Management to nav.");
}

// 3. Create users.html
const usersHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CryoLedger - User Management</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        .tabs { display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--card-border); }
        .tab { padding: 0.75rem 1.5rem; cursor: pointer; color: var(--color-secondary); font-weight: 600; border-bottom: 2px solid transparent; }
        .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    </style>
</head>
<body>
    <div class="container">
        <h2 style="margin-bottom:0.5rem; font-size:2rem;">User Management</h2>
        <p style="color:var(--color-secondary); margin-bottom:2rem;">Manage portal access and registered logistics entities.</p>
        
        <div id="alert-container"></div>
        
        <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
            <div style="display:flex; gap:1rem; align-items:flex-end;">
                <div class="form-group" style="flex:1; margin:0;">
                    <label>Search Users</label>
                    <input type="text" id="search-user" placeholder="Search by username or email...">
                </div>
            </div>
        </div>

        <div class="tabs" id="user-tabs">
            <div class="tab active" data-role="all">All Users (<span id="count-all">0</span>)</div>
            <div class="tab" data-role="admin">Admins (<span id="count-admin">0</span>)</div>
            <div class="tab" data-role="user">Customers (<span id="count-user">0</span>)</div>
            <div class="tab" data-role="distributor">Distributors (<span id="count-distributor">0</span>)</div>
            <div class="tab" data-role="retailer">Retailers (<span id="count-retailer">0</span>)</div>
        </div>

        <div class="table-wrapper">
            <div class="table-responsive">
                <table class="table" style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--card-border);">
                            <th>Username</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Registration Date</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body">
                        <tr><td colspan="4" style="text-align:center; padding:2rem;">Loading users...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <script src="js/utils.js"></script>
    <script src="js/users.js"></script>
</body>
</html>`;
fs.writeFileSync(path.join(publicDir, 'users.html'), usersHtml);

// 4. Create js/users.js
const usersJs = \`
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
        tr.innerHTML = \`
            <td style="padding:1rem;">\${u.username}</td>
            <td style="padding:1rem; color:var(--color-secondary);">\${u.email || 'N/A'}</td>
            <td style="padding:1rem;">
                <span class="badge" style="background:var(--bg-tertiary); color:var(--accent);">\${u.role}</span>
            </td>
            <td style="padding:1rem; color:var(--color-secondary);">\${new Date(u.createdAt).toLocaleDateString()}</td>
        \`;
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
\`;
fs.writeFileSync(path.join(jsDir, 'users.js'), usersJs);
console.log("Created users.html and users.js");

// 5. Add Filters/Sorting to records.js and records.html
const recordsHtmlPath = path.join(publicDir, 'records.html');
let recordsHtml = fs.readFileSync(recordsHtmlPath, 'utf8');
if (!recordsHtml.includes('filter-status')) {
    recordsHtml = recordsHtml.replace(
        '<div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 250px;">\\r\\n                    <label for="search-prod">Search by Product ID or Name</label>\\r\\n                    <input type="text" id="search-prod" placeholder="Type name or serial...">\\r\\n                </div>',
        \`<div class="form-group" style="margin-bottom: 0; flex: 2; min-width: 200px;">
                    <label for="search-prod">Search by ID or Name</label>
                    <input type="text" id="search-prod" placeholder="Type name or serial...">
                </div>
                <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 150px;">
                    <label for="filter-status">Filter by Status</label>
                    <select id="filter-status">
                        <option value="all">All</option>
                        <option value="verified">Verified</option>
                        <option value="unverified">Unverified</option>
                        <option value="warranty-active">Warranty Active</option>
                        <option value="warranty-expired">Warranty Expired</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 150px;">
                    <label for="sort-prod">Sort By</label>
                    <select id="sort-prod">
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="scans-high">Most Scans</option>
                    </select>
                </div>\`
    );
    fs.writeFileSync(recordsHtmlPath, recordsHtml);
    console.log("Updated records.html filters/sorting");
}

const recordsJsPath = path.join(jsDir, 'records.js');
let recordsJs = fs.readFileSync(recordsJsPath, 'utf8');
if (!recordsJs.includes('document.getElementById(\\'filter-status\\')')) {
    recordsJs = recordsJs.replace(
        'function renderProductsTable() {',
        \`function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  const searchVal = document.getElementById('search-prod').value.trim().toLowerCase();
  const filterStat = document.getElementById('filter-status') ? document.getElementById('filter-status').value : 'all';
  const sortProd = document.getElementById('sort-prod') ? document.getElementById('sort-prod').value : 'newest';

  let filtered = allProducts.filter(p => {
    const matchSearch = p.productId.toLowerCase().includes(searchVal) || p.name.toLowerCase().includes(searchVal);
    let matchFilter = true;
    if (filterStat === 'verified') matchFilter = p.scanCount > 0;
    if (filterStat === 'unverified') matchFilter = p.scanCount === 0;
    if (filterStat === 'warranty-active') matchFilter = p.warrantyStatus === 'Active';
    if (filterStat === 'warranty-expired') matchFilter = p.warrantyStatus === 'Expired';
    return matchSearch && matchFilter;
  });

  if (sortProd === 'scans-high') filtered.sort((a,b) => (b.scanCount || 0) - (a.scanCount || 0));
  else if (sortProd === 'oldest') filtered.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  else filtered.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest by default

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-secondary); padding: 3rem;">No products matched filters.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  filtered.forEach(p => {
    // Replaced body...\`
    );
    
    // Wire up events
    recordsJs += \`\\ndocument.getElementById('filter-status')?.addEventListener('change', renderProductsTable);
document.getElementById('sort-prod')?.addEventListener('change', renderProductsTable);\\n\`;
    
    fs.writeFileSync(recordsJsPath, recordsJs);
    console.log("Updated records.js with advanced filtering/sorting.");
}

// 6. Fix Verify QR UI
const verifyJsPath = path.join(jsDir, 'verify.js');
let verifyJsCode = fs.readFileSync(verifyJsPath, 'utf8');
if (!verifyJsCode.includes('big-success-ui')) {
    verifyJsCode = verifyJsCode.replace('showAlert(result.message, "success");', 
        \`document.getElementById('panel-authorized').innerHTML = '<div id="big-success-ui" style="text-align:center; padding:2rem; background:rgba(16,185,129,0.1); border:1px solid var(--accent); border-radius:var(--radius-md);"><div style="font-size:4rem;">✅</div><h2 style="color:var(--accent);">Genuine Product Verified</h2><p>'+result.message+'</p></div>' + document.getElementById('panel-authorized').innerHTML; showAlert(result.message, "success");\`);
    fs.writeFileSync(verifyJsPath, verifyJsCode);
    console.log("Added big success UI to verify.js");
}

console.log("Automated enhancements completed successfully.");
