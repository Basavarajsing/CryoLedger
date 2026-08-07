// Ensure user is logged in
checkAccess();

// Generate global headers and footers
createHeader('');
createFooter();

// DOM elements
const usernameInput = document.getElementById('profile-username');
const roleInput = document.getElementById('profile-role');
const emailInput = document.getElementById('profile-email');
const photoInput = document.getElementById('profile-photo');
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
            photoInput.value = result.data.profilePhoto || '';
            if (photoInput.value) photoPreview.src = photoInput.value;
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
    const profilePhoto = photoInput.value.trim();

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

