// Product Records & Audit Trails Controller
checkAccess('admin');

let allProducts = [];

// Initialize Header & Footer
createHeader('records');
createFooter();

// Fetch Products from server
async function fetchProducts() {
  const tbody = document.getElementById('products-table-body');
  try {
    const res = await authenticatedFetch('/products');
    if (!res.ok) throw new Error("Failed to load products database.");

    const result = await res.json();
    if (result.success) {
      allProducts = result.data;
      renderProductsTable();
    } else {
      showAlert(result.message || "Failed to load products list.", "error");
    }
  } catch (error) {
    console.error("Load products error:", error);
    showAlert("Server connection failed.", "error");
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--error); padding: 3rem;">
          Failed to load products from database.
        </td>
      </tr>
    `;
  }
}

// Render Products Table
function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  const searchVal = document.getElementById('search-prod').value.trim().toLowerCase();

  const filterStatus = document.getElementById('filter-status') ? document.getElementById('filter-status').value : 'all';
  const sortOption = document.getElementById('sort-prod') ? document.getElementById('sort-prod').value : 'newest';

  let filtered = allProducts.filter(p => {
    const matchSearch = p.productId.toLowerCase().includes(searchVal) || p.name.toLowerCase().includes(searchVal);

    let matchFilter = true;
    if (filterStatus === 'verified') matchFilter = p.scanCount > 0;
    else if (filterStatus === 'unverified') matchFilter = !p.scanCount || p.scanCount === 0;
    else if (filterStatus === 'warranty-active') matchFilter = p.warrantyStatus === 'Active';
    else if (filterStatus === 'warranty-expired') matchFilter = p.warrantyStatus === 'Expired';

    return matchSearch && matchFilter;
  });

  if (sortOption === 'scans-high') {
    filtered.sort((a, b) => (b.scanCount || 0) - (a.scanCount || 0));
  } else if (sortOption === 'oldest') {
    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // default newest
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-secondary); padding: 3rem;">
          No products matched your search.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(p => {
    const tr = document.createElement('tr');

    const centersCount = p.authorizedCenters ? p.authorizedCenters.length : 0;
    const scans = p.scanCount || 0;

    let badgeHTML = '';
    if (p.isRecalled || p.isReturnedForRecall) {
      badgeHTML = `<span style="background-color: var(--error); color: white; padding: 0.15rem 0.4rem; font-size: 0.7rem; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; display: inline-block; vertical-align: middle;">Recall&Repair</span>`;
    }

    tr.innerHTML = `
      <td>
        <strong style="color: var(--color-primary); display: inline-block; font-size: 1.05rem; vertical-align: middle;">${p.name}</strong>${badgeHTML}
        <span style="display: block; font-size: 0.85rem; color: var(--color-secondary); font-family: monospace;">ID: ${p.productId}</span>
      </td>
      <td>
        <span style="font-weight: 500;">${p.manufacturerName}</span>
      </td>
      <td style="color: var(--color-secondary); font-weight: 600;">
        ${centersCount} centers
      </td>
      <td style="color: var(--accent); font-weight: 700;">
        ${scans}
      </td>
      <td>
        <img src="${p.qrCodePath}" alt="QR" style="width: 42px; height: 42px; border-radius: var(--radius-sm); border: 1px solid var(--card-border); background: white; cursor: pointer; padding: 2px;" onclick="openQrModal('${p.qrCodePath}', '${p.productId}')">
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button type="button" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.82rem; margin-right: 0.25rem;" onclick="viewDetailsModal('${p.productId}')">
          🔍 Profile
        </button>
        <button type="button" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.82rem;" onclick="viewAuditLogs('${p.productId}', '${p.name}')">
          📊 Audit History
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// Open / zoom QR Modal
window.openQrModal = function (path, productId) {
  const modal = document.getElementById('qr-modal');
  document.getElementById('qr-modal-title').innerText = `QR: ${productId}`;
  document.getElementById('qr-modal-img').src = path;
  document.getElementById('qr-modal-download').href = path;
  document.getElementById('qr-modal-download').setAttribute('download', `${productId}_qr.png`);
  modal.style.display = 'flex';
};

window.closeQrModal = function () {
  document.getElementById('qr-modal').style.display = 'none';
};

// Comprehensive product details modal logic
let activeDetailProduct = null;

window.viewDetailsModal = async function (productId) {
  try {
    const res = await authenticatedFetch(`/product/${encodeURIComponent(productId)}`);
    if (!res.ok) throw new Error("Could not fetch product dossier.");
    const result = await res.json();
    if (!result.success) {
      showAlert(result.message || "Failed to load product details.", "error");
      return;
    }

    activeDetailProduct = result.data;
    populateDetailsModal(activeDetailProduct);

    document.getElementById('details-modal').style.display = 'flex';
  } catch (error) {
    console.error("View Details error:", error);
    showAlert("Failed to retrieve product details.", "error");
  }
};

window.closeDetailsModal = function () {
  document.getElementById('details-modal').style.display = 'none';
  // Reset forms
  document.getElementById('inline-recall-form').style.display = 'none';
  document.getElementById('inline-logistics-form').style.display = 'none';
  document.getElementById('assign-role-select').value = '';
  document.getElementById('distributor-select-group').style.display = 'none';
  document.getElementById('retailer-select-group').style.display = 'none';
  document.getElementById('entity-location-info').style.display = 'none';
  document.getElementById('btn-submit-logistics').setAttribute('disabled', 'true');
};

function populateDetailsModal(p) {
  document.getElementById('details-modal-title').innerText = `${p.name} dossier`;

  // Passport
  document.getElementById('detail-brand').innerText = p.brand || "N/A";
  document.getElementById('detail-category').innerText = p.category || "N/A";
  document.getElementById('detail-model').innerText = p.modelNumber || "N/A";
  document.getElementById('detail-batch').innerText = p.batchNumber || p.productId;
  document.getElementById('detail-mfg-date').innerText = new Date(p.createdAt).toLocaleDateString();
  document.getElementById('detail-expiry-date').innerText = p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : "No Expiration Date";

  const imgContainer = document.getElementById('passport-preview-container');
  const imgElement = document.getElementById('detail-product-img');
  if (p.productImage) {
    imgElement.src = p.productImage;
    imgContainer.style.display = 'block';
  } else {
    imgContainer.style.display = 'none';
  }

  // Warranty
  const warrantyBadgeContainer = document.getElementById('detail-warranty-badge-container');
  let warrantyBadge = '<span class="badge" style="background-color: var(--bg-tertiary); color: var(--color-secondary);">No Warranty Setup</span>';
  if (p.warrantyAvailable === 'Yes' || p.warrantyAvailable === true) {
    let style = 'background-color: #f1c40f; color: #111;'; // Inactive
    if (p.warrantyStatus === 'Active') style = 'background-color: var(--accent); color: var(--bg-primary);';
    if (p.warrantyStatus === 'Expired') style = 'background-color: var(--error); color: white;';
    warrantyBadge = `<span class="badge" style="${style}">${p.warrantyStatus.toUpperCase()} WARRANTY</span>`;
  }
  warrantyBadgeContainer.innerHTML = warrantyBadge;

  document.getElementById('detail-warranty-type').innerText = p.warrantyType || "Standard Manufacturer";
  document.getElementById('detail-warranty-period').innerText = p.warrantyPeriod ? `${p.warrantyPeriod} Months` : "N/A";
  document.getElementById('detail-warranty-start').innerText = p.warrantyStartDate ? new Date(p.warrantyStartDate).toLocaleDateString() : "Pending Customer Scan";
  document.getElementById('detail-warranty-end').innerText = p.warrantyEndDate ? new Date(p.warrantyEndDate).toLocaleDateString() : "Pending Customer Scan";

  if (p.warrantyStartDate && p.warrantyEndDate && p.warrantyStatus === 'Active') {
    const diff = new Date(p.warrantyEndDate) - new Date();
    const remaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    document.getElementById('detail-warranty-days').innerText = `${remaining} Days Left`;
  } else {
    document.getElementById('detail-warranty-days').innerText = "N/A";
  }
  document.getElementById('detail-warranty-terms').innerText = p.warrantyTerms || "No terms listed.";

  // Health and Trust
  // Simple front-end recalculation mirroring backend logic
  let unauthCount = 0;
  let successCount = 0;
  (p.verificationHistory || []).forEach(history => {
    if (history.status === 'Unauthorized Location' && !history.neglected) unauthCount++;
    else if (history.status === 'Authorized Center Verified' || history.status === 'Authorized Centre Verified' || history.status === 'Admin Approved') successCount++;
  });

  let overallHealth = "Optimal";
  let trustLevel = 100;
  let riskLevel = "Secure";
  let recommendation = "Product is in pristine security alignment. No actions requested.";

  if (unauthCount > 0) {
    if (unauthCount === 1) {
      overallHealth = "Warning Alert";
      trustLevel = 75;
      riskLevel = "Moderate Alert";
      recommendation = "An unauthorized verification was registered. Query distributor status.";
    } else if (unauthCount >= 2 && unauthCount < 5) {
      overallHealth = "Security Breach Alert";
      trustLevel = 40;
      riskLevel = "High Threat Alert";
      recommendation = "Multiple unauthorized access counts logged. Investigate batch leakage.";
    } else {
      overallHealth = "Compromised / Suspended";
      trustLevel = 0;
      riskLevel = "Critical Threat";
      recommendation = "Critical counterfeit indicators. Dispatch containment investigator.";
    }
  }

  const hScore = document.getElementById('detail-health-score');
  hScore.innerText = overallHealth;
  hScore.style.color = unauthCount > 0 ? 'var(--error)' : 'var(--accent)';

  document.getElementById('detail-trust-level').innerText = `${trustLevel}%`;
  document.getElementById('detail-risk-level').innerText = riskLevel;
  document.getElementById('detail-attempts-ver').innerText = `${successCount} Successful, ${unauthCount} Failed`;
  document.getElementById('detail-verdict').innerText = recommendation;

  // Recall Manager UI
  const warningBlock = document.getElementById('recall-warning-block');
  const clearBtn = document.getElementById('btn-clear-recall');
  const repairBtn = document.getElementById('btn-repair-recall');

  if (p.isRecalled) {
    warningBlock.style.display = 'block';
    document.getElementById('detail-recall-reason').innerText = p.recallReason || "";
    document.getElementById('detail-recall-severity').innerText = p.recallSeverity || "Medium";
    document.getElementById('detail-recall-instr').innerText = p.recallInstructions || "";
    document.getElementById('detail-recall-center').innerText = p.recallNearestCentre || "Any Authorized Hub";
    document.getElementById('detail-recall-refund').innerText = p.recallRefundAvailable ? "Yes" : "No";

    clearBtn.style.display = 'inline-block';
  } else {
    warningBlock.style.display = 'none';
    clearBtn.style.display = 'none';
  }

  // Return status
  const returnedBlock = document.getElementById('recall-returned-block');
  if (returnedBlock) {
    if (p.isReturnedForRecall) {
      returnedBlock.style.display = 'block';
      document.getElementById('detail-recall-returned-by').innerText = `${p.returnedByRole.toUpperCase()} (${p.returnedByUsername})`;
      if (repairBtn) repairBtn.style.display = 'inline-block';
    } else {
      returnedBlock.style.display = 'none';
      if (repairBtn) repairBtn.style.display = 'none';
    }
  }

  // Supply Chain timeline
  const journeyTimelineContent = document.getElementById('journey-timeline-content');
  journeyTimelineContent.innerHTML = '';

  const journey = p.supplyChainJourney || [];
  if (journey.length === 0) {
    journeyTimelineContent.innerHTML = '<div style="font-size:0.85rem; color:var(--color-secondary); padding: 0.5rem 0;">No logistics check-in records have been registered.</div>';
  } else {
    journey.forEach((step, index) => {
      const stepDiv = document.createElement('div');
      stepDiv.style.borderLeft = "2px solid var(--card-border)";
      stepDiv.style.paddingLeft = "1rem";
      stepDiv.style.position = "relative";
      stepDiv.style.marginBottom = "0.5rem";

      const badgeColor = step.verified ? "var(--accent)" : "var(--error)";
      const dot = `<div style="position:absolute; left:-6px; top:4px; width:10px; height:10px; border-radius:50%; background-color:${badgeColor};"></div>`;

      stepDiv.innerHTML = `
        ${dot}
        <div style="font-size: 0.85rem; font-weight:600; color:var(--color-primary);">${step.action} &bull; ${step.stage} (${step.name})</div>
        <div style="font-size:0.75rem; color:var(--color-secondary);">${new Date(step.timestamp).toLocaleString()}</div>
        <div style="font-size:0.75rem; color:var(--color-secondary); font-style:italic;">Location: ${step.location || 'Not Recorded'}</div>
      `;
      journeyTimelineContent.appendChild(stepDiv);
    });

    // Highlight Stepper Bulbs
    const hasCustomerScan = journey.some(t => t.stage === 'Customer' && t.verified === true);

    let activeStep = 1;
    if (hasCustomerScan) {
      activeStep = 5;
    } else if (p.retailerStatus === 'Dispatched') {
      activeStep = 4;
    } else if (p.distributorStatus === 'Dispatched' || p.retailerStatus === 'Received') {
      activeStep = 3;
    } else if (p.distributorStatus === 'Received') {
      activeStep = 2;
    } else {
      activeStep = 1;
    }

    const progressBar = document.getElementById('stepper-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${(activeStep - 1) * 25}%`;
    }

    const stepDivs = document.querySelectorAll('#custody-stepper .step');
    stepDivs.forEach(step => {
      const stepNum = parseInt(step.getAttribute('data-step'), 10);
      const bulb = step.querySelector('.step-bulb');
      const label = step.querySelector('.step-label');
      if (bulb) {
        if (stepNum <= activeStep) {
          bulb.style.background = 'var(--accent)';
          bulb.style.borderColor = 'var(--accent)';
          bulb.style.color = 'var(--bg-primary)';
          if (label) label.style.color = 'var(--color-primary)';
        } else {
          bulb.style.background = 'var(--bg-primary)';
          bulb.style.borderColor = 'var(--card-border)';
          bulb.style.color = 'var(--color-secondary)';
          if (label) label.style.color = 'var(--color-secondary)';
        }
      }
    });
  }

  // Bind footer events
  document.getElementById('btn-qrcode-zoom').onclick = () => {
    openQrModal(p.qrCodePath, p.productId);
  };
}

// Inline Trigger Forms toggling
document.getElementById('btn-trigger-recall-form').addEventListener('click', () => {
  document.getElementById('inline-recall-form').style.display = 'block';
  document.getElementById('inline-logistics-form').style.display = 'none';
});

document.getElementById('btn-cancel-recall-form').addEventListener('click', () => {
  document.getElementById('inline-recall-form').style.display = 'none';
});

// Submit Recall Form
document.getElementById('btn-submit-recall').addEventListener('click', async () => {
  if (!activeDetailProduct) return;

  const reason = document.getElementById('recall-input-reason').value.trim();
  const severity = document.getElementById('recall-input-severity').value;
  const refundAvailable = document.getElementById('recall-input-refund').value === 'true';
  const nearestCentre = document.getElementById('recall-input-center').value.trim();
  const instructions = document.getElementById('recall-input-instr').value.trim();

  if (!reason) {
    showAlert("Please specify a recall reason.", "warning");
    return;
  }

  showLoading('btn-submit-recall', 'Submitting...');
  try {
    const res = await authenticatedFetch('/api/admin/recall-product', {
      method: 'POST',
      body: {
        productId: activeDetailProduct.productId,
        reason,
        severity,
        instructions,
        refundAvailable,
        nearestCentre
      }
    });

    const result = await res.json();
    if (result.success) {
      showAlert("Product recall issued successfully.", "success");
      document.getElementById('inline-recall-form').style.display = 'none';
      // Reset recall inputs
      document.getElementById('recall-input-reason').value = '';
      document.getElementById('recall-input-center').value = '';
      document.getElementById('recall-input-instr').value = '';
      // Refetch and update dossier details
      viewDetailsModal(activeDetailProduct.productId);
    } else {
      showAlert(result.message || "Recall submission failed.", "error");
    }
  } catch (error) {
    showAlert("Recall logging error.", "error");
  } finally {
    hideLoading('btn-submit-recall');
  }
});

// Clear/Cancel Recall Button
document.getElementById('btn-clear-recall').addEventListener('click', async () => {
  if (!activeDetailProduct) return;

  const conf = await confirmAction(`Are you sure you want to clear the active recall for "${activeDetailProduct.name}"?`);
  if (!conf) return;

  const btn = document.getElementById('btn-clear-recall');
  showLoading('btn-clear-recall', 'Clearing...');

  try {
    const res = await authenticatedFetch('/api/admin/cancel-recall', {
      method: 'POST',
      body: {
        productId: activeDetailProduct.productId
      }
    });

    const result = await res.json();
    if (result.success) {
      showAlert("Recall cleared successfully.", "success");
      viewDetailsModal(activeDetailProduct.productId);
    } else {
      showAlert(result.message || "Unable to clear recall.", "error");
    }
  } catch (error) {
    showAlert("Recall cancellation error.", "error");
  } finally {
    hideLoading('btn-clear-recall');
  }
});

// Repair & Re-release Button
document.getElementById('btn-repair-recall').addEventListener('click', async () => {
  if (!activeDetailProduct) return;

  const conf = await confirmAction(`Are you sure you want to repair and re-release product "${activeDetailProduct.productId}"?`);
  if (!conf) return;

  showLoading('btn-repair-recall', 'Repairing...');

  try {
    const res = await authenticatedFetch(`/api/admin/product/${activeDetailProduct.productId}/repair`, {
      method: 'POST'
    });

    const result = await res.json();
    if (result.success) {
      showAlert(result.message || "Product repaired and re-released.", "success");
      // Close active modal, reload table, and reopen modal to see updated timeline
      await fetchProducts(); // Refresh products list
      viewDetailsModal(activeDetailProduct.productId); // Refresh modal view
    } else {
      showAlert(result.message || "Repair action failed.", "error");
    }
  } catch (err) {
    console.error(err);
    showAlert("Error executing repair request.", "error");
  } finally {
    hideLoading('btn-repair-recall');
  }
});

document.getElementById('btn-assign-logistics').addEventListener('click', () => {
  document.getElementById('inline-logistics-form').style.display = 'block';
  document.getElementById('inline-recall-form').style.display = 'none';

  // Reset form inputs
  document.getElementById('assign-role-select').value = '';
  document.getElementById('distributor-select-group').style.display = 'none';
  document.getElementById('retailer-select-group').style.display = 'none';
  document.getElementById('entity-location-info').style.display = 'none';
  document.getElementById('btn-submit-logistics').setAttribute('disabled', 'true');
});

document.getElementById('btn-cancel-logistics-form').addEventListener('click', () => {
  document.getElementById('inline-logistics-form').style.display = 'none';
});

// Role select event listener
document.getElementById('assign-role-select').addEventListener('change', async (e) => {
  const role = e.target.value;
  const distGroup = document.getElementById('distributor-select-group');
  const retGroup = document.getElementById('retailer-select-group');
  const distSelect = document.getElementById('distributor-assign-select');
  const retSelect = document.getElementById('retailer-assign-select');
  const infoBlock = document.getElementById('entity-location-info');
  const submitBtn = document.getElementById('btn-submit-logistics');

  // Hide everything first
  distGroup.style.display = 'none';
  retGroup.style.display = 'none';
  infoBlock.style.display = 'none';
  submitBtn.setAttribute('disabled', 'true');

  if (role === 'distributor') {
    distSelect.innerHTML = '<option value="">-- Loading Distributors --</option>';
    distGroup.style.display = 'block';
    try {
      const res = await authenticatedFetch('/api/admin/distributors');
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) {
        let html = '<option value="">-- Choose Distributor --</option>';
        result.data.forEach(d => {
          html += `<option value="${d.distributorId}" data-lat="${d.latitude}" data-lng="${d.longitude}" data-addr="${d.address}" data-name="${d.name}">${d.name} (${d.distributorId})</option>`;
        });
        distSelect.innerHTML = html;
      } else {
        distSelect.innerHTML = '<option value="">Error loading</option>';
      }
    } catch {
      distSelect.innerHTML = '<option value="">Error loading</option>';
    }
  } else if (role === 'retailer') {
    retSelect.innerHTML = '<option value="">-- Loading Retailers --</option>';
    retGroup.style.display = 'block';
    try {
      const res = await authenticatedFetch('/api/admin/retailers');
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) {
        let html = '<option value="">-- Choose Retailer --</option>';
        result.data.forEach(r => {
          html += `<option value="${r.retailerId}" data-lat="${r.latitude}" data-lng="${r.longitude}" data-addr="${r.address}" data-name="${r.name}">${r.name} (${r.retailerId})</option>`;
        });
        retSelect.innerHTML = html;
      } else {
        retSelect.innerHTML = '<option value="">Error loading</option>';
      }
    } catch {
      retSelect.innerHTML = '<option value="">Error loading</option>';
    }
  }
});

