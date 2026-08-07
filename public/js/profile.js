// Ensure user is logged in
checkAccess();

// Generate global headers and footers
createHeader('');
createFooter();

// DOM elements
const usernameInput = document.getElementById('profile-username');
const roleInput = document.getElementById('profile-role');
const emailInput = document.getElementById('profile-email');
const photoPreview = document.getElementById('profile-photo-preview');

const infoForm = document.getElementById('profile-info-form');
const passwordForm = document.getElementById('profile-password-form');

// Fetch user profile on load
async function loadProfile() {
    try {
        const res = await authenticatedFetch('/api/user/profile');
        const result = await res.json();

        if (result.success && result.data) {
            usernameInput.value = result.data.username;
            roleInput.value = result.data.role;
            emailInput.value = result.data.email;
            base64PhotoStr = result.data.profilePhoto || '';
            if (base64PhotoStr) photoPreview.src = base64PhotoStr;
        } else {
            showAlert("Failed to load user profile details.", "error");
        }
    } catch (error) {
        console.error("Profile load error:", error);
        showAlert("Error loading user profile details.", "error");
    }
}

// Handling info update (email)
infoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const profilePhoto = base64PhotoStr;

    try {
        const res = await authenticatedFetch('/api/user/profile', {
            method: 'POST',
            body: { email, profilePhoto }
        });

        const result = await res.json();
        if (result.success) {
            showAlert("Profile details updated successfully.", "success");
            if (profilePhoto) photoPreview.src = profilePhoto;
        } else {
            showAlert(result.message || "Failed to update email.", "error");
        }
    } catch (error) {
        console.error("Info save error:", error);
        showAlert("Connection error while updating email.", "error");
    }
});

// Handling password change
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showAlert("New password and confirmation retype do not match.", "warning");
        return;
    }

    try {
        const res = await authenticatedFetch('/api/user/profile', {
            method: 'POST',
            body: {
                currentPassword,
                newPassword,
                confirmPassword
            }
        });

        const result = await res.json();
        if (result.success) {
            showAlert("Password updated successfully.", "success");
            passwordForm.reset();
        } else {
            showAlert(result.message || "Failed to update password.", "error");
        }
    } catch (error) {
        console.error("Password update error:", error);
        showAlert("Connection error while updating password.", "error");
    }
});

// Initial load
loadProfile();


// Profile Photo Upload Logic (Professional Base64 Canvas Resize)
const avatarContainer = document.getElementById('avatar-upload-container');
const avatarOverlay = document.getElementById('avatar-overlay');
const avatarFile = document.getElementById('profile-photo-file');
let base64PhotoStr = '';

if(avatarContainer && avatarOverlay && avatarFile) {
    avatarContainer.addEventListener('mouseenter', () => avatarOverlay.style.opacity = '1');
    avatarContainer.addEventListener('mouseleave', () => avatarOverlay.style.opacity = '0');
    avatarContainer.addEventListener('click', () => avatarFile.click());

    avatarFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showAlert('Please select an image smaller than 2MB.', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 300;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                } else {
                    if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                base64PhotoStr = canvas.toDataURL('image/jpeg', 0.8);
                photoPreview.src = base64PhotoStr;
                showAlert('Photo staged! Click Save Profile Details to finalize.', 'info');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

