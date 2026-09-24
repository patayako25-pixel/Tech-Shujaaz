import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import path from 'path';
import dotenv from 'dotenv';
import pool from './db';
import sessionsRouter from './routes/sessions';
import {
  UserRow,
  Role,
  Status,
  AuthedRequest,
  CHOOSE_PROFILE_URL,
  sanitizeUser,
  sanitizePost,
  sanitizeComment,
  dashboardUrlForRole,
  postAuthUrl,
  getUserFromToken,
  setSessionCookie,
  createSession,
  requireUser,
  requireAdmin,
  COOKIE_NAME,
} from './auth-helpers';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', sessionsRouter);

app.post('/api/register', async (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  const trimmed = (username || '').trim();

  if (trimmed.length < 3) {
    res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [
    trimmed,
  ]);
  if (existing.rows.length > 0) {
    res.status(409).json({ success: false, message: 'That username is already taken.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const inserted = await pool.query(
    `INSERT INTO users (username, password_hash, role, status, verified, is_admin)
     VALUES ($1, $2, NULL, 'active', false, false) RETURNING *`,
    [trimmed, passwordHash]
  );
  const user = inserted.rows[0] as UserRow;
  const token = await createSession(user.username);
  setSessionCookie(res, token);

  res.json({
    success: true,
    message: 'Account created. Choose your profile type to continue.',
    user: sanitizeUser(user),
    redirect: CHOOSE_PROFILE_URL,
  });
});

app.post('/api/select-role', requireUser, async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const { role, email, phone, credentials } = req.body as {
    role?: Role;
    email?: string;
    phone?: string;
    credentials?: string;
  };
  const validRoles: Role[] = ['user', 'mentor', 'therapist'];

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

  const trimmedEmail = (email || '').trim();
  const trimmedPhone = (phone || '').trim();
  const trimmedCredentials = (credentials || '').trim();

  if (role === 'therapist') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      res.status(400).json({ success: false, message: 'A valid email is required for therapist applications.' });
      return;
    }
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [trimmedEmail]
    );
    if (existingEmail.rows.length > 0) {
      res.status(409).json({ success: false, message: 'That email is already in use.' });
      return;
    }
  }

  const status: Status = role === 'therapist' ? 'pending' : 'active';
  await pool.query(
    `UPDATE users SET role = $1, status = $2, email = $3, phone = $4, credentials = $5
     WHERE username = $6`,
    [
      role,
      status,
      role === 'therapist' && trimmedEmail.length > 0 ? trimmedEmail : null,
      role === 'therapist' && trimmedPhone.length > 0 ? trimmedPhone : null,
      role === 'therapist' && trimmedCredentials.length > 0 ? trimmedCredentials : null,
      currentUser.username,
    ]
  );

  const message =
    role === 'therapist'
      ? 'Application submitted. Your therapist account is pending admin approval.'
      : 'Profile set. Welcome to Vijana Hub!';

  res.json({ success: true, message, redirect: dashboardUrlForRole(role) });
});

app.post('/api/update-profile', requireUser, async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const { displayName, bio, avatarUrl } = req.body as {
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  };

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

  const updated = await pool.query(
    `UPDATE users SET display_name = $1, bio = $2, avatar_url = $3
     WHERE username = $4 RETURNING *`,
    [
      trimmedName.length > 0 ? trimmedName : null,
      trimmedBio.length > 0 ? trimmedBio : null,
      avatarUrl || null,
      currentUser.username,
    ]
  );

  res.json({
    success: true,
    message: 'Profile updated.',
    user: sanitizeUser(updated.rows[0] as UserRow),
  });
});

app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const trimmed = (username || '').trim();

  const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [
    trimmed,
  ]);
  if (result.rows.length === 0) {
    res.status(401).json({ success: false, message: 'Incorrect username or password.' });
    return;
  }

  const user = result.rows[0] as UserRow;
  const matches = await bcrypt.compare(password || '', user.password_hash);
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

