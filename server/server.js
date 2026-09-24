"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const auth_helpers_1 = require("./auth-helpers");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.use(express_1.default.json({ limit: '5mb' }));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.use('/api', sessions_1.default);
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
    const token = await (0, auth_helpers_1.createSession)(user.username);
    (0, auth_helpers_1.setSessionCookie)(res, token);
    res.json({
        success: true,
        message: 'Account created. Choose your profile type to continue.',
        user: (0, auth_helpers_1.sanitizeUser)(user),
        redirect: auth_helpers_1.CHOOSE_PROFILE_URL,
    });
});
app.post('/api/select-role', auth_helpers_1.requireUser, async (req, res) => {
    const currentUser = req.currentUser;
    const { role, email, phone, credentials } = req.body;
    const validRoles = ['user', 'mentor', 'therapist'];
    if (!role || !validRoles.includes(role)) {
        res.status(400).json({ success: false, message: 'Please choose a valid profile type.' });
        return;
    }
    if (currentUser.role) {
        res.status(409).json({
            success: false,
            message: 'Your profile type is already set.',
            redirect: (0, auth_helpers_1.dashboardUrlForRole)(currentUser.role),
        });
        return;
    }
    const trimmedEmail = (email || '').trim();
    const trimmedPhone = (phone || '').trim();
    const trimmedCredentials = (credentials || '').trim();
    if (role === 'therapist') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(trimmedEmail)) {
            res.status(400).json({ success: false, message: 'A valid email is required for therapist applications.' });
            return;
        }
        const existingEmail = await db_1.default.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [trimmedEmail]);
        if (existingEmail.rows.length > 0) {
            res.status(409).json({ success: false, message: 'That email is already in use.' });
            return;
        }
    }
    const status = role === 'therapist' ? 'pending' : 'active';
    await db_1.default.query(`UPDATE users SET role = $1, status = $2, email = $3, phone = $4, credentials = $5
     WHERE username = $6`, [
        role,
        status,
        role === 'therapist' && trimmedEmail.length > 0 ? trimmedEmail : null,
        role === 'therapist' && trimmedPhone.length > 0 ? trimmedPhone : null,
        role === 'therapist' && trimmedCredentials.length > 0 ? trimmedCredentials : null,
        currentUser.username,
    ]);
    const message = role === 'therapist'
        ? 'Application submitted. Your therapist account is pending admin approval.'
        : 'Profile set. Welcome to Vijana Hub!';
    res.json({ success: true, message, redirect: (0, auth_helpers_1.dashboardUrlForRole)(role) });
});
app.post('/api/update-profile', auth_helpers_1.requireUser, async (req, res) => {
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
        user: (0, auth_helpers_1.sanitizeUser)(updated.rows[0]),
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
    const token = await (0, auth_helpers_1.createSession)(user.username);
    (0, auth_helpers_1.setSessionCookie)(res, token);
    res.json({
        success: true,
        message: 'Signed in successfully.',
        user: (0, auth_helpers_1.sanitizeUser)(user),
        redirect: (0, auth_helpers_1.postAuthUrl)(user.role),
    });
});
app.post('/api/logout', async (req, res) => {
    const token = req.cookies[auth_helpers_1.COOKIE_NAME];
    if (token) {
        await db_1.default.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
    res.clearCookie(auth_helpers_1.COOKIE_NAME);
    res.json({ success: true });
});
app.get('/api/me', async (req, res) => {
    const token = req.cookies[auth_helpers_1.COOKIE_NAME];
    const user = await (0, auth_helpers_1.getUserFromToken)(token);
    if (!user) {
        res.json({ user: null });
        return;
    }
    (0, auth_helpers_1.setSessionCookie)(res, token);
    res.json({ user: (0, auth_helpers_1.sanitizeUser)(user) });
});
app.get('/api/admin/therapists', auth_helpers_1.requireAdmin, async (_req, res) => {
    const pending = await db_1.default.query(`SELECT username, display_name, email, phone, credentials, created_at
     FROM users WHERE role = 'therapist' AND status = 'pending' ORDER BY created_at ASC`);
    const active = await db_1.default.query(`SELECT username, created_at FROM users WHERE role = 'therapist' AND status = 'active' ORDER BY created_at ASC`);
    res.json({ pending: pending.rows, active: active.rows });
});
app.post('/api/admin/approve/:username', auth_helpers_1.requireAdmin, async (req, res) => {
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
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;`);
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);`);
    await db_1.default.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials TEXT;`);
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS therapist_slots (
      id SERIAL PRIMARY KEY,
      therapist_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      session_type VARCHAR(10) NOT NULL DEFAULT 'virtual',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
    await db_1.default.query(`ALTER TABLE therapist_slots ADD COLUMN IF NOT EXISTS session_type VARCHAR(10) NOT NULL DEFAULT 'virtual';`);
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      slot_id INTEGER NOT NULL UNIQUE REFERENCES therapist_slots(id) ON DELETE CASCADE,
      user_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      therapist_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
