// Add Product Page Logic
checkAccess('admin');

let map;
let marker;
let tempSelectedLocation = null;
let authorizedCenters = [];

// Initialize Header & Footer
createHeader('add-product');
createFooter();

// Initialize Map
function initMap() {
    // Center on a general coordinate (e.g. India)
    map = L.map('product-map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Hook map click event
    map.on('click', onMapClick);
}

// Map Click Event
async function onMapClick(e) {
    const { lat, lng } = e.latlng;
    await handleLocationSelection(lat, lng);
}

// Geocoding and Reverse Geocoding
async function handleLocationSelection(lat, lng) {
    // Clear existing marker if any
    if (marker) {
        map.removeLayer(marker);
    }

    // Place temporary marker
    marker = L.marker([lat, lng]).addTo(map);

    // Fetch Address using reverseGeocode utility
    document.getElementById('map-selection-badge').innerText = "Resolving address...";
    const address = await reverseGeocode(lat, lng);

    // Show custom confirmation modal
    const modal = document.getElementById('confirm-modal');
    const modalText = document.getElementById('confirm-modal-text');
    modalText.innerHTML = `
    <strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br><br>
    <strong>Resolved Address:</strong><br>${address}
  `;
    modal.style.display = 'flex';

    // Modal Buttons
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    // Remove existing listeners to avoid multi-execution
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.replaceWith(newOkBtn);
    cancelBtn.replaceWith(newCancelBtn);

    newOkBtn.addEventListener('click', () => {
        tempSelectedLocation = {
            latitude: lat,
            longitude: lng,
            address: address
        };

        document.getElementById('map-selection-badge').innerHTML = `📍 Active Area: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        document.getElementById('btn-save-mfg-loc').removeAttribute('disabled');
        checkCenterButtonState();
        modal.style.display = 'none';
        map.setView([lat, lng], 15);
    });

    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('map-selection-badge').innerText = "Selection canceled";
        if (marker) {
            map.removeLayer(marker);
            marker = null;
        }
        tempSelectedLocation = null;
        document.getElementById('btn-save-mfg-loc').setAttribute('disabled', 'true');
        document.getElementById('btn-add-center').setAttribute('disabled', 'true');
    });
}

// Nominatim Geocoding Search
document.getElementById('btn-search').addEventListener('click', async () => {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        showAlert("Please enter a city or location query.", "warning");
        return;
    }

    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = "<div style='padding: 10px; color: var(--color-secondary);'>Searching...</div>";
    resultsDiv.style.display = 'block';

    const results = await searchLocation(query);
    if (results.length === 0) {
        resultsDiv.innerHTML = "<div style='padding: 10px; color: var(--color-secondary);'>No locations found.</div>";
        return;
    }

    resultsDiv.innerHTML = '';
    results.forEach(loc => {
        const item = document.createElement('div');
        item.style.padding = '10px 15px';
        item.style.borderBottom = '1px solid var(--card-border)';
        item.style.cursor = 'pointer';
        item.style.fontSize = '0.9rem';
        item.innerText = loc.name;

        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(255,255,255,0.05)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });

        item.addEventListener('click', () => {
            resultsDiv.style.display = 'none';
            document.getElementById('search-input').value = loc.name;
            map.setView([loc.latitude, loc.longitude], 12);
            handleLocationSelection(loc.latitude, loc.longitude);
        });
        resultsDiv.appendChild(item);
    });
});

// Close search dropdown on click outside
document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const searchBtn = document.getElementById('btn-search');
    if (e.target !== searchInput && e.target !== searchResults && e.target !== searchBtn) {
        searchResults.style.display = 'none';
    }
});

// Set Selected Location as Manufacturer Location
document.getElementById('btn-save-mfg-loc').addEventListener('click', () => {
    if (!tempSelectedLocation) return;

    document.getElementById('mfg-lat').value = tempSelectedLocation.latitude;
    document.getElementById('mfg-lng').value = tempSelectedLocation.longitude;
    document.getElementById('mfg-addr').value = tempSelectedLocation.address;

    showAlert("Manufacturer coordinates and address updated successfully.", "success");
});

// Enable/Disable Center validation check
document.getElementById('center-name').addEventListener('input', checkCenterButtonState);

function checkCenterButtonState() {
    const name = document.getElementById('center-name').value.trim();
    const btn = document.getElementById('btn-add-center');
    if (name && tempSelectedLocation) {
        btn.removeAttribute('disabled');
    } else {
        btn.setAttribute('disabled', 'true');
    }
}

// Add Authorized Center to array and view
document.getElementById('btn-add-center').addEventListener('click', () => {
    const centerName = document.getElementById('center-name').value.trim();
    if (!centerName || !tempSelectedLocation) return;

    // Add to local list
    const newCenter = {
        name: centerName,
        address: tempSelectedLocation.address,
        latitude: tempSelectedLocation.latitude,
        longitude: tempSelectedLocation.longitude
    };

    authorizedCenters.push(newCenter);
    updateCentersListUI();

    // Reset center inputs and map marker
    document.getElementById('center-name').value = '';
    document.getElementById('btn-add-center').setAttribute('disabled', 'true');

    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    tempSelectedLocation = null;
    document.getElementById('map-selection-badge').innerText = "No point selected";
    document.getElementById('btn-save-mfg-loc').setAttribute('disabled', 'true');

    showAlert(`Authorized center "${centerName}" added.`, "success");
});

// Render Authorized Centers array in UI list
function updateCentersListUI() {
    const container = document.getElementById('centers-list');
    if (authorizedCenters.length === 0) {
        container.innerHTML = `
      <div style="text-align: center; color: var(--color-secondary); padding: 1.5rem; border: 1px dashed var(--card-border); border-radius: var(--radius-md); font-size: 0.9rem;">
        No authorized centers added yet. Use the map to select points and register them.
      </div>
    `;
        return;
    }

    container.innerHTML = '';
    authorizedCenters.forEach((center, index) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
      <div class="list-item-content">
        <div class="list-item-title">${center.name}</div>
        <div class="list-item-subtitle">${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)} &bull; ${center.address}</div>
      </div>
      <button type="button" class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="removeCenter(${index})">
        Remove
      </button>
    `;
        container.appendChild(item);
    });
}

// Remove Center from list
window.removeCenter = function (index) {
    const name = authorizedCenters[index].name;
    authorizedCenters.splice(index, 1);
    updateCentersListUI();
    showAlert(`Authorized center "${name}" removed.`, "info");
};

// Toggle Smart Warranty details based on availability select
document.getElementById('warranty-avail').addEventListener('change', (e) => {
    const section = document.getElementById('warranty-details-section');
    if (e.target.value === 'Yes') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
});

// Save Product Submission
document.getElementById('btn-save-product').addEventListener('click', async () => {
    const productId = document.getElementById('prod-id').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const manufacturerName = document.getElementById('mfg-name').value.trim();
    const manufacturerAddress = document.getElementById('mfg-addr').value.trim();
    const mfgLat = parseFloat(document.getElementById('mfg-lat').value);
    const mfgLng = parseFloat(document.getElementById('mfg-lng').value);

    // New Passport metadata
    const brand = document.getElementById('prod-brand').value.trim();
    const category = document.getElementById('prod-category').value.trim();
    const modelNumber = document.getElementById('prod-model').value.trim();
    const batchNumber = document.getElementById('prod-batch').value.trim();
    const expiryDate = document.getElementById('expiry-date').value;
    const productImage = document.getElementById('prod-image').value.trim();

    // New Warranty details
    const warrantyAvailable = document.getElementById('warranty-avail').value;
    const warrantyPeriod = document.getElementById('warranty-period').value;
    const warrantyType = document.getElementById('warranty-type').value.trim();
    const warrantyTerms = document.getElementById('warranty-terms').value.trim();

    // Validation
    if (!productId || !name || !manufacturerName) {
        showAlert("Please specify unique Product ID, Product Name, and Manufacturer Name.", "error");
        return;
    }

    if (isNaN(mfgLat) || isNaN(mfgLng)) {
        showAlert("Please configure and set the Manufacturer Location coordinates.", "error");
        return;
    }

    if (authorizedCenters.length === 0) {
        showAlert("Please configure at least one authorized distribution center.", "error");
        return;
    }

    const payload = {
        productId,
        name,
        manufacturerName,
        manufacturerAddress,
        manufacturerLocation: {
            address: manufacturerAddress,
            latitude: mfgLat,
            longitude: mfgLng
        },
        authorizedCenters,
        // Passport fields
        brand,
        category,
        modelNumber,
        batchNumber,
        expiryDate: expiryDate || null,
        productImage,
        // Warranty fields
        warrantyAvailable,
        warrantyPeriod,
        warrantyType,
        warrantyTerms
    };

    const saveBtn = document.getElementById('btn-save-product');
    saveBtn.setAttribute('disabled', 'true');
    saveBtn.innerText = "Saving product...";

    try {
        const response = await authenticatedFetch('/add-product', {
            method: 'POST',
            body: payload
        });

        const data = await response.json();

        if (data.success) {
            showAlert("Product saved and QR code generated!", "success");

            // Reveal QR Preview Card
            const qrCard = document.getElementById('qr-result-card');
            const qrImg = document.getElementById('qr-code-img');
            const qrUrl = document.getElementById('qr-verify-url');
            const qrDownload = document.getElementById('btn-download-qr');

            qrImg.src = data.data.qrCodePath;

            // Verification absolute URL
            const verifyAbsUrl = `${window.location.protocol}//${window.location.host}/verify.html?productId=${encodeURIComponent(productId)}`;
            qrUrl.innerText = verifyAbsUrl;
            qrDownload.href = data.data.qrCodePath;

            qrCard.style.display = 'block';
            qrCard.scrollIntoView({ behavior: 'smooth' });

            // Reset form variables
            document.getElementById('prod-id').value = '';
            document.getElementById('prod-name').value = '';
            document.getElementById('mfg-name').value = '';
            document.getElementById('mfg-addr').value = '';
            document.getElementById('mfg-lat').value = '';
            document.getElementById('mfg-lng').value = '';
            document.getElementById('prod-brand').value = '';
            document.getElementById('prod-category').value = '';
            document.getElementById('prod-model').value = '';
            document.getElementById('prod-batch').value = '';
            document.getElementById('expiry-date').value = '';
            document.getElementById('prod-image').value = '';
            document.getElementById('warranty-avail').value = 'No';
            document.getElementById('warranty-period').value = '12';
            document.getElementById('warranty-type').value = '';
            document.getElementById('warranty-terms').value = '';
            document.getElementById('warranty-details-section').style.display = 'none';

            authorizedCenters = [];
            updateCentersListUI();

        } else {
            showAlert(data.message || "Failed to register product.", "error");
        }
    } catch (error) {
        console.error("Save product err:", error);
        showAlert("Connection error. Could not reach server.", "error");
    } finally {
        saveBtn.removeAttribute('disabled');
        saveBtn.innerText = "💾 Save Product & Generate QR Code";
    }
});

// Start Map on window load
window.onload = initMap;
