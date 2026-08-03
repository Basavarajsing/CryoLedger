// Retailer Dashboard Scripts
checkAccess('retailer');

createHeader('retailer');
createFooter();

// Map & coords state
let pickerMap = null;
let pickerMarker = null;
let currentProducts = [];

// Initialize Dashboard UI & data
window.onload = async function () {
    const username = localStorage.getItem('username');
    if (username) {
        document.getElementById('welcome-message').innerText = `Welcome, ${username}! Confirm incoming distributor consignments and track active storefront inventory.`;
    }

    // Fetch profile (retailer details)
    await loadRetailerProfile();

    // Fetch Assigned Products
    await loadProducts();
};

// Tabs Switching
const tabIncoming = document.getElementById('btn-tab-incoming');
const tabStorefront = document.getElementById('btn-tab-storefront');

const secIncoming = document.getElementById('incoming-section');
const secStorefront = document.getElementById('storefront-section');

tabIncoming.addEventListener('click', () => {
    setActiveTab(tabIncoming, secIncoming);
});
tabStorefront.addEventListener('click', () => {
    setActiveTab(tabStorefront, secStorefront);
});

function setActiveTab(btn, sec) {
    [tabIncoming, tabStorefront].forEach(b => {
        b.className = "btn btn-secondary";
        b.style.padding = "0.5rem 1rem";
    });
    btn.className = "btn btn-primary";
    btn.style.padding = "0.5rem 1rem";

    [secIncoming, secStorefront].forEach(s => s.style.display = 'none');
    sec.style.display = 'block';
}

// Fetch Profile
async function loadRetailerProfile() {
    try {
        const username = localStorage.getItem('username').toUpperCase();
        // Look up profile details from registered list
        const res = await authenticatedFetch('/api/admin/retailers');
        const result = await res.json();
        if (result.success) {
            const profile = result.data.find(r => r.retailerId === username);
            if (profile) {
                document.getElementById('setup-profile-card').style.display = 'none';
                document.getElementById('retailer-profile-info').innerHTML = `
                    <strong>Outlet Name:</strong> ${profile.name}<br>
                    <strong>ID:</strong> ${profile.retailerId}<br>
                    <strong>Address:</strong> ${profile.address}<br>
                    <strong>Outlet GPS Coords:</strong> ${profile.latitude.toFixed(6)}, ${profile.longitude.toFixed(6)}<br>
                    <strong>Geofence Tolerance:</strong> 200 Meters
                `;
                // Store standard center coordinates for mock map checks
                window.retailLat = profile.latitude;
                window.retailLng = profile.longitude;
            } else {
                document.getElementById('retailer-profile-info').innerText = "Retailer outlet profile is not registered on manufacturer nodes.";
                initSetupProfileForm();
            }
        }
    } catch (err) {
        console.error(err);
        document.getElementById('retailer-profile-info').innerText = "Failed loading outlet credentials context.";
    }
}

// Load Products
async function loadProducts() {
    try {
        const res = await authenticatedFetch('/api/retailer/assigned-products');
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
    const listStorefront = document.getElementById('storefront-list');

    listIncoming.innerHTML = '';
    listStorefront.innerHTML = '';

    const incoming = currentProducts.filter(p => p.retailerStatus === 'Assigned' || p.retailerStatus === 'Pending Check-in');
    const storefront = currentProducts.filter(p => p.retailerStatus === 'Received' || p.retailerStatus === 'Dispatched');

    // Render Incoming
    if (incoming.length === 0) {
        listIncoming.innerHTML = '<div style="color:var(--color-secondary); padding: 2rem; text-align:center;">No shipments currently routed here.</div>';
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
                        📍 Log Outlet possession Geocheck
                    </button>
                    ${returnBtn}
                `;
            }
            card.appendChild(action);
            listIncoming.appendChild(card);
        });
    }

    // Render Storefront
    if (storefront.length === 0) {
        listStorefront.innerHTML = '<div style="color:var(--color-secondary); padding: 2rem; text-align:center;">Storefront stock empty.</div>';
    } else {
        storefront.forEach(p => {
            const card = createProductCard(p);

            const action = document.createElement('div');
            action.className = 'action-area';
            if (p.isReturnedForRecall) {
                action.innerHTML = `<span style="color: var(--accent); font-weight: bold; font-size:0.85rem;">↩️ Returned for Recall</span>`;
            } else if (p.retailerStatus === 'Received') {
                let returnBtn = '';
                if (p.isRecalled) {
                    returnBtn = `
                        <button class="btn btn-danger" onclick="openReturnRecallModal('${p.productId}')" style="padding: 0.35rem 0.8rem; font-size:0.8rem; margin-left: 0.5rem;">
                            ↩️ Return Recall
                        </button>
                    `;
                }
                action.innerHTML = `
                    <button class="btn btn-primary" onclick="dispatchProduct('${p.productId}', event)" style="padding: 0.35rem 0.8rem; font-size:0.8rem;">
                        🚚 Dispatch / Handover to Customer
                    </button>
                    ${returnBtn}
                `;
            } else {
                action.innerHTML = `
                    <span style="color: var(--accent); font-weight: bold; font-size:0.85rem;">
                        ✅ Handover Completed / Dispatched
                    </span>
                `;
            }
            card.appendChild(action);
            listStorefront.appendChild(card);
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

// Open Receive Panel
function openReceivePanel(productId) {
    document.getElementById('geo-auth-panel').style.display = 'block';

    document.getElementById('target-prod-id').value = productId;
    document.getElementById('verify-lat').value = window.retailLat ? window.retailLat.toFixed(6) : '';
    document.getElementById('verify-lng').value = window.retailLng ? window.retailLng.toFixed(6) : '';

    document.getElementById('geo-auth-panel').scrollIntoView({ behavior: 'smooth' });
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
    btn.innerText = "Confirming receipt...";

    try {
        const res = await authenticatedFetch('/api/retailer/receive', {
            method: 'POST',
            body: { productId, lat, lng }
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showAlert("Receipt confirmation logged at storefront outlet.", "success");
            document.getElementById('geo-auth-panel').style.display = 'none';
            await loadProducts(); // Reload lists
        } else {
            showAlert(result.message || "Outlet coordinates verification checks failed.", "error");
        }
    } catch (error) {
        console.error(error);
        showAlert("Network connection error.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "📥 Log Outlet Receipt Confirmation";
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
            const res = await authenticatedFetch('/api/retailer/profile', {
                method: 'POST',
                body: { name, address, latitude: lat, longitude: lng, contact }
            });
            const result = await res.json();
            if (res.ok && result.success) {
                showAlert("Retail Outlet profile registered!", "success");
                document.getElementById('setup-profile-card').style.display = 'none';
                await loadRetailerProfile(); // Reload
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

window.dispatchProduct = async function (productId, event) {
    const btn = event ? event.target : null;
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.innerText = "Dispatching...";
    }

    try {
        const res = await authenticatedFetch('/api/retailer/dispatch', {
            method: 'POST',
            body: { productId }
        });
        const result = await res.json();

        if (result.success) {
            showAlert("Product officially handed over and dispatched to customer!", "success");
            await loadProducts();
        } else {
            showAlert(result.message || "Dispatch failed.", "error");
        }
    } catch (err) {
        console.error(err);
        showAlert("Server connection failed.", "error");
    } finally {
        if (btn) {
            btn.removeAttribute('disabled');
            btn.innerText = "🚚 Dispatch / Handover to Customer";
        }
    }
};

// Return Recall Triggers
window.openReturnRecallModal = function (productId) {
    document.getElementById('geo-auth-panel').style.display = 'none';
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
