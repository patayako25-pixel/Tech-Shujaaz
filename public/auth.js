"use strict";
function dashboardUrlForRole(role) {
    if (role === 'mentor')
        return 'dashboard-mentor.html';
    if (role === 'therapist')
        return 'dashboard-therapist.html';
    return 'dashboard-user.html';
}
function postAuthUrl(user) {
    if (!user.role)
        return 'choose-profile.html';
    return dashboardUrlForRole(user.role);
}
function displayNameFor(user) {
    return user.displayName && user.displayName.trim().length > 0 ? user.displayName : user.username;
}
async function fetchCurrentUser() {
    const response = await fetch('/api/me', { credentials: 'include' });
    const data = (await response.json());
    return data.user;
}
function updateSigninLinks(user) {
    const links = document.querySelectorAll('.nav-signin');
    links.forEach((link) => {
        if (user) {
            link.textContent = displayNameFor(user);
            link.href = postAuthUrl(user);
        }
    });
}
function redirectIfSignedIn(user) {
    if (user && window.location.pathname.endsWith('signin.html')) {
        window.location.href = postAuthUrl(user);
    }
}
function enforceDashboardAccess(user) {
    const requiredRole = document.body.dataset.requiredRole;
    const requiresAdmin = document.body.dataset.requiresAdmin === 'true';
    if (!requiredRole && !requiresAdmin)
        return true;
    if (!user) {
        window.location.href = 'signin.html';
        return false;
    }
    if (!user.role) {
        window.location.href = 'choose-profile.html';
        return false;
    }
    if (requiresAdmin && !user.isAdmin) {
        window.location.href = postAuthUrl(user);
        return false;
    }
    if (requiredRole && user.role !== requiredRole) {
        window.location.href = postAuthUrl(user);
        return false;
    }
    return true;
}
function enforceProfileAccess(user) {
    const requiresLogin = document.body.dataset.requiresLogin === 'true';
    if (!requiresLogin)
        return true;
    if (!user) {
        window.location.href = 'signin.html';
        return false;
    }
    return true;
}
function enforceChooseProfileAccess(user) {
    const requiresChoice = document.body.dataset.chooseProfile === 'true';
    if (!requiresChoice)
        return true;
    if (!user) {
        window.location.href = 'signin.html';
        return false;
    }
    if (user.role) {
        window.location.href = postAuthUrl(user);
        return false;
    }
    return true;
}
function renderDashboardUser(user) {
    if (!user)
        return;
    const nameEls = document.querySelectorAll('.user-name-slot');
    nameEls.forEach((el) => {
        el.textContent = displayNameFor(user);
    });
    const pendingBanner = document.getElementById('pending-banner');
    const verifiedBadge = document.getElementById('verified-badge');
    if (pendingBanner) {
        pendingBanner.style.display = user.status === 'pending' ? 'flex' : 'none';
    }
    if (verifiedBadge) {
        verifiedBadge.style.display = user.verified ? 'inline-flex' : 'none';
    }
}
function showFormMessage(el, message, isError) {
    if (!el)
        return;
    el.textContent = message;
    el.classList.remove('form-error', 'form-success-text');
    el.classList.add(isError ? 'form-error' : 'form-success-text');
    el.classList.add('visible-msg');
}
function setupAuthTabs() {
    const tabButtons = document.querySelectorAll('.auth-tab');
    const panels = document.querySelectorAll('.auth-panel');
    if (tabButtons.length === 0)
        return;
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            tabButtons.forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            panels.forEach((panel) => {
                panel.classList.toggle('active', panel.id === target);
            });
        });
    });
}
async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = (await response.json());
    return data;
}
function setupSigninForm() {
    const form = document.getElementById('signin-form');
    if (!form)
        return;
    const messageEl = document.getElementById('signin-message');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const usernameInput = document.getElementById('signin-username');
        const passwordInput = document.getElementById('signin-password');
        const result = await postJson('/api/login', {
            username: usernameInput.value,
            password: passwordInput.value,
        });
        showFormMessage(messageEl, result.message, !result.success);
        if (result.success && result.redirect) {
            const redirectTo = result.redirect;
            window.setTimeout(() => {
                window.location.href = redirectTo;
            }, 500);
        }
    });
}
function setupRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form)
        return;
    const messageEl = document.getElementById('register-message');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const usernameInput = document.getElementById('register-username');
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-confirm');
        if (passwordInput.value !== confirmInput.value) {
            showFormMessage(messageEl, 'Passwords do not match.', true);
            return;
        }
        const result = await postJson('/api/register', {
            username: usernameInput.value,
            password: passwordInput.value,
        });
        showFormMessage(messageEl, result.message, !result.success);
        if (result.success && result.redirect) {
            const redirectTo = result.redirect;
            window.setTimeout(() => {
                window.location.href = redirectTo;
            }, 700);
        }
    });
}
function setupSelectRoleForm() {
    const form = document.getElementById('role-select-form');
    if (!form)
        return;
    const messageEl = document.getElementById('role-select-message');
    const therapistFields = document.getElementById('therapist-fields');
    const roleInputs = form.querySelectorAll('input[name="role"]');
    function syncTherapistFields() {
        if (!therapistFields)
            return;
        const selected = form.querySelector('input[name="role"]:checked');
        therapistFields.style.display = selected && selected.value === 'therapist' ? 'block' : 'none';
    }
    roleInputs.forEach((input) => input.addEventListener('change', syncTherapistFields));
    syncTherapistFields();
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const roleInput = form.querySelector('input[name="role"]:checked');
        if (!roleInput) {
            showFormMessage(messageEl, 'Please choose a profile type.', true);
            return;
        }
        const role = roleInput.value;
        const payload = { role };
        if (role === 'therapist') {
            const emailInput = document.getElementById('therapist-email');
            const phoneInput = document.getElementById('therapist-phone');
            const credentialsInput = document.getElementById('therapist-credentials');
            payload.email = emailInput ? emailInput.value : '';
            payload.phone = phoneInput ? phoneInput.value : '';
            payload.credentials = credentialsInput ? credentialsInput.value : '';
        }
        const result = await postJson('/api/select-role', payload);
        showFormMessage(messageEl, result.message, !result.success);
        if (result.success && result.redirect) {
            const redirectTo = result.redirect;
            window.setTimeout(() => {
                window.location.href = redirectTo;
            }, 600);
        }
    });
}
function setupLogoutButtons() {
    const buttons = document.querySelectorAll('.logout-btn');
    buttons.forEach((button) => {
        button.addEventListener('click', async () => {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            window.location.href = 'index.html';
        });
    });
}
let pendingAvatarDataUrl = null;
function setAvatarPreview(url, fallbackInitial) {
    const preview = document.getElementById('avatar-preview');
    if (!preview)
        return;
    if (url) {
        preview.innerHTML = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Profile photo';
        preview.appendChild(img);
    }
    else {
        preview.textContent = fallbackInitial;
    }
}
function renderProfilePage(user) {
    var _a, _b;
    const form = document.getElementById('profile-form');
    if (!form || !user)
        return;
    const nameInput = document.getElementById('profile-display-name');
    const bioInput = document.getElementById('profile-bio');
    nameInput.value = (_a = user.displayName) !== null && _a !== void 0 ? _a : '';
    bioInput.value = (_b = user.bio) !== null && _b !== void 0 ? _b : '';
    setAvatarPreview(user.avatarUrl, displayNameFor(user).charAt(0).toUpperCase() || 'U');
    const verifiedBadge = document.getElementById('verified-badge');
    if (verifiedBadge) {
        verifiedBadge.style.display = user.role === 'therapist' && user.verified ? 'inline-flex' : 'none';
    }
    const backLink = document.getElementById('back-to-dashboard');
    if (backLink) {
        backLink.href = postAuthUrl(user);
    }
}
function setupAvatarUpload() {
    const input = document.getElementById('avatar-input');
    if (!input)
        return;
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            pendingAvatarDataUrl = reader.result;
            setAvatarPreview(pendingAvatarDataUrl, 'U');
        };
        reader.readAsDataURL(file);
    });
}
function setupProfileForm(user) {
    const form = document.getElementById('profile-form');
    if (!form)
        return;
    const messageEl = document.getElementById('profile-message');
    form.addEventListener('submit', async (event) => {
        var _a;
        event.preventDefault();
        const nameInput = document.getElementById('profile-display-name');
        const bioInput = document.getElementById('profile-bio');
        const result = await postJson('/api/update-profile', {
            displayName: nameInput.value,
            bio: bioInput.value,
            avatarUrl: (_a = pendingAvatarDataUrl !== null && pendingAvatarDataUrl !== void 0 ? pendingAvatarDataUrl : user === null || user === void 0 ? void 0 : user.avatarUrl) !== null && _a !== void 0 ? _a : null,
        });
        showFormMessage(messageEl, result.message, !result.success);
    });
}
async function setupAdminPanel() {
    const pendingList = document.getElementById('pending-therapists');
    const activeList = document.getElementById('active-therapists');
    if (!pendingList && !activeList)
        return;
    const response = await fetch('/api/admin/therapists', { credentials: 'include' });
    if (!response.ok)
        return;
    const data = (await response.json());
    if (pendingList) {
        pendingList.innerHTML = '';
        if (data.pending.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No pending therapist applications.';
            empty.className = 'admin-empty';
            pendingList.appendChild(empty);
        }
        data.pending.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'admin-row admin-row-detailed';
            const info = document.createElement('div');
            info.className = 'admin-row-info';
            const name = document.createElement('strong');
            name.textContent = entry.display_name || entry.username;
            info.appendChild(name);
            const details = document.createElement('div');
            details.className = 'admin-row-details';
            details.textContent =
                (entry.email || 'No email provided') +
                    (entry.phone ? ' · ' + entry.phone : '');
            info.appendChild(details);
            if (entry.credentials) {
                const credentialsEl = document.createElement('p');
                credentialsEl.className = 'admin-row-credentials';
                credentialsEl.textContent = entry.credentials;
                info.appendChild(credentialsEl);
            }
            const approveBtn = document.createElement('button');
            approveBtn.type = 'button';
            approveBtn.textContent = 'Approve';
            approveBtn.className = 'btn btn-primary admin-approve-btn';
            approveBtn.addEventListener('click', async () => {
                await fetch('/api/admin/approve/' + encodeURIComponent(entry.username), {
                    method: 'POST',
                    credentials: 'include',
                });
                setupAdminPanel();
            });
            row.appendChild(info);
            row.appendChild(approveBtn);
            pendingList.appendChild(row);
        });
    }
    if (activeList) {
        activeList.innerHTML = '';
        if (data.active.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No verified therapists yet.';
            empty.className = 'admin-empty';
            activeList.appendChild(empty);
        }
        data.active.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'admin-row';
            row.textContent = entry.username + ' — Verified';
            activeList.appendChild(row);
        });
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const user = await fetchCurrentUser();
    updateSigninLinks(user);
    redirectIfSignedIn(user);
    const dashboardAllowed = enforceDashboardAccess(user);
    enforceChooseProfileAccess(user);
    const profileAllowed = enforceProfileAccess(user);
    setupAuthTabs();
    setupSigninForm();
    setupRegisterForm();
    setupSelectRoleForm();
    setupLogoutButtons();
    if (dashboardAllowed) {
        renderDashboardUser(user);
        setupAdminPanel();
    }
    if (profileAllowed) {
        renderProfilePage(user);
        setupAvatarUpload();
        setupProfileForm(user);
    }
});