// Update location details for distributor choice
document.getElementById('distributor-assign-select').addEventListener('change', (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  updateLocationDetailsPreview(opt);
});

// Update location details for retailer choice
document.getElementById('retailer-assign-select').addEventListener('change', (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  updateLocationDetailsPreview(opt);
});

function updateLocationDetailsPreview(opt) {
  const infoBlock = document.getElementById('entity-location-info');
  const submitBtn = document.getElementById('btn-submit-logistics');

  if (!opt || !opt.value) {
    infoBlock.style.display = 'none';
    submitBtn.setAttribute('disabled', 'true');
    return;
  }

  const lat = parseFloat(opt.getAttribute('data-lat'));
  const lng = parseFloat(opt.getAttribute('data-lng'));
  const addr = opt.getAttribute('data-addr');

  document.getElementById('entity-location-address').innerText = addr || "No depot/outlet address registered.";
  document.getElementById('entity-location-coords').innerText = `Latitude: ${lat.toFixed(6)}, Longitude: ${lng.toFixed(6)}`;
  infoBlock.style.display = 'block';
  submitBtn.removeAttribute('disabled');
}

// Unified Assignment Submission
document.getElementById('btn-submit-logistics').addEventListener('click', async () => {
  if (!activeDetailProduct) return;

  const targetCustomer = document.getElementById('assign-target-customer').value.trim();
  if (!targetCustomer) {
    showAlert("Please specify the target customer username.", "warning");
    return;
  }

  const role = document.getElementById('assign-role-select').value;
  let url = '';
  let bodyData = {};

  if (role === 'distributor') {
    const val = document.getElementById('distributor-assign-select').value;
    if (!val) {
      showAlert("Please select a distributor depots hub.", "warning");
      return;
    }
    url = `/api/admin/product/${encodeURIComponent(activeDetailProduct.productId)}/assign-distributor`;
    bodyData = { distributorId: val, targetCustomer };
  } else if (role === 'retailer') {
    const val = document.getElementById('retailer-assign-select').value;
    if (!val) {
      showAlert("Please select a retailer storefront outlet.", "warning");
      return;
    }
    url = `/api/admin/product/${encodeURIComponent(activeDetailProduct.productId)}/assign-retailer`;
    bodyData = { retailerId: val, targetCustomer };
  } else {
    showAlert("Please select an entity role first.", "warning");
    return;
  }

  showLoading('btn-submit-logistics', 'Assigning...');
  try {
    const res = await authenticatedFetch(url, {
      method: 'POST',
      body: bodyData
    });

    const result = await res.json();
    if (result.success) {
      showAlert("Logistics assignment registered successfully.", "success");
      document.getElementById('inline-logistics-form').style.display = 'none';
      // Refetch details
      viewDetailsModal(activeDetailProduct.productId);
    } else {
      showAlert(result.message || "Assignment failed.", "error");
    }
  } catch (error) {
    showAlert("Logistics connection error.", "error");
  } finally {
    hideLoading('btn-submit-logistics');
  }
});

