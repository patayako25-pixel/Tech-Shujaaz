"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
dotenv_1.default.config();
const CHOOSE_PROFILE_URL = 'choose-profile.html';
const app = (0, express_1.default)();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const COOKIE_NAME = 'vijana_session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
app.use(express_1.default.json({ limit: '5mb' }));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
function sanitizeUser(row) {
    return {
        username: row.username,
        role: row.role,
        status: row.status,
        verified: row.verified,
        isAdmin: row.is_admin,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
    };
}
function dashboardUrlForRole(role) {
    if (role === 'mentor')
        return 'dashboard-mentor.html';
    if (role === 'therapist')
        return 'dashboard-therapist.html';
    return 'dashboard-user.html';
}
function postAuthUrl(role) {
    if (!role)
        return CHOOSE_PROFILE_URL;
    return dashboardUrlForRole(role);
}
async function getUserFromToken(token) {
    if (!token)
        return null;
    const sessionResult = await db_1.default.query('SELECT username, expires_at FROM sessions WHERE token = $1', [token]);
    if (sessionResult.rows.length === 0)
        return null;
    const session = sessionResult.rows[0];
    if (new Date(session.expires_at).getTime() < Date.now()) {
        await db_1.default.query('DELETE FROM sessions WHERE token = $1', [token]);
        return null;
    }
    const newExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
    await db_1.default.query('UPDATE sessions SET expires_at = $1 WHERE token = $2', [
        newExpiresAt,
        token,
    ]);
    const userResult = await db_1.default.query('SELECT * FROM users WHERE username = $1', [
        session.username,
    ]);
    if (userResult.rows.length === 0)
        return null;
    return userResult.rows[0];
}
function setSessionCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: THIRTY_DAYS_MS,
    });
}
async function createSession(username) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
    await db_1.default.query('INSERT INTO sessions (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
    return token;
}
async function requireUser(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    const user = await getUserFromToken(token);
    if (!user) {
        res.status(401).json({ success: false, message: 'Not signed in.' });
        return;
    }
    req.currentUser = user;
    next();
}
async function requireAdmin(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    const user = await getUserFromToken(token);
    if (!user || !user.is_admin) {
        res.status(403).json({ success: false, message: 'Admin access required.' });
        return;
    }
    req.currentUser = user;
    next();
}
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const trimmed = (username || '').trim();
    if (trimmed.length < 3) {
        res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
        return;
    }
    if (!password || password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        return;
    }
    const existing = await db_1.default.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [
        trimmed,
    ]);
    if (existing.rows.length > 0) {
        res.status(409).json({ success: false, message: 'That username is already taken.' });
        return;
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const inserted = await db_1.default.query(`INSERT INTO users (username, password_hash, role, status, verified, is_admin)
     VALUES ($1, $2, NULL, 'active', false, false) RETURNING *`, [trimmed, passwordHash]);
    const user = inserted.rows[0];
    const token = await createSession(user.username);
    setSessionCookie(res, token);
    res.json({
        success: true,
        message: 'Account created. Choose your profile type to continue.',
        user: sanitizeUser(user),
        redirect: CHOOSE_PROFILE_URL,
    });
});
app.post('/api/select-role', requireUser, async (req, res) => {
    const currentUser = req.currentUser;
    const { role } = req.body;
    const validRoles = ['user', 'mentor', 'therapist'];
    if (!role || !validRoles.includes(role)) {
        res.status(400).json({ success: false, message: 'Please choose a valid profile type.' });
        return;
    }
    if (currentUser.role) {
        res.status(409).json({
            success: false,
            message: 'Your profile type is already set.',
            redirect: dashboardUrlForRole(currentUser.role),
        });
        return;
    }
    const status = role === 'therapist' ? 'pending' : 'active';
    await db_1.default.query('UPDATE users SET role = $1, status = $2 WHERE username = $3', [
        role,
        status,
        currentUser.username,
    ]);
    const message = role === 'therapist'
        ? 'Profile set. Your therapist account is pending admin approval.'
        : 'Profile set. Welcome to Vijana Hub!';
    res.json({ success: true, message, redirect: dashboardUrlForRole(role) });
});
app.post('/api/update-profile', requireUser, async (req, res) => {
    const currentUser = req.currentUser;
    const { displayName, bio, avatarUrl } = req.body;
    const trimmedName = (displayName || '').trim();
    if (trimmedName.length > 60) {
        res.status(400).json({ success: false, message: 'Display name must be 60 characters or fewer.' });
        return;
    }
    const trimmedBio = (bio || '').trim();
    if (trimmedBio.length > 280) {
        res.status(400).json({ success: false, message: 'Bio must be 280 characters or fewer.' });
        return;
    }
    const updated = await db_1.default.query(`UPDATE users SET display_name = $1, bio = $2, avatar_url = $3
     WHERE username = $4 RETURNING *`, [
        trimmedName.length > 0 ? trimmedName : null,
        trimmedBio.length > 0 ? trimmedBio : null,
        avatarUrl || null,
        currentUser.username,
    ]);
    res.json({
        success: true,
        message: 'Profile updated.',
        user: sanitizeUser(updated.rows[0]),
    });
});
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const trimmed = (username || '').trim();
    const result = await db_1.default.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [
        trimmed,
    ]);
    if (result.rows.length === 0) {
        res.status(401).json({ success: false, message: 'Incorrect username or password.' });
        return;
    }
    const user = result.rows[0];
    const matches = await bcrypt_1.default.compare(password || '', user.password_hash);
    if (!matches) {
        res.status(401).json({ success: false, message: 'Incorrect username or password.' });
        return;
    }
    const token = await createSession(user.username);
    setSessionCookie(res, token);
    res.json({
        success: true,
        message: 'Signed in successfully.',
        user: sanitizeUser(user),
        redirect: postAuthUrl(user.role),
    });
});
app.post('/api/logout', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) {
        await db_1.default.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
});
app.get('/api/me', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    const user = await getUserFromToken(token);
    if (!user) {
        res.json({ user: null });
        return;
    }
    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(user) });
});
app.get('/api/admin/therapists', requireAdmin, async (_req, res) => {
    const pending = await db_1.default.query(`SELECT username, created_at FROM users WHERE role = 'therapist' AND status = 'pending' ORDER BY created_at ASC`);
    const active = await db_1.default.query(`SELECT username, created_at FROM users WHERE role = 'therapist' AND status = 'active' ORDER BY created_at ASC`);
    res.json({ pending: pending.rows, active: active.rows });
});
app.post('/api/admin/approve/:username', requireAdmin, async (req, res) => {
    const targetUsername = req.params.username;
    const result = await db_1.default.query(`UPDATE users SET status = 'active', verified = true
     WHERE LOWER(username) = LOWER($1) AND role = 'therapist' RETURNING username`, [targetUsername]);
    if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Therapist not found.' });
        return;
    }
    res.json({ success: true });
});
async function ensureSchema() {
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      verified BOOLEAN NOT NULL DEFAULT false,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
    await db_1.default.query(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT;`);
    await db_1.default.query(`ALTER TABLE users ALTER COLUMN role DROP NOT NULL;`);
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60);`);
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280);`);
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
}
async function seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminUsername || !adminPassword) {
        console.log('ADMIN_USERNAME / ADMIN_PASSWORD not set in .env, skipping admin seed.');
        return;
    }
    const existing = await db_1.default.query('SELECT id FROM users WHERE is_admin = true LIMIT 1');
    if (existing.rows.length > 0) {
        return;
    }
    const passwordHash = await bcrypt_1.default.hash(adminPassword, 10);
    await db_1.default.query(`INSERT INTO users (username, password_hash, role, status, verified, is_admin)
     VALUES ($1, $2, 'user', 'active', false, true)`, [adminUsername, passwordHash]);
    console.log('Seeded admin account: ' + adminUsername);
}
async function start() {
    await ensureSchema();
    await seedAdmin();
    app.listen(PORT, () => {
        console.log('Vijana Hub server running at http://localhost:' + PORT);
    });
}
start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
