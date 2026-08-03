// Distributor Dashboard Scripts
checkAccess('distributor');

createHeader('distributor');
createFooter();

// Map & coords state
let pickerMap = null;
let pickerMarker = null;
let currentProducts = [];

// Initialize Dashboard UI & data
window.onload = async function () {
    const username = localStorage.getItem('username');
    if (username) {
        document.getElementById('welcome-message').innerText = `Welcome, ${username}! Manage incoming consignments and authorize Retail Outlet dispatch records.`;
    }

    // Fetch profile (distributor details)
    await loadDistributorProfile();

    // Fetch Assigned Products
    await loadProducts();

    // Fetch Retailers list for transfer dropdown
    await loadRetailers();
};

// Tabs Switching
const tabIncoming = document.getElementById('btn-tab-incoming');
const tabDepot = document.getElementById('btn-tab-depot');
const tabHistory = document.getElementById('btn-tab-history');

const secIncoming = document.getElementById('incoming-section');
const secDepot = document.getElementById('depot-section');
const secHistory = document.getElementById('history-section');

tabIncoming.addEventListener('click', () => {
    setActiveTab(tabIncoming, secIncoming);
});
tabDepot.addEventListener('click', () => {
    setActiveTab(tabDepot, secDepot);
});
tabHistory.addEventListener('click', () => {
    setActiveTab(tabHistory, secHistory);
});

function setActiveTab(btn, sec) {
    [tabIncoming, tabDepot, tabHistory].forEach(b => {
        b.className = "btn btn-secondary";
        b.style.padding = "0.5rem 1rem";
    });
    btn.className = "btn btn-primary";
    btn.style.padding = "0.5rem 1rem";

    [secIncoming, secDepot, secHistory].forEach(s => s.style.display = 'none');
    sec.style.display = 'block';
}

// Fetch Profile
async function loadDistributorProfile() {
    try {
        const username = localStorage.getItem('username').toUpperCase();
        // Since profile details are retrieved by admin, let's look them up from distributor info
        const res = await authenticatedFetch('/api/admin/distributors');
        const result = await res.json();
        if (result.success) {
            const profile = result.data.find(d => d.distributorId === username);
            if (profile) {
                document.getElementById('setup-profile-card').style.display = 'none';
                document.getElementById('depot-profile-info').innerHTML = `
                    <strong>Depot Name:</strong> ${profile.name}<br>
                    <strong>ID:</strong> ${profile.distributorId}<br>
                    <strong>Address:</strong> ${profile.address}<br>
                    <strong>GPS Coordinates:</strong> ${profile.latitude.toFixed(6)}, ${profile.longitude.toFixed(6)}<br>
                    <strong>Geofence Tolerance:</strong> 500 Meters
                `;
                // Store standard center coordinates for mock map checks
                window.depotLat = profile.latitude;
                window.depotLng = profile.longitude;
            } else {
                document.getElementById('depot-profile-info').innerText = "Distributor profile record not declared on manufacturer nodes.";
                initSetupProfileForm();
            }
        }
    } catch (err) {
        console.error(err);
        document.getElementById('depot-profile-info').innerText = "Failed loading depot credentials context.";
    }
}

// Load Products
async function loadProducts() {
    try {
        const res = await authenticatedFetch('/api/distributor/assigned-products');
        const result = await res.json();
        if (result.success) {
            currentProducts = result.data || [];
            renderProductLists();
        } else {
            showAlert("Failed fetching assigned list.", "error");
        }
    } catch (error) {
        console.error(error);
        showAlert("Server connection failed.", "error");
    }
}

