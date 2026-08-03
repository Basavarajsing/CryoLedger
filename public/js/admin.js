// Admin Panel Bypass Requests Controller
checkAccess('admin');

let allRequests = [];

// Initialize Header & Footer
createHeader('admin');
createFooter();

// Fetch Requests from Express Server
async function fetchRequests() {
  const tbody = document.getElementById('requests-table-body');
  try {
    const res = await authenticatedFetch('/admin/requests');
    if (!res.ok) throw new Error("Could not fetch requests.");

    const result = await res.json();
    if (result.success) {
      allRequests = result.data;
      renderTable();
    } else {
      showAlert(result.message || "Failed to load requests.", "error");
    }
  } catch (error) {
    console.error("Load requests err:", error);
    showAlert("Error connecting to server. Is Node server running?", "error");
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--error); padding: 3rem;">
          Error connecting to backend database. Please refresh.
        </td>
      </tr>
    `;
  }
}

// Render Table with local filtering
function renderTable() {
  const tbody = document.getElementById('requests-table-body');
  const filterId = document.getElementById('filter-prod-id').value.trim().toLowerCase();
  const filterStatus = document.getElementById('filter-status').value;

  // Filter requests
  const filtered = allRequests.filter(req => {
    const matchesId = req.productId.toLowerCase().includes(filterId);
    const matchesStatus = filterStatus === 'ALL' || req.status === filterStatus;
    return matchesId && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-secondary); padding: 3rem;">
          No access requests matching your filters were found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(req => {
    const tr = document.createElement('tr');

    // Status Badge
    let badgeClass = 'badge-pending';
    if (req.status === 'Approved') badgeClass = 'badge-approved';
    if (req.status === 'Rejected') badgeClass = 'badge-rejected';

    // Format Date
    const formattedDate = new Date(req.createdAt).toLocaleString();

    // Action buttons display
    let actionsHtml = '';
    if (req.status === 'Pending') {
      actionsHtml = `
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button type="button" class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background-color: var(--accent);" onclick="updateRequestStatus('${req._id}', 'approve')">
            Approve
          </button>
          <button type="button" class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="updateRequestStatus('${req._id}', 'reject')">
            Reject
          </button>
        </div>
      `;
    } else {
      actionsHtml = `<span style="font-size: 0.85rem; color: var(--color-secondary); font-style: italic;">No actions required</span>`;
    }

    tr.innerHTML = `
      <td>
        <strong style="display: block; color: var(--color-primary);">${req.productName}</strong>
        <span style="font-size: 0.8rem; color: var(--color-secondary); font-family: monospace;">${req.productId}</span>
      </td>
      <td style="max-width: 250px; font-size: 0.85rem; word-break: break-work; color: var(--color-secondary);">
        ${req.requestedLocation}
      </td>
      <td style="font-family: monospace; font-size: 0.85rem; color: var(--color-secondary);">
        ${req.latitude.toFixed(6)}, ${req.longitude.toFixed(6)}
      </td>
      <td style="font-size: 0.85rem; color: var(--color-secondary);">
        ${formattedDate}
      </td>
      <td>
        <span class="badge ${badgeClass}">${req.status}</span>
      </td>
      <td style="text-align: right;">
        ${actionsHtml}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Update Access Request Status (Approve or Reject)
window.updateRequestStatus = async function (id, action) {
  try {
    const url = `/admin/request/${id}/${action}`;
    const res = await authenticatedFetch(url, {
      method: 'POST'
    });

    const result = await res.json();
    if (result.success) {
      showAlert(`Request ${action}d successfully.`, "success");
      fetchRequests(); // Reload listings
    } else {
      showAlert(result.message || `Failed to ${action} request.`, "error");
    }
  } catch (error) {
    console.error("Action error:", error);
    showAlert("Failed to send status update to server.", "error");
  }
};

// Event Listeners for Filters
document.getElementById('filter-prod-id').addEventListener('input', renderTable);
document.getElementById('filter-status').addEventListener('change', renderTable);
document.getElementById('btn-refresh').addEventListener('click', fetchRequests);

// Init fetch
fetchRequests();