// Delete Product Dossier
document.getElementById('btn-delete-product').addEventListener('click', async () => {
  if (!activeDetailProduct) return;

  const conf = await confirmAction(`CRITICAL COMMAND ALERT: Are you completely sure you want to remove "${activeDetailProduct.name}" (ID: ${activeDetailProduct.productId}) and clear all associated details permanently?`);
  if (!conf) return;

  showLoading('btn-delete-product', 'Deleting...');

  try {
    const res = await authenticatedFetch(`/api/admin/product/${encodeURIComponent(activeDetailProduct.productId)}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (result.success) {
      showAlert(result.message || "Product trace erased.", "success");
      closeDetailsModal();
      fetchProducts();
    } else {
      showAlert(result.message || "Deletion request refused.", "error");
    }
  } catch (error) {
    showAlert("Network failure while deleting.", "error");
  } finally {
    hideLoading('btn-delete-product');
  }
});

// Fetch and open Audit logs section
window.viewAuditLogs = async function (productId, productName) {
  const auditSection = document.getElementById('audit-log-section');
  const auditTitle = document.getElementById('audit-title');
  const auditTbody = document.getElementById('audit-table-body');

  auditTitle.innerText = `${productName} (${productId})`;
  auditTbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; color: var(--color-secondary); padding: 2rem;">
        Loading verification transaction logs...
      </td>
    </tr>
  `;
  auditSection.style.display = 'block';
  auditSection.scrollIntoView({ behavior: 'smooth' });

  try {
    const res = await authenticatedFetch(`/product/${encodeURIComponent(productId)}/history`);
    if (!res.ok) throw new Error("Failed to load logs.");

    const result = await res.json();
    if (result.success) {
      const history = result.data;
      renderAuditLogs(history);
    } else {
      showAlert(result.message || "Failed to load audit history.", "error");
    }
  } catch (error) {
    console.error("View audit logs err:", error);
    showAlert("Failed to retrieve audit trail.", "error");
    auditTbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--error); padding: 2rem;">
          Connection refused. Please try again.
        </td>
      </tr>
    `;
  }
};

function renderAuditLogs(history) {
  const tbody = document.getElementById('audit-table-body');
  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--color-secondary); padding: 2.5rem;">
          No verification attempts logged for this product.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  // Show newest audit trails first
  history.slice().reverse().forEach(log => {
    const tr = document.createElement('tr');

    // Status Badge
    let badgeClass = 'badge-unauthorized';
    if (log.status === 'Authorized Centre Verified') badgeClass = 'badge-authorized';
    if (log.status === 'Admin Approved') badgeClass = 'badge-approved';

    const timestamp = new Date(log.verifiedAt).toLocaleString();

    tr.innerHTML = `
      <td style="font-size: 0.85rem; color: var(--color-secondary); font-family: monospace;">
        ${timestamp}
      </td>
      <td style="font-size: 0.85rem; color: var(--color-secondary); max-width: 250px; word-break: break-all;">
        ${log.verifierLocation}
      </td>
      <td style="font-family: monospace; font-size: 0.82rem; color: var(--color-secondary);">
        ${log.latitude.toFixed(6)}, ${log.longitude.toFixed(6)}
      </td>
      <td style="font-weight: 600;">
        ${log.matchedCenter || '<span style="color:var(--color-secondary); font-style:italic">None</span>'}
      </td>
      <td>
        <span class="badge ${badgeClass}">${log.status}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.closeAuditSection = function () {
  document.getElementById('audit-log-section').style.display = 'none';
};

// Bind local filter and sort
document.getElementById('search-prod').addEventListener('input', renderProductsTable);
const filterStatusEl = document.getElementById('filter-status');
if (filterStatusEl) filterStatusEl.addEventListener('change', renderProductsTable);
const sortProdEl = document.getElementById('sort-prod');
if (sortProdEl) sortProdEl.addEventListener('change', renderProductsTable);

// Init fetch
fetchProducts();