// Render product lists
function renderProductLists() {
    const listIncoming = document.getElementById('incoming-list');
    const listDepot = document.getElementById('depot-list');
    const listHistory = document.getElementById('history-list');

    listIncoming.innerHTML = '';
    listDepot.innerHTML = '';
    listHistory.innerHTML = '';

    const incoming = currentProducts.filter(p => p.distributorStatus === 'Assigned' || p.distributorStatus === 'Pending Check-in');
    const depot = currentProducts.filter(p => p.distributorStatus === 'Received');
    const history = currentProducts.filter(p => p.distributorStatus === 'Dispatched');

    // Render Incoming
    if (incoming.length === 0) {
        listIncoming.innerHTML = '<div style="color:var(--color-secondary); padding: 2rem; text-align:center;">No incoming shipments assigned.</div>';
    } else {
        incoming.forEach(p => {
            const card = createProductCard(p);

            const action = document.createElement('div');
            action.className = 'action-area';
            if (p.isReturnedForRecall) {
                action.innerHTML = `<span style="color: var(--accent); font-weight: bold; font-size:0.85rem;">↩️ Returned for Recall</span>`;
            } else {
                let returnBtn = '';
                if (p.isRecalled) {
                    returnBtn = `
                        <button class="btn btn-danger" onclick="openReturnRecallModal('${p.productId}')" style="padding: 0.35rem 0.8rem; font-size:0.8rem; margin-left: 0.5rem;">
                            ↩️ Return Recall
                        </button>
                    `;
                }
                action.innerHTML = `
                    <button class="btn btn-secondary" onclick="openReceivePanel('${p.productId}')" style="padding: 0.35rem 0.8rem; font-size:0.8rem;">
                        📍 Initiate Geocheck Ingestion
                    </button>
                    ${returnBtn}
                `;
            }
            card.appendChild(action);
            listIncoming.appendChild(card);
        });
    }

    // Render Depot Stock
    if (depot.length === 0) {
        listDepot.innerHTML = '<div style="color:var(--color-secondary); padding: 2rem; text-align:center;">No products in depot stock.</div>';
    } else {
        depot.forEach(p => {
            const card = createProductCard(p);

            const action = document.createElement('div');
            action.className = 'action-area';
            if (p.isReturnedForRecall) {
                action.innerHTML = `<span style="color: var(--accent); font-weight: bold; font-size:0.85rem;">↩️ Returned for Recall</span>`;
            } else {
                let returnBtn = '';
                if (p.isRecalled) {
                    returnBtn = `
                        <button class="btn btn-danger" onclick="openReturnRecallModal('${p.productId}')" style="padding: 0.35rem 0.8rem; font-size:0.8rem; margin-left: 0.5rem;">
                            ↩️ Return Recall
                        </button>
                    `;
                }
                action.innerHTML = `
                    <button class="btn btn-primary" onclick="openTransferPanel('${p.productId}')" style="padding: 0.35rem 0.8rem; font-size:0.8rem;">
                        🚚 Dispatch to Retail Outlet
                    </button>
                    ${returnBtn}
                `;
            }
            card.appendChild(action);
            listDepot.appendChild(card);
        });
    }

    // Render History
    if (history.length === 0) {
        listHistory.innerHTML = '<div style="color:var(--color-secondary); padding: 2rem; text-align:center;">No dispatched records found.</div>';
    } else {
        history.forEach(p => {
            const card = createProductCard(p);

            const info = document.createElement('div');
            info.className = 'action-area';
            info.style.fontSize = '0.8rem';
            info.style.color = 'var(--color-secondary)';

            let retailStatusText = p.retailerStatus || 'Pending';
            if (p.retailerStatus === 'Received' || p.retailerStatus === 'Dispatched') {
                retailStatusText = '<span style="color: var(--accent); font-weight: bold;">Retailer Scanned</span>';
            } else if (p.retailerStatus === 'Assigned') {
                retailStatusText = '<span style="color: #f1c40f;">Transferred Out (Pending Ingestion)</span>';
            }

            info.innerHTML = `
                <strong>Retailer ID:</strong> ${p.retailerId || 'N/A'}<br>
                <strong>Retail Status:</strong> ${retailStatusText}
            `;
            card.appendChild(info);
            listHistory.appendChild(card);
        });
    }
}

