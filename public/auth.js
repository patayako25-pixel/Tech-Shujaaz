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
const COMMENT_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
let modalOverlay = null;
function ensureModal() {
    if (modalOverlay)
        return modalOverlay;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const card = document.createElement('div');
    card.className = 'modal-card';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'modal-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeModal);
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.id = 'post-modal-body';
    card.appendChild(closeButton);
    card.appendChild(body);
    overlay.appendChild(card);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay)
            closeModal();
    });
    document.body.appendChild(overlay);
    modalOverlay = overlay;
    return overlay;
}
function closeModal() {
    if (modalOverlay)
        modalOverlay.classList.remove('open');
}
function openModal() {
    const overlay = ensureModal();
    overlay.classList.add('open');
}
function formatRelativeTime(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(1, Math.floor((now - then) / 1000));
    if (diffSec < 60)
        return diffSec + 's ago';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60)
        return diffMin + 'm ago';
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24)
        return diffHr + 'h ago';
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7)
        return diffDay + 'd ago';
    return new Date(iso).toLocaleDateString();
}
function buildCommentButton(count) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'feed-comment-btn';
    button.innerHTML = COMMENT_ICON_SVG + '<span class="feed-comment-count">' + count + '</span>';
    return button;
}
function updateFeedCommentCount(postId, count) {
    const el = document.querySelector('#feed-list .feed-item[data-post-id="' + postId + '"] .feed-comment-count');
    if (el)
        el.textContent = String(count);
}
function renderPostModalBody(body, post, comments, postId, onSubmitComment) {
    body.innerHTML = '';
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = post.authorDisplayName + ' · ' + formatRelativeTime(post.createdAt);
    body.appendChild(meta);
    const title = document.createElement('h3');
    title.textContent = post.title;
    body.appendChild(title);
    const content = document.createElement('p');
    content.textContent = post.content;
    content.className = 'modal-post-content';
    body.appendChild(content);
    const commentsHeading = document.createElement('h4');
    commentsHeading.className = 'modal-comments-heading';
    commentsHeading.textContent = 'Comments';
    body.appendChild(commentsHeading);
    const commentList = document.createElement('div');
    commentList.className = 'comment-thread';
    body.appendChild(commentList);
    const localComments = comments.slice();
    function renderComments() {
        commentList.innerHTML = '';
        if (localComments.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'admin-empty';
            empty.textContent = 'No comments yet. Be the first to respond.';
            commentList.appendChild(empty);
            return;
        }
        localComments.forEach((comment) => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            const commentMeta = document.createElement('span');
            commentMeta.className = 'meta';
            commentMeta.textContent = comment.authorDisplayName + ' · ' + formatRelativeTime(comment.createdAt);
            const commentText = document.createElement('p');
            commentText.textContent = comment.content;
            item.appendChild(commentMeta);
            item.appendChild(commentText);
            commentList.appendChild(item);
        });
    }
    renderComments();
    const form = document.createElement('form');
    form.className = 'comment-form';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Write a comment…';
    textarea.required = true;
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Comment';
    const formMessage = document.createElement('p');
    formMessage.className = 'auth-message';
    form.appendChild(textarea);
    form.appendChild(submitButton);
    form.appendChild(formMessage);
    body.appendChild(form);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = textarea.value.trim();
        if (!value)
            return;
        const result = await onSubmitComment(value);
        if (result.success && result.comment) {
            localComments.push(result.comment);
            renderComments();
            textarea.value = '';
            if (postId !== null)
                updateFeedCommentCount(postId, localComments.length);
            showFormMessage(formMessage, 'Comment added.', false);
        }
        else {
            showFormMessage(formMessage, result.message || 'Could not add comment.', true);
        }
    });
}
async function openPostModal(postId) {
    ensureModal();
    const body = document.getElementById('post-modal-body');
    if (!body)
        return;
    body.innerHTML = '<p class="modal-loading">Loading post…</p>';
    openModal();
    const response = await fetch('/api/posts/' + postId, { credentials: 'include' });
    const data = (await response.json());
    if (!data.success || !data.post) {
        body.innerHTML = '<p class="modal-loading">Could not load this post.</p>';
        return;
    }
    renderPostModalBody(body, data.post, data.comments || [], postId, async (content) => {
        const response2 = await fetch('/api/posts/' + postId + '/comments', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        const result = (await response2.json());
        return result;
    });
}
function getLocalCommentsKey(placeholderId) {
    return 'vijana-static-comments:' + placeholderId;
}
function getLocalComments(placeholderId) {
    const raw = window.localStorage.getItem(getLocalCommentsKey(placeholderId));
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (_a) {
        return [];
    }
}
function saveLocalComment(placeholderId, comment) {
    const existing = getLocalComments(placeholderId);
    existing.push(comment);
    window.localStorage.setItem(getLocalCommentsKey(placeholderId), JSON.stringify(existing));
}
function openStaticPostModal(item, placeholderId, currentUserDisplay) {
    var _a, _b, _c;
    ensureModal();
    const body = document.getElementById('post-modal-body');
    if (!body)
        return;
    const titleText = ((_a = item.querySelector('h3')) === null || _a === void 0 ? void 0 : _a.textContent) || '';
    const fullContentEl = item.querySelector('.feed-full-content');
    const contentText = fullContentEl
        ? (fullContentEl.textContent || '').trim()
        : ((_b = item.querySelector('p')) === null || _b === void 0 ? void 0 : _b.textContent) || '';
    const metaText = ((_c = item.querySelector('.meta')) === null || _c === void 0 ? void 0 : _c.textContent) || '';
    const fakePost = {
        title: titleText,
        content: contentText,
        authorDisplayName: metaText,
        createdAt: new Date().toISOString(),
    };
    const stored = getLocalComments(placeholderId);
    const comments = stored.map((c, index) => ({
        id: index,
        postId: 0,
        authorUsername: '',
        authorDisplayName: c.author,
        content: c.content,
        createdAt: c.createdAt,
    }));
    renderPostModalBody(body, fakePost, comments, null, async (content) => {
        const createdAt = new Date().toISOString();
        saveLocalComment(placeholderId, { author: currentUserDisplay, content, createdAt });
        const countEl = item.querySelector('.feed-comment-count');
        if (countEl)
            countEl.textContent = String(getLocalComments(placeholderId).length);
        return {
            success: true,
            message: 'Comment added.',
            comment: {
                id: getLocalComments(placeholderId).length,
                postId: 0,
                authorUsername: '',
                authorDisplayName: currentUserDisplay,
                content,
                createdAt,
            },
        };
    });
    openModal();
}
function buildPostFeedItem(post) {
    const article = document.createElement('article');
    article.className = 'feed-item type-post';
    article.dataset.postId = String(post.id);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = 'Post · ' + post.authorDisplayName + ' · ' + formatRelativeTime(post.createdAt);
    article.appendChild(meta);
    const title = document.createElement('h3');
    title.textContent = post.title;
    title.className = 'feed-clickable-title';
    article.appendChild(title);
    const excerpt = document.createElement('p');
    excerpt.textContent = post.content;
    article.appendChild(excerpt);
    const commentButton = buildCommentButton(post.commentCount);
    article.appendChild(commentButton);
    const open = () => openPostModal(post.id);
    title.addEventListener('click', open);
    commentButton.addEventListener('click', open);
    return article;
}
function enhanceStaticFeedItems(currentUserDisplay) {
    const items = document.querySelectorAll('#feed-list .feed-item[data-placeholder-id]');
    items.forEach((item) => {
        const placeholderId = item.dataset.placeholderId || '';
        const commentButton = buildCommentButton(getLocalComments(placeholderId).length);
        item.appendChild(commentButton);
        const titleEl = item.querySelector('h3');
        if (titleEl)
            titleEl.classList.add('feed-clickable-title');
        const open = () => openStaticPostModal(item, placeholderId, currentUserDisplay);
        commentButton.addEventListener('click', open);
        if (titleEl)
            titleEl.addEventListener('click', open);
    });
}
function openComposeModal(onPublished) {
    ensureModal();
    const body = document.getElementById('post-modal-body');
    if (!body)
        return;
    body.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = 'New Post';
    body.appendChild(heading);
    const form = document.createElement('form');
    form.className = 'compose-form';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Title';
    titleInput.maxLength = 150;
    titleInput.required = true;
    const contentInput = document.createElement('textarea');
    contentInput.placeholder = "What's on your mind?";
    contentInput.maxLength = 4000;
    contentInput.required = true;
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Post';
    const formMessage = document.createElement('p');
    formMessage.className = 'auth-message';
    form.appendChild(titleInput);
    form.appendChild(contentInput);
    form.appendChild(submitButton);
    form.appendChild(formMessage);
    body.appendChild(form);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const result = (await postJson('/api/posts', {
            title: titleInput.value,
            content: contentInput.value,
        }));
        if (result.success && result.post) {
            onPublished(result.post);
            closeModal();
        }
        else {
            showFormMessage(formMessage, result.message || 'Could not publish post.', true);
        }
    });
    openModal();
}
async function setupFeed(user) {
    const feedList = document.getElementById('feed-list');
    if (!feedList)
        return;
    const currentUserDisplay = displayNameFor(user);
    enhanceStaticFeedItems(currentUserDisplay);
    const newPostButton = document.getElementById('new-post-btn');
    if (newPostButton) {
        newPostButton.addEventListener('click', () => {
            openComposeModal((post) => {
                feedList.prepend(buildPostFeedItem(post));
            });
        });
    }
    const response = await fetch('/api/posts', { credentials: 'include' });
    if (!response.ok)
        return;
    const data = (await response.json());
    if (!data.success || !data.posts)
        return;
    const fragment = document.createDocumentFragment();
    data.posts.forEach((post) => fragment.appendChild(buildPostFeedItem(post)));
    feedList.prepend(fragment);
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
    if (dashboardAllowed && user) {
        renderDashboardUser(user);
        setupAdminPanel();
        setupFeed(user);
    }
    if (profileAllowed) {
        renderProfilePage(user);
        setupAvatarUpload();
        setupProfileForm(user);
    }
});
