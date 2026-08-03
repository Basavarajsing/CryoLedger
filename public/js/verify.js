// Verify Product Page Logic
checkAccess('user');

let pickerMap = null;
let pickerMarker = null;

// Initialize Header & Footer
createHeader('verify');
createFooter();

// Bind URL Query Parameters on load
window.onload = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('productId');
    if (productId) {
        document.getElementById('verify-prod-id').value = productId;
        showAlert(`Prefilled Product ID: ${productId} from QR code.`, "info");
    }
};

// Toggle Map Picker
document.getElementById('btn-toggle-map').addEventListener('click', () => {
    const wrapper = document.getElementById('picker-map-wrapper');
    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
        initPickerMap();
    } else {
        wrapper.style.display = 'none';
    }
});

// Geocoding City Search for Verification Map
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
            if (pickerMap) {
                pickerMap.setView([loc.latitude, loc.longitude], 12);
                updateSelectedCoords(loc.latitude, loc.longitude);
            }
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

// Initialize Map Picker
function initPickerMap() {
    if (pickerMap) {
        pickerMap.invalidateSize();
        return;
    }

    // Center on India or default coords
    pickerMap = L.map('picker-map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(pickerMap);

    pickerMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        updateSelectedCoords(lat, lng);
    });
}

async function updateSelectedCoords(lat, lng) {
    if (pickerMarker) {
        pickerMap.removeLayer(pickerMarker);
    }
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
    pickerMap.setView([lat, lng], 14);

    // Update readonly fields
    document.getElementById('verify-lat').value = lat.toFixed(6);
    document.getElementById('verify-lng').value = lng.toFixed(6);

    // Resolve address
    document.getElementById('verify-addr').placeholder = "Resolving Address info...";
    const address = await reverseGeocode(lat, lng);
    document.getElementById('verify-addr').value = address;
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

        document.getElementById('verify-addr').placeholder = "Resolving Address info...";
        const address = await reverseGeocode(lat, lng);
        document.getElementById('verify-addr').value = address;

        showAlert("Current GPS coordinates resolved successfully.", "success");

        // If map picker is shown, move it to coordinates
        if (pickerMap) {
            if (pickerMarker) {
                pickerMap.removeLayer(pickerMarker);
            }
            pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
            pickerMap.setView([lat, lng], 15);
        }
    } catch (err) {
        console.error("GPS Fetch err:", err);
        showAlert(err.message || "Failed to fetch GPS coordinates. Please select manually.", "error");
    } finally {
        btn.removeAttribute('disabled');
        btn.innerText = "📡 Use Current GPS Location";
    }
});

// Verify Product Call
document.getElementById('btn-verify-product').addEventListener('click', async () => {
    const productId = document.getElementById('verify-prod-id').value.trim();
    const latVal = parseFloat(document.getElementById('verify-lat').value);
    const lngVal = parseFloat(document.getElementById('verify-lng').value);
    const addrVal = document.getElementById('verify-addr').value.trim();

    // Reset display cards
    hideAllDetailsPanels();

    if (!productId) {
        showAlert("Please specify a Product ID.", "error");
        return;
    }

    if (isNaN(latVal) || isNaN(lngVal)) {
        showAlert("Coordinates (lat, lng) are required. Please use GPS or click the map.", "error");
        return;
    }

    const verifyBtn = document.getElementById('btn-verify-product');
    verifyBtn.setAttribute('disabled', 'true');
    verifyBtn.innerText = "Verifying product...";

    try {
        // Call verification GET API
        const url = `/verify/${encodeURIComponent(productId)}?lat=${latVal}&lng=${lngVal}&locationText=${encodeURIComponent(addrVal || 'Coordinates: ' + latVal + ',' + lngVal)}`;
        const res = await authenticatedFetch(url);

        if (res.status === 403) {
            const errResult = await res.json();
            showAlert(errResult.message, "error");
            // Hide details panels
            document.getElementById('panel-unauthorized').style.display = 'none';
            document.getElementById('panel-authorized').style.display = 'none';
            document.getElementById('panel-dossier').style.display = 'none';
            document.getElementById('panel-recalled').style.display = 'none';
            return;
        }

        const result = await res.json();

        if (res.status === 404) {
            showAlert("You can't access this: Product not found.", "error");
            return;
        }

        if (result.locationStatus === "PRODUCT RECALLED") {
            showAlert(result.message, "error");
            showRecallWarning(result.data || result.recallDetails);
        } else if (result.locationStatus === "Authorized Centre Verified" || result.locationStatus === "Authorized Center Verified") {
            showAlert(result.message, "success");
            showProductDetailsData(result.passport, "authorized", result.matchedCenter);
            showUnifiedDossier(result.passport, result.warranty, result.healthReport, result.supplyChain);
        } else if (result.locationStatus === "Admin Approved") {
            showAlert(result.message, "success");
            showProductDetailsData(result.passport, "approved");
            showUnifiedDossier(result.passport, result.warranty, result.healthReport, result.supplyChain);
        } else if (result.locationStatus === "Admin Approval Pending") {
            showAlert(result.message, "warning");
            showProtectedStatus("pending");
        } else if (result.locationStatus === "Request Rejected") {
            showAlert(result.message, "error");
            showProtectedStatus("rejected");
        } else if (result.locationStatus === "Unauthorized Location") {
            showAlert(result.message, "warning");
            showProtectedStatus("unauthorized");
        } else {
            showAlert(result.message || "Coordinates verification failed.", "error");
        }

    } catch (error) {
        console.error("Verification error:", error);
        showAlert("Network / Server connection error.", "error");
    } finally {
        verifyBtn.removeAttribute('disabled');
        verifyBtn.innerText = "🔐 Authenticate Product & Coordinates";
    }
});

// Access Bypass Request Click
document.getElementById('btn-request-access').addEventListener('click', async () => {
    const productId = document.getElementById('verify-prod-id').value.trim();
    const latVal = parseFloat(document.getElementById('verify-lat').value);
    const lngVal = parseFloat(document.getElementById('verify-lng').value);
    const addrVal = document.getElementById('verify-addr').value.trim() || `Location Coordinates: ${latVal}, ${lngVal}`;

    if (!productId || isNaN(latVal) || isNaN(lngVal)) {
        showAlert("Invalid state. Reload page and verify coordinates are populated.", "error");
        return;
    }

    const reqBtn = document.getElementById('btn-request-access');
    reqBtn.setAttribute('disabled', 'true');
    reqBtn.innerText = "Submitting request...";

    try {
        const payload = {
            productId,
            requestedLocation: addrVal,
            latitude: latVal,
            longitude: lngVal
        };

        const res = await authenticatedFetch('/request-access', {
            method: 'POST',
            body: payload
        });

        const result = await res.json();
        if (result.success) {
            showAlert(result.message, "success");

            // Update UI panels to Pending Bypass
            document.getElementById('request-approval-form').style.display = 'none';
            document.getElementById('panel-pending-status').style.display = 'block';
        } else {
            showAlert(result.message || "Failed to request permission.", "error");
        }
    } catch (error) {
        console.error("Submission request error:", error);
        showAlert("Server connection failed.", "error");
    } finally {
        reqBtn.removeAttribute('disabled');
        reqBtn.innerText = "🛡️ Request Administrative Bypass Approval";
    }
});

// Render UI functions 
function hideAllDetailsPanels() {
    document.getElementById('panel-unauthorized').style.display = 'none';
    document.getElementById('panel-authorized').style.display = 'none';
    document.getElementById('panel-recalled').style.display = 'none';
    document.getElementById('panel-dossier').style.display = 'none';
}

function showProtectedStatus(status) {
    document.getElementById('panel-unauthorized').style.display = 'block';

    const mfgForm = document.getElementById('request-approval-form');
    const pendingDiv = document.getElementById('panel-pending-status');
    const rejectedDiv = document.getElementById('panel-rejected-status');

    mfgForm.style.display = 'none';
    pendingDiv.style.display = 'none';
    rejectedDiv.style.display = 'none';

    if (status === 'unauthorized') {
        mfgForm.style.display = 'block';
    } else if (status === 'pending') {
        pendingDiv.style.display = 'block';
    } else if (status === 'rejected') {
        rejectedDiv.style.display = 'block';
        mfgForm.style.display = 'block'; // Allow resubmission
    }
}

function showRecallWarning(data) {
    document.getElementById('panel-recalled').style.display = 'block';

    // Support either root details or nested recallInfo
    const info = data.recallInfo || data;

    document.getElementById('recall-reason-text').innerText = info.reason || data.recallReason || "Safety Advisory";
    document.getElementById('recall-severity-text').innerText = info.severity || data.recallSeverity || "Medium";
    document.getElementById('recall-refund-text').innerText = (info.refundAvailable || data.recallRefundAvailable) ? "Yes" : "No";
    document.getElementById('recall-centre-text').innerText = info.nearestCentre || data.recallNearestCentre || "Authorized Manufacturer Service Hub";
    document.getElementById('recall-instructions-text').innerText = info.instructions || data.recallInstructions || "Immediately power off the product and return to dispatch depot.";

    // Scroll recall warning into center focus
    document.getElementById('panel-recalled').scrollIntoView({ behavior: 'smooth' });
}