function createProductCard(product) {
    const div = document.createElement('div');
    div.className = 'product-list-card';

    let recallWarning = '';
    if (product.isRecalled) {
        recallWarning = `
            <div style="background-color:rgba(239,68,68,0.1); border: 1px solid var(--error); border-radius: var(--border-radius); padding: 0.6rem; margin-top: 0.5rem; color:#ff8a8a; font-size:0.8rem; line-height: 1.4;">
                <strong>⚠️ Active Recall Warning:</strong> ${product.recallReason || 'Safety advisory active.'}
                <div style="font-size: 0.72rem; color: var(--color-secondary); margin-top: 0.15rem;">
                    Severity: <strong>${product.recallSeverity}</strong> | Refund: <strong>${product.recallRefundAvailable ? 'Yes' : 'No'}</strong>
                </div>
            </div>
        `;
    }

    let returnStatusBadge = '';
    if (product.isReturnedForRecall) {
        returnStatusBadge = `
            <div style="background-color:rgba(46,204,113,0.1); border:1px solid var(--accent); border-radius: var(--border-radius); padding: 0.5rem; margin-top: 0.5rem; color:var(--accent); font-size:0.8rem;">
                <strong>✅ Custody Surrendered:</strong> Returned for recall by ${product.returnedByRole.toUpperCase()} (${product.returnedByUsername}).
            </div>
        `;
    }

    div.innerHTML = `
        <div style="font-size:0.8rem; color:var(--color-secondary); font-family:monospace; margin-bottom:0.25rem;">UID: ${product.productId}</div>
        <div style="font-weight:600; font-size:1.1rem; color:var(--color-primary);">${product.name}</div>
        <div style="font-size:0.85rem; color:var(--color-secondary);">Brand: ${product.brand} &bull; Model: ${product.modelNumber || 'N/A'}</div>
        ${recallWarning}
        ${returnStatusBadge}
    `;
    return div;
}

// Cache Retailers Selection
async function loadRetailers() {
    try {
        const res = await authenticatedFetch('/api/admin/retailers');
        const result = await res.json();
        if (result.success) {
            window.retailers = result.data || [];
        }
    } catch (err) {
        console.error(err);
    }
}

// Open Receive Panel
function openReceivePanel(productId) {
    document.getElementById('transfer-panel').style.display = 'none';
    document.getElementById('geo-auth-panel').style.display = 'block';

    document.getElementById('target-prod-id').value = productId;
    document.getElementById('verify-lat').value = window.depotLat ? window.depotLat.toFixed(6) : '';
    document.getElementById('verify-lng').value = window.depotLng ? window.depotLng.toFixed(6) : '';

    document.getElementById('geo-auth-panel').scrollIntoView({ behavior: 'smooth' });
}

// Open Transfer Panel
function openTransferPanel(productId) {
    document.getElementById('geo-auth-panel').style.display = 'none';
    document.getElementById('transfer-panel').style.display = 'block';

    document.getElementById('transfer-prod-id').value = productId;

    // Search the pre-assigned retailer details
    const product = currentProducts.find(p => p.productId === productId);
    let displayName = 'None pre-assigned';
    if (product && product.retailerId) {
        const retInfo = (window.retailers || []).find(r => r.retailerId === product.retailerId);
        displayName = retInfo ? `${retInfo.name} (${product.retailerId})` : product.retailerId;
    }
    document.getElementById('transfer-retailer-name').value = displayName;

    document.getElementById('transfer-panel').scrollIntoView({ behavior: 'smooth' });
}