app.post('/api/logout', async (req: Request, res: Response) => {
  const token = req.cookies[COOKIE_NAME] as string | undefined;
  if (token) {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/me', async (req: Request, res: Response) => {
  const token = req.cookies[COOKIE_NAME] as string | undefined;
  const user = await getUserFromToken(token);
  if (!user) {
    res.json({ user: null });
    return;
  }
  setSessionCookie(res, token as string);
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/admin/therapists', requireAdmin, async (_req: Request, res: Response) => {
  const pending = await pool.query(
    `SELECT username, display_name, email, phone, credentials, created_at
     FROM users WHERE role = 'therapist' AND status = 'pending' ORDER BY created_at ASC`
  );
  const active = await pool.query(
    `SELECT username, created_at FROM users WHERE role = 'therapist' AND status = 'active' ORDER BY created_at ASC`
  );
  res.json({ pending: pending.rows, active: active.rows });
});

app.post('/api/admin/approve/:username', requireAdmin, async (req: Request, res: Response) => {
  const targetUsername = req.params.username;
  const result = await pool.query(
    `UPDATE users SET status = 'active', verified = true
     WHERE LOWER(username) = LOWER($1) AND role = 'therapist' RETURNING username`,
    [targetUsername]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Therapist not found.' });
    return;
  }
  res.json({ success: true });
});

app.get('/api/posts', requireUser, async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT p.*, u.display_name AS author_display_name,
            COUNT(c.id)::int AS comment_count
     FROM posts p
     JOIN users u ON u.username = p.author_username
     LEFT JOIN post_comments c ON c.post_id = p.id
     GROUP BY p.id, u.display_name
     ORDER BY p.created_at DESC
     LIMIT 100`
  );
  res.json({ success: true, posts: result.rows.map((row: any) => sanitizePost(row)) });
});

app.post('/api/posts', requireUser, async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const { title, content } = req.body as { title?: string; content?: string };

  const trimmedTitle = (title || '').trim();
  const trimmedContent = (content || '').trim();

  if (trimmedTitle.length < 1 || trimmedTitle.length > 150) {
    res.status(400).json({ success: false, message: 'Title must be between 1 and 150 characters.' });
    return;
  }
  if (trimmedContent.length < 1 || trimmedContent.length > 4000) {
    res.status(400).json({ success: false, message: 'Post must be between 1 and 4000 characters.' });
    return;
  }

  const inserted = await pool.query(
    `INSERT INTO posts (author_username, title, content) VALUES ($1, $2, $3) RETURNING *`,
    [currentUser.username, trimmedTitle, trimmedContent]
  );
  const row = {
    ...inserted.rows[0],
    author_display_name: currentUser.display_name,
    comment_count: 0,
  };

  res.json({ success: true, message: 'Post published.', post: sanitizePost(row) });
});

app.get('/api/posts/:id', requireUser, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId)) {
    res.status(400).json({ success: false, message: 'Invalid post id.' });
    return;
  }

  const postResult = await pool.query(
    `SELECT p.*, u.display_name AS author_display_name,
            COUNT(c.id)::int AS comment_count
     FROM posts p
     JOIN users u ON u.username = p.author_username
     LEFT JOIN post_comments c ON c.post_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, u.display_name`,
    [postId]
  );
  if (postResult.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Post not found.' });
    return;
  }

  const commentsResult = await pool.query(
    `SELECT c.*, u.display_name AS author_display_name
     FROM post_comments c
     JOIN users u ON u.username = c.author_username
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );

  res.json({
    success: true,
    post: sanitizePost(postResult.rows[0]),
    comments: commentsResult.rows.map((row: any) => sanitizeComment(row)),
  });
});

app.post('/api/posts/:id/comments', requireUser, async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId)) {
    res.status(400).json({ success: false, message: 'Invalid post id.' });
    return;
  }

  const { content } = req.body as { content?: string };
  const trimmedContent = (content || '').trim();
  if (trimmedContent.length < 1 || trimmedContent.length > 1000) {
    res.status(400).json({ success: false, message: 'Comment must be between 1 and 1000 characters.' });
    return;
  }

  const postExists = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
  if (postExists.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Post not found.' });
    return;
  }

  const inserted = await pool.query(
    `INSERT INTO post_comments (post_id, author_username, content) VALUES ($1, $2, $3) RETURNING *`,
    [postId, currentUser.username, trimmedContent]
  );
  const row = { ...inserted.rows[0], author_display_name: currentUser.display_name };

  res.json({ success: true, message: 'Comment added.', comment: sanitizeComment(row) });
});

async function ensureSchema(): Promise<void> {
  await pool.query(`
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
  await pool.query(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT;`);
  await pool.query(`ALTER TABLE users ALTER COLUMN role DROP NOT NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`
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
  await pool.query(`ALTER TABLE therapist_slots ADD COLUMN IF NOT EXISTS session_type VARCHAR(10) NOT NULL DEFAULT 'virtual';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      slot_id INTEGER NOT NULL UNIQUE REFERENCES therapist_slots(id) ON DELETE CASCADE,
      user_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      therapist_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      author_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at ASC);`);
}

async function seedAdmin(): Promise<void> {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    console.log('ADMIN_USERNAME / ADMIN_PASSWORD not set in .env, skipping admin seed.');
    return;
  }
  const existing = await pool.query('SELECT id FROM users WHERE is_admin = true LIMIT 1');
  if (existing.rows.length > 0) {
    return;
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role, status, verified, is_admin)
     VALUES ($1, $2, 'user', 'active', false, true)`,
    [adminUsername, passwordHash]
  );
  console.log('Seeded admin account: ' + adminUsername);
}

async function start(): Promise<void> {
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