// CryoLedger Frontend Utilities

/**
 * Show a banner-style alert notification inside the element with id 'alert-container'.
 * If 'alert-container' doesn't exist, prepends to body.
 */
function showAlert(message, type = 'info', duration = 6000) {
    let container = document.getElementById('alert-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'alert-container';
        container.style.position = 'fixed';
        container.style.top = '80px';
        container.style.right = '20px';
        container.style.zIndex = '99999';
        container.style.maxWidth = '400px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.margin = '0';
    alertDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

    // Icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    alertDiv.innerHTML = `
    <span style="font-size: 1.2rem;">${icon}</span>
    <div style="flex: 1;">${message}</div>
    <span style="cursor:pointer; font-weight:bold;" onclick="this.parentElement.remove()">&times;</span>
  `;

    container.appendChild(alertDiv);

    if (duration > 0) {
        setTimeout(() => {
            alertDiv.style.opacity = '0';
            alertDiv.style.transform = 'translateY(-10px)';
            alertDiv.style.transition = 'all 0.4s ease';
            setTimeout(() => alertDiv.remove(), 400);
        }, duration);
    }
}

/**
 * Geolocation API wrapper
 */
function getBrowserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser."));
            return;
        }

        // Request fine accuracy
        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                let msg = "Unknown location error.";
                if (error.code === error.PERMISSION_DENIED) {
                    msg = "Location permission denied. Please allow GPS access, or type your address manually.";
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    msg = "GPS location unavailable. Try selecting on map manually.";
                } else if (error.code === error.TIMEOUT) {
                    msg = "Location request timed out. Using manual fallback.";
                }
                reject(new Error(msg));
            },
            options
        );
    });
}

/**
 * Reverse Geocode coordinates using Nominatim API (OpenStreetMap)
 */
async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    try {
        const res = await fetch(url, {
            headers: {
                'Accept-Language': 'en'
            }
        });
        if (!res.ok) throw new Error("Nominatim API error");
        const data = await res.json();
        return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (err) {
        console.error("Reverse geocoding failed:", err);
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

/**
 * Search Location (City/Town/Address) using Nominatim API
 */
async function searchLocation(query) {
    if (!query) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    try {
        const res = await fetch(url, {
            headers: {
                'Accept-Language': 'en'
            }
        });
        if (!res.ok) throw new Error("Nominatim Search API error");
        const data = await res.json();
        return data.map(item => ({
            name: item.display_name,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon)
        }));
    } catch (err) {
        console.error("Geocoding search failed:", err);
        return [];
    }
}

/**
 * Common Navigation Component Creator
 */
function createHeader(activePage = '') {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    let navLinksHTML = '';

    const headerNotificationsListHTML = token ? `
        <li style="position: relative; display: inline-block; margin-left: 0.5rem;">
            <button id="btn-header-notifications" class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.9rem; background: transparent; border: 1px solid var(--card-border); color: var(--color-primary); cursor: pointer; display: flex; align-items: center; gap: 0.3rem; height: 32px;">
                🔔 <span id="header-notifications-badge" style="display: none; background: var(--error); color: white; border-radius: 50%; padding: 0.15rem 0.35rem; font-size: 0.65rem; font-weight: bold; line-height: 1;">0</span>
            </button>
            <div id="header-notifications-dropdown" class="card" style="display: none; position: absolute; right: 0; top: 100%; width: 320px; z-index: 10005; padding: 1rem; margin-top: 0.5rem; text-align: left; max-height: 380px; overflow-y: auto; background-color: #131c31; border: 1px solid var(--card-border); box-shadow: 0 10px 25px rgba(0,0,0,0.6); border-radius: var(--radius-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.5rem;">
                    <strong style="font-size: 0.9rem; color: var(--color-primary);">Notifications</strong>
                    <button id="btn-clear-notifications" style="background:none; border:none; color: var(--accent); cursor: pointer; font-size: 0.75rem; font-weight: bold; padding: 0;">Mark All Read</button>
                </div>
                <div id="header-notifications-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="font-size: 0.8rem; color: var(--color-secondary); text-align: center; padding: 1rem 0;">Loading...</div>
                </div>
            </div>
        </li>
    ` : '';

    if (!token) {
        // Guest mode navigation
        navLinksHTML = `
            <li><a href="login.html" class="${activePage === 'login' ? 'active' : ''}">Customer Portal</a></li>
            <li><a href="admin-login.html" class="${activePage === 'admin-login' ? 'active' : ''}">Admin Portal</a></li>
        `;
    } else if (role === 'admin') {
        // Admin logged in navigation
        navLinksHTML = `
            <li><a href="admin-dashboard.html" class="${activePage === 'home' ? 'active' : ''}">Dashboard</a></li>
            <li><a href="add-product.html" class="${activePage === 'add-product' ? 'active' : ''}">Add Product</a></li>
            <li><a href="admin.html" class="${activePage === 'admin' ? 'active' : ''}">Bypass Console</a></li>
            <li><a href="records.html" class="${activePage === 'records' ? 'active' : ''}">Product Records</a></li>
            <li><a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}">Settings</a></li>
            ${headerNotificationsListHTML}
            <li><button onclick="logout()" class="btn btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.85rem; margin-left: 0.5rem; background-color: transparent; border-color: var(--error); color: var(--error); cursor: pointer;">Log Out</button></li>
        `;
    } else if (role === 'distributor') {
        // Distributor navigation
        navLinksHTML = `
            <li><a href="distributor-dashboard.html" class="${activePage === 'distributor' ? 'active' : ''}">Depot Dashboard</a></li>
            <li><a href="verify.html" class="${activePage === 'verify' ? 'active' : ''}">Verify Product</a></li>
            <li><a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}">Settings</a></li>
            ${headerNotificationsListHTML}
            <li><button onclick="logout()" class="btn btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.85rem; margin-left: 0.5rem; background-color: transparent; border-color: var(--error); color: var(--error); cursor: pointer;">Log Out</button></li>
        `;
    } else if (role === 'retailer') {
        // Retailer navigation
        navLinksHTML = `
            <li><a href="retailer-dashboard.html" class="${activePage === 'retailer' ? 'active' : ''}">Retail Dashboard</a></li>
            <li><a href="verify.html" class="${activePage === 'verify' ? 'active' : ''}">Verify Product</a></li>
            <li><a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}">Settings</a></li>
            ${headerNotificationsListHTML}
            <li><button onclick="logout()" class="btn btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.85rem; margin-left: 0.5rem; background-color: transparent; border-color: var(--error); color: var(--error); cursor: pointer;">Log Out</button></li>
        `;
    } else if (role === 'user') {
        // User logged in navigation
        navLinksHTML = `
            <li><a href="user-dashboard.html" class="${activePage === 'home' ? 'active' : ''}">Dashboard</a></li>
            <li><a href="verify.html" class="${activePage === 'verify' ? 'active' : ''}">Verify Product</a></li>
            <li><a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}">Settings</a></li>
            ${headerNotificationsListHTML}
            <li><button onclick="logout()" class="btn btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.85rem; margin-left: 0.5rem; background-color: transparent; border-color: var(--error); color: var(--error); cursor: pointer;">Log Out</button></li>
        `;
    }

    const headerHTML = `
    <div class="nav-container">
      <a href="index.html" class="logo">
        ❄️ Cryo<span>Ledger</span>
      </a>
      <ul class="nav-links">
        ${navLinksHTML}
      </ul>
    </div>
  `;

    const headerElem = document.createElement('header');
    headerElem.innerHTML = headerHTML;
    document.body.insertBefore(headerElem, document.body.firstChild);

    // Initialize notification features if user is logged in
    if (token) {
        setTimeout(initHeaderNotifications, 50);
    }
}

/**
 * Handle notification setup, polling/fetching, toggles and clear operations.
 */
async function initHeaderNotifications() {
    const btn = document.getElementById('btn-header-notifications');
    const dropdown = document.getElementById('header-notifications-dropdown');
    const list = document.getElementById('header-notifications-list');
    const badge = document.getElementById('header-notifications-badge');
    const clearBtn = document.getElementById('btn-clear-notifications');

    if (!btn || !dropdown || !list || !badge) return;

    let activeNotifications = [];

    async function fetchNotifications() {
        try {
            const res = await authenticatedFetch('/api/notifications');
            const result = await res.json();
            if (result.success) {
                activeNotifications = result.data || [];
                renderNotifications();
            }
        } catch (err) {
            console.error("Notifications fetch failed:", err);
            list.innerHTML = `<div style="font-size: 0.8rem; color: var(--error); text-align: center; padding: 0.5rem 0;">Failed to load</div>`;
        }
    }

    function renderNotifications() {
        const unreadCount = activeNotifications.filter(n => !n.read).length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }

        if (activeNotifications.length === 0) {
            list.innerHTML = `<div style="font-size: 0.8rem; color: var(--color-secondary); text-align: center; padding: 1rem 0;">No notifications found</div>`;
            return;
        }

        list.innerHTML = activeNotifications.map(n => `
            <div style="padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--card-border); background-color: ${n.read ? 'rgba(0,0,0,0.1)' : 'rgba(100,116,139,0.15)'}; font-size: 0.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-weight: bold; color: ${n.read ? 'var(--color-secondary)' : 'var(--color-primary)'};">
                    <span>${n.title}</span>
                    <span style="font-size:0.7rem; color:var(--color-secondary); font-weight:normal;">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style="margin-top: 0.25rem; color: var(--color-secondary); line-height: 1.3;">${n.message}</div>
            </div>
        `).join('');
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const display = dropdown.style.display === 'none' ? 'block' : 'none';
        dropdown.style.display = display;
        if (display === 'block') {
            fetchNotifications();
        }
    });

    clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const unreadIds = activeNotifications.filter(n => !n.read).map(n => n._id);
        if (unreadIds.length === 0) return;

        try {
            await authenticatedFetch('/api/notifications/read', {
                method: 'POST',
                body: { notificationIds: unreadIds }
            });
            activeNotifications.forEach(n => n.read = true);
            renderNotifications();
        } catch (err) {
            console.error("Mark read failed:", err);
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
            dropdown.style.display = 'none';
        }
    });

    // Initial fetch and poll every 30 seconds
    fetchNotifications();
    setInterval(fetchNotifications, 30000);
}

/**
 * Common Footer Component Creator
 */
function createFooter() {
    const footerElem = document.createElement('footer');
    footerElem.innerHTML = `
    <p>&copy; ${new Date().getFullYear()} CryoLedger - Product Authentication & Location Verification System. All rights reserved.</p>
  `;
    document.body.appendChild(footerElem);
}

/**
 * Logout utility
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

/**
 * Authenticated Fetch wrapper.
 * Injects Jwt token into request headers. Auto logouts on 401/403.
 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        logout();
        throw new Error("No authorization token present. Logged out.");
    }

    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;

    // Auto handle json serialization if body is object and not FormData
    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        showAlert("Session expired. Logging out...", "error");
        setTimeout(() => {
            logout();
        }, 1500);
        throw new Error("Session expired.");
    }

    return response;
}

/**
 * Page Access Guard.
 * Checks if user token exists and has the appropriate role.
 */
function checkAccess(requiredRole) {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token) {
        if (requiredRole === 'admin') {
            window.location.href = 'admin-login.html';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    if (requiredRole && role !== requiredRole) {
        if (role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else if (role === 'distributor') {
            window.location.href = 'distributor-dashboard.html';
        } else if (role === 'retailer') {
            window.location.href = 'retailer-dashboard.html';
        } else {
            window.location.href = 'user-dashboard.html';
        }
    }
}

/**
 * PWA Custom Install Button Logic
 */
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67+ from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
});

// Global function so any direct UI button can call this
window.triggerPWAInstall = async function () {
    if (!deferredPrompt) {
        alert("The app is already installed or your browser doesn't support automatic installation. You can install it manually from your browser menu!");
        return;
    }
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
    }
    deferredPrompt = null;
};

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    console.log('PWA was installed');
});