// GPS Fetch
document.getElementById('btn-use-gps').addEventListener('click', async () => {
    const btn = document.getElementById('btn-use-gps');
    btn.setAttribute('disabled', 'true');
    btn.innerText = "📡 Fetching GPS...";

    try {
        const location = await getBrowserLocation();
        const lat = location.latitude;
        const lng = location.longitude;

        document.getElementById('verify-lat').value = lat.toFixed(6);
        document.getElementById('verify-lng').value = lng.toFixed(6);

        showAlert("Current GPS coordinates resolved successfully.", "success");

        if (pickerMap) {
            updateSelectedCoords(lat, lng);
        }
    } catch (err) {
        showAlert(err.message || "Failed to fetch GPS coordinates. Please select manually.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "📡 Use Current GPS Location";
    }
});

// Execute Receive Geocheck
document.getElementById('btn-execute-receipt').addEventListener('click', async () => {
    const productId = document.getElementById('target-prod-id').value;
    const lat = parseFloat(document.getElementById('verify-lat').value);
    const lng = parseFloat(document.getElementById('verify-lng').value);

    if (isNaN(lat) || isNaN(lng)) {
        showAlert("Coordinates (lat, lng) are required. Please use GPS or click the map.", "error");
        return;
    }

    const btn = document.getElementById('btn-execute-receipt');
    btn.setAttribute('disabled', 'true');
    btn.innerText = "Processing ingestion...";

    try {
        const res = await authenticatedFetch('/api/distributor/receive', {
            method: 'POST',
            body: { productId, lat, lng }
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showAlert("Receipt confirmation logged at depot.", "success");
            document.getElementById('geo-auth-panel').style.display = 'none';
            await loadProducts(); // Reload lists
        } else {
            showAlert(result.message || "Coordinates check failed.", "error");
        }
    } catch (error) {
        console.error(error);
        showAlert("Network connection error.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "📥 Confirm and Terminate Depot Ingestion";
    }
});

// Execute Transfer
document.getElementById('btn-execute-transfer').addEventListener('click', async () => {
    const productId = document.getElementById('transfer-prod-id').value;

    const btn = document.getElementById('btn-execute-transfer');
    btn.setAttribute('disabled', 'true');
    btn.innerText = "Forwarding shipment...";

    try {
        const res = await authenticatedFetch('/api/distributor/transfer', {
            method: 'POST',
            body: { productId }
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showAlert("Consignment successfully dispatched to pre-assigned outlet.", "success");
            document.getElementById('transfer-panel').style.display = 'none';
            await loadProducts(); // Reload lists
        } else {
            showAlert(result.message || "Failed dispatch consignment.", "error");
        }
    } catch (error) {
        console.error(error);
        showAlert("Network connection error.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "🚚 Issue Outlet Dispatch Authorization";
    }
});

let setupMap = null;
let setupMarker = null;

function initSetupProfileForm() {
    document.getElementById('setup-profile-card').style.display = 'block';

    // GPS Fetch
    document.getElementById('btn-setup-gps').addEventListener('click', async () => {
        const btn = document.getElementById('btn-setup-gps');
        btn.setAttribute('disabled', 'true');
        btn.innerText = "📡 Fetching GPS...";
        try {
            const location = await getBrowserLocation();
            const lat = location.latitude;
            const lng = location.longitude;
            document.getElementById('setup-lat').value = lat.toFixed(6);
            document.getElementById('setup-lng').value = lng.toFixed(6);

            const address = await reverseGeocode(lat, lng);
            document.getElementById('setup-address').value = address;

            showAlert("Current GPS coordinates resolved successfully.", "success");
            if (setupMap) {
                updateSetupCoords(lat, lng);
            }
        } catch (err) {
            showAlert(err.message || "Failed to fetch GPS.", "error");
        } finally {
            btn.removeAttribute('disabled');
            btn.innerText = "📡 Use Current GPS Location";
        }
    });

    // Map Picker Toggle
    document.getElementById('btn-setup-toggle-map').addEventListener('click', () => {
        const wrapper = document.getElementById('setup-map-wrapper');
        if (wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
            initSetupMap();
        } else {
            wrapper.style.display = 'none';
        }
    });

    // Place Search logic
    const searchBtn = document.getElementById('btn-setup-search');
    if (searchBtn) {
        searchBtn.addEventListener('click', async () => {
            const query = document.getElementById('setup-search-input').value.trim();
            if (!query) {
                showAlert("Please enter a location query.", "warning");
                return;
            }

            const resultsDiv = document.getElementById('setup-search-results');
            resultsDiv.innerHTML = "<div style='padding: 10px; color: var(--color-secondary); font-size: 0.8rem;'>Searching...</div>";
            resultsDiv.style.display = 'block';

            try {
                const results = await searchLocation(query);
                if (results.length === 0) {
                    resultsDiv.innerHTML = "<div style='padding: 10px; color: var(--color-secondary); font-size: 0.8rem;'>No locations found.</div>";
                    return;
                }

                resultsDiv.innerHTML = '';
                results.forEach(loc => {
                    const item = document.createElement('div');
                    item.style.padding = '8px 12px';
                    item.style.borderBottom = '1px solid var(--card-border)';
                    item.style.cursor = 'pointer';
                    item.style.fontSize = '0.8rem';
                    item.innerText = loc.name;

                    item.addEventListener('mouseenter', () => {
                        item.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.backgroundColor = 'transparent';
                    });

                    item.addEventListener('click', async () => {
                        resultsDiv.style.display = 'none';
                        document.getElementById('setup-search-input').value = loc.name;
                        updateSetupCoords(loc.latitude, loc.longitude);
                        const address = await reverseGeocode(loc.latitude, loc.longitude);
                        document.getElementById('setup-address').value = address;
                    });
                    resultsDiv.appendChild(item);
                });
            } catch (err) {
                console.error("Setup geocoding search failed:", err);
                resultsDiv.innerHTML = "<div style='padding: 10px; color: var(--color-secondary); font-size: 0.8rem;'>Search error.</div>";
            }
        });

        // Close setup search dropdown on click outside
        document.addEventListener('click', (e) => {
            const searchInput = document.getElementById('setup-search-input');
            const searchResults = document.getElementById('setup-search-results');
            const sBtn = document.getElementById('btn-setup-search');
            if (e.target !== searchInput && e.target !== searchResults && e.target !== sBtn) {
                if (searchResults) searchResults.style.display = 'none';
            }
        });
    }

    // Submit Action
    document.getElementById('btn-save-profile').addEventListener('click', async () => {
        const name = document.getElementById('setup-name').value.trim();
        const contact = document.getElementById('setup-contact').value.trim();
        const address = document.getElementById('setup-address').value.trim();
        const lat = parseFloat(document.getElementById('setup-lat').value);
        const lng = parseFloat(document.getElementById('setup-lng').value);

        if (!name || !contact || !address || isNaN(lat) || isNaN(lng)) {
            showAlert("All setup profile fields are required.", "warning");
            return;
        }

        const btn = document.getElementById('btn-save-profile');
        btn.setAttribute('disabled', 'true');
        btn.innerText = "Saving profile...";

        try {
            const res = await authenticatedFetch('/api/distributor/profile', {
                method: 'POST',
                body: { name, address, latitude: lat, longitude: lng, contact }
            });
            const result = await res.json();
            if (res.ok && result.success) {
                showAlert("Depot logistics profile registered!", "success");
                document.getElementById('setup-profile-card').style.display = 'none';
                await loadDistributorProfile(); // Reload
            } else {
                showAlert(result.message || "Failed to save profile.", "error");
            }
        } catch (error) {
            console.error(error);
            showAlert("Network connection error.", "error");
        } finally {
            btn.removeAttribute('disabled');
            btn.innerText = "💾 Register Logistics Profile";
        }
    });
}

function initSetupMap() {
    if (setupMap) {
        setupMap.invalidateSize();
        return;
    }
    const center = [20.5937, 78.9629];
    setupMap = L.map('setup-map').setView(center, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; contributors'
    }).addTo(setupMap);

    setupMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        updateSetupCoords(lat, lng);
        const address = await reverseGeocode(lat, lng);
        document.getElementById('setup-address').value = address;
    });
}

function updateSetupCoords(lat, lng) {
    if (setupMarker) {
        setupMap.removeLayer(setupMarker);
    }
    setupMarker = L.marker([lat, lng]).addTo(setupMap);
    setupMap.setView([lat, lng], 14);

    document.getElementById('setup-lat').value = lat.toFixed(6);
    document.getElementById('setup-lng').value = lng.toFixed(6);
}

// Return Recall Triggers
window.openReturnRecallModal = function (productId) {
    document.getElementById('geo-auth-panel').style.display = 'none';
    document.getElementById('transfer-panel').style.display = 'none';
    document.getElementById('return-panel').style.display = 'block';

    document.getElementById('return-prod-id').value = productId;
    document.getElementById('return-password').value = '';
    document.getElementById('return-panel').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('btn-execute-return').addEventListener('click', async () => {
    const productId = document.getElementById('return-prod-id').value;
    const password = document.getElementById('return-password').value;

    if (!password) {
        showAlert("Please enter your account password.", "warning");
        return;
    }

    const btn = document.getElementById('btn-execute-return');
    btn.setAttribute('disabled', 'true');
    btn.innerText = "Authorizing custody surrender...";

    try {
        const res = await authenticatedFetch('/api/product/return-recall', {
            method: 'POST',
            body: { productId, password }
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showAlert("Surrender of custody logged successfully.", "success");
            document.getElementById('return-panel').style.display = 'none';
            await loadProducts();
        } else {
            showAlert(result.message || "Credential authentication failed.", "error");
        }
    } catch (err) {
        console.error(err);
        showAlert("Network connection error.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "Confirm and Return Custody";
    }
});