function showProductDetailsData(product, mode, matchedCenter = "") {
    document.getElementById('panel-authorized').style.display = 'block';

    // Set text
    document.getElementById('detail-id').innerText = product.productId;
    document.getElementById('detail-name').innerText = product.name;
    document.getElementById('detail-mfg').innerText = product.manufacturerName;
    document.getElementById('detail-mfg-addr').innerText = (product.manufacturerLocation && product.manufacturerLocation.address) ? product.manufacturerLocation.address : (product.manufacturerAddress || "Corporate HQ");
    document.getElementById('detail-scans').innerText = product.scanCount || 1;

    const authBadge = document.getElementById('badge-auth-status');
    const matchedCenterDiv = document.getElementById('panel-matched-center');
    const matchedBypassDiv = document.getElementById('panel-matched-bypass');

    matchedCenterDiv.style.display = 'none';
    matchedBypassDiv.style.display = 'none';

    if (mode === 'authorized') {
        authBadge.className = "badge badge-authorized";
        authBadge.innerText = "Verified Center Access";

        matchedCenterDiv.style.display = 'block';
        document.getElementById('detail-matched-center-name').innerText = matchedCenter || "Authorized Location";
    } else {
        authBadge.className = "badge badge-approved";
        authBadge.innerText = "Admin Approved Bypass";
        matchedBypassDiv.style.display = 'block';
    }

    // Populate Centers list
    const centersContainer = document.getElementById('detail-centers');
    centersContainer.innerHTML = '';
    const centers = product.authorizedCenters || [];
    centers.forEach(center => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
      <div class="list-item-content">
        <div class="list-item-title">${center.name}</div>
        <div class="list-item-subtitle">${center.address}</div>
      </div>
    `;
        centersContainer.appendChild(item);
    });
}

function showUnifiedDossier(passport, warranty, healthReport, supplyChain) {
    const dossierPanel = document.getElementById('panel-dossier');
    dossierPanel.style.display = 'block';

    // Store verified product ID
    window.currentVerifiedProductId = passport.productId;

    // Reset feedback card
    const feedbackCard = document.getElementById('feedback-widget-card');
    if (feedbackCard) {
        feedbackCard.style.display = 'block';
        resetFeedbackStars();
    }

    // Passport
    document.getElementById('dossier-brand').innerText = passport.brand || "N/A";
    document.getElementById('dossier-category').innerText = passport.category || "N/A";
    document.getElementById('dossier-model').innerText = passport.modelNumber || "N/A";
    document.getElementById('dossier-batch').innerText = passport.batchNumber || passport.productId;
    document.getElementById('dossier-expiry').innerText = passport.expiryDate ? new Date(passport.expiryDate).toLocaleDateString() : "No Expiration Date";

    const imgBox = document.getElementById('dossier-image-box');
    const imgEl = document.getElementById('dossier-product-img');
    if (passport.productImage) {
        imgEl.src = passport.productImage;
        imgBox.style.display = 'block';
    } else {
        imgBox.style.display = 'none';
    }

    // Warranty
    const badgeBox = document.getElementById('dossier-warranty-badge-box');

    if (warranty && (warranty.warrantyAvailable === 'Yes' || warranty.warrantyAvailable === true)) {
        let style = 'background-color: #f1c40f; color: #111;'; // Inactive
        if (warranty.warrantyStatus === 'Active') style = 'background-color: var(--accent); color: var(--bg-primary);';
        if (warranty.warrantyStatus === 'Expired') style = 'background-color: var(--error); color: white;';

        badgeBox.innerHTML = `<span class="badge" style="${style}">${warranty.warrantyStatus.toUpperCase()} WARRANTY</span>`;

        document.getElementById('dossier-warranty-type').innerText = warranty.warrantyType || "Standard Manufacturer";
        document.getElementById('dossier-warranty-period').innerText = warranty.warrantyPeriod ? `${warranty.warrantyPeriod} Months` : "N/A";
        document.getElementById('dossier-warranty-start').innerText = warranty.warrantyStartDate ? new Date(warranty.warrantyStartDate).toLocaleDateString() : "Activated On Verification Scan Now";
        document.getElementById('dossier-warranty-end').innerText = warranty.warrantyEndDate ? new Date(warranty.warrantyEndDate).toLocaleDateString() : "Activated On Verification Scan Now";
        document.getElementById('dossier-warranty-days').innerText = warranty.remainingDays ? `${warranty.remainingDays} Days Left` : "N/A";
        document.getElementById('dossier-warranty-terms').innerText = warranty.warrantyTerms || "Subject to manufacturer terms and conditions.";
    } else {
        badgeBox.innerHTML = '<span class="badge" style="background-color: var(--bg-tertiary); color: var(--color-secondary);">NO WARRANTY STRUCTURE SET</span>';
        document.getElementById('dossier-warranty-type').innerText = "N/A";
        document.getElementById('dossier-warranty-period').innerText = "N/A";
        document.getElementById('dossier-warranty-start').innerText = "N/A";
        document.getElementById('dossier-warranty-end').innerText = "N/A";
        document.getElementById('dossier-warranty-days').innerText = "N/A";
        document.getElementById('dossier-warranty-terms').innerText = "Warranty is not supported for this product series.";
    }

    // Health Report
    if (healthReport) {
        const hsEl = document.getElementById('dossier-health-score');
        hsEl.innerText = healthReport.overallHealth || "Healthy";

        // Color coding
        if (healthReport.overallHealth === 'Healthy' || healthReport.overallHealth === 'Optimal') {
            hsEl.style.color = 'var(--accent)';
        } else if (healthReport.overallHealth === 'Suspicious' || healthReport.overallHealth === 'Warning Alert' || healthReport.overallHealth === 'Fair / Notice') {
            hsEl.style.color = '#f1c40f';
        } else {
            hsEl.style.color = 'var(--error)';
        }

        document.getElementById('dossier-trust-level').innerText = healthReport.trustLevel || "High";
        document.getElementById('dossier-risk-level').innerText = healthReport.riskLevel || "Low";
        document.getElementById('dossier-attempts').innerText = `Success: ${healthReport.totalSuccessfulVerifications || 0}, Fail: ${healthReport.unauthorizedAttempts || 0}`;
        document.getElementById('dossier-recommendation').innerText = healthReport.recommendation || "-";
    }

    // Supply Chain Timeline
    const timelineBox = document.getElementById('dossier-journey-timeline');
    timelineBox.innerHTML = '';

    if (supplyChain && supplyChain.timeline && supplyChain.timeline.length > 0) {
        supplyChain.timeline.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.style.borderLeft = "2px solid var(--card-border)";
            stepDiv.style.paddingLeft = "1rem";
            stepDiv.style.position = "relative";
            stepDiv.style.marginBottom = "0.5rem";

            let color = 'var(--color-secondary)';
            if (step.status === 'Received' || step.status === 'Done' || step.status === 'Verified') {
                color = 'var(--accent)';
            } else if (step.status === 'Pending' || step.status === 'Pending Verification' || step.status === 'Dispatched') {
                color = '#f1c40f';
            }

            const dot = `<div style="position:absolute; left:-6px; top:4px; width:10px; height:10px; border-radius:50%; background-color:${color};"></div>`;

            const dateStr = step.date ? new Date(step.date).toLocaleString() : 'N/A';
            stepDiv.innerHTML = `
                ${dot}
                <div style="font-size: 0.85rem; font-weight:600; color:var(--color-primary);">${step.stage} &bull; ${step.name}</div>
                <div style="font-size:0.75rem; color:var(--color-secondary);">${dateStr}</div>
                <span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; display: inline-block; margin-top:0.15rem; background-color:${color}; color:#111;">${step.status || 'Pending'}</span>
            `;
            timelineBox.appendChild(stepDiv);
        });

        // Highlight Stepper Bulbs
        const distStep = supplyChain.timeline.find(t => t.stage === 'Distributor');
        const retStep = supplyChain.timeline.find(t => t.stage === 'Retailer');
        const distStatus = distStep ? distStep.status : 'Pending';
        const retStatus = retStep ? retStep.status : 'Pending';
        const hasCustomerScan = supplyChain.timeline.some(t => t.stage === 'Customer' && t.status === 'Verified');

        let activeStep = 1;
        if (hasCustomerScan) {
            activeStep = 5;
        } else if (retStatus === 'Dispatched') {
            activeStep = 4;
        } else if (retStatus === 'Received' || distStatus === 'Dispatched') {
            activeStep = 3;
        } else if (distStatus === 'Received') {
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
                    bulb.style.background = 'var(--bg-tertiary)';
                    bulb.style.borderColor = 'var(--card-border)';
                    bulb.style.color = 'var(--color-secondary)';
                    if (label) label.style.color = 'var(--color-secondary)';
                }
            }
        });
    } else {
        timelineBox.innerHTML = '<div style="font-size:0.85rem; color:var(--color-secondary);">No supply chain timeline details generated.</div>';
    }
}

// FEEDBACK RATING WORKFLOW
let selectedRating = 0;

function resetFeedbackStars() {
    selectedRating = 0;
    const stars = document.querySelectorAll('#dossier-star-rating .star');
    stars.forEach(star => {
        star.style.color = 'var(--color-secondary)';
    });
    const subBtn = document.getElementById('btn-submit-feedback');
    if (subBtn) {
        subBtn.removeAttribute('disabled');
        subBtn.innerText = "Submit Feedback";
    }
    const resultMsg = document.getElementById('feedback-result-msg');
    if (resultMsg) {
        resultMsg.style.display = 'none';
        resultMsg.innerText = '';
    }
}

function setupFeedbackStarListeners() {
    const starContainer = document.getElementById('dossier-star-rating');
    if (!starContainer) return;

    // Prevent duplicate binding
    if (window.starListenersBound) return;
    window.starListenersBound = true;

    const stars = starContainer.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('mouseenter', () => {
            const val = parseInt(star.getAttribute('data-value'), 10);
            highlightStars(val);
        });

        star.addEventListener('mouseleave', () => {
            highlightStars(selectedRating);
        });

        star.addEventListener('click', () => {
            selectedRating = parseInt(star.getAttribute('data-value'), 10);
            highlightStars(selectedRating);
        });
    });

    const subBtn = document.getElementById('btn-submit-feedback');
    if (subBtn) {
        subBtn.addEventListener('click', async () => {
            if (!window.currentVerifiedProductId) {
                showAlert("No verified product selected.", "error");
                return;
            }
            if (selectedRating === 0) {
                showAlert("Please select a star rating first.", "warning");
                return;
            }

            subBtn.setAttribute('disabled', 'true');
            subBtn.innerText = "Submitting...";

            try {
                const res = await fetch('/api/product/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        productId: window.currentVerifiedProductId,
                        rating: selectedRating
                    })
                });
                const result = await res.json();

                if (result.success) {
                    const resultMsg = document.getElementById('feedback-result-msg');
                    if (resultMsg) {
                        resultMsg.innerText = result.message || "Feedback submitted!";
                        resultMsg.style.display = 'block';
                    }
                    showAlert("Feedback submitted successfully!", "success");

                    // Dynamically update the overallHealth status display instantly!
                    const hsEl = document.getElementById('dossier-health-score');
                    if (hsEl) {
                        hsEl.innerText = result.overallHealth;
                        if (result.overallHealth === 'Optimal' || result.overallHealth === 'Healthy') {
                            hsEl.style.color = 'var(--accent)';
                        } else if (result.overallHealth === 'Fair / Notice') {
                            hsEl.style.color = '#f1c40f';
                        } else {
                            hsEl.style.color = 'var(--error)';
                        }
                    }
                    subBtn.innerText = "Feedback Contributed";
                } else {
                    showAlert(result.message || "Submission failed.", "error");
                    subBtn.removeAttribute('disabled');
                    subBtn.innerText = "Submit Feedback";
                }
            } catch (err) {
                console.error(err);
                showAlert("Network connection error.", "error");
                subBtn.removeAttribute('disabled');
                subBtn.innerText = "Submit Feedback";
            }
        });
    }
}

function highlightStars(count) {
    const stars = document.querySelectorAll('#dossier-star-rating .star');
    stars.forEach(star => {
        const val = parseInt(star.getAttribute('data-value'), 10);
        if (val <= count) {
            star.style.color = '#f1c40f';
        } else {
            star.style.color = 'var(--color-secondary)';
        }
    });
}

// Return Recall Submit Trigger
const btnRecallReturn = document.getElementById('btn-submit-recall-return');
if (btnRecallReturn) {
    btnRecallReturn.addEventListener('click', async () => {
        const productId = document.getElementById('verify-prod-id').value.trim();
        const password = document.getElementById('recall-return-password').value.trim();

        if (!password) {
            showAlert("Please enter your password to authorize return.", "warning");
            return;
        }

        btnRecallReturn.setAttribute('disabled', 'true');
        btnRecallReturn.innerText = "Authorizing...";

        try {
            const res = await authenticatedFetch('/api/product/return-recall', {
                method: 'POST',
                body: { productId, password }
            });
            const result = await res.json();

            if (res.ok && result.success) {
                showAlert("Surrender of custody logged successfully.", "success");
                document.getElementById('recall-return-form').style.display = 'none';

                // Refresh authentication view
                document.getElementById('btn-verify-product').click();
            } else {
                showAlert(result.message || "Failed to return product.", "error");
            }
        } catch (err) {
            console.error(err);
            showAlert("Network connection error.", "error");
        } finally {
            btnRecallReturn.removeAttribute('disabled');
            btnRecallReturn.innerText = "Confirm Return";
        }
    });
}

// Bind immediately and retry
setupFeedbackStarListeners();

