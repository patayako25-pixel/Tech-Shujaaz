import { Request, Response, NextFunction } from 'express';
import pool from './db';

export type Role = 'user' | 'mentor' | 'therapist';
export type Status = 'active' | 'pending';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role | null;
  status: Status;
  verified: boolean;
  is_admin: boolean;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  credentials: string | null;
}

export interface SafeUser {
  username: string;
  role: Role | null;
  status: Status;
  verified: boolean;
  isAdmin: boolean;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  credentials: string | null;
}

export interface AuthedRequest extends Request {
  currentUser: UserRow;
}

export const CHOOSE_PROFILE_URL = 'choose-profile.html';
export const COOKIE_NAME = 'vijana_session';
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sanitizeUser(row: UserRow): SafeUser {
  return {
    username: row.username,
    role: row.role,
    status: row.status,
    verified: row.verified,
    isAdmin: row.is_admin,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    email: row.email,
    phone: row.phone,
    credentials: row.credentials,
  };
}

export function dashboardUrlForRole(role: Role): string {
  if (role === 'mentor') return 'dashboard-mentor.html';
  if (role === 'therapist') return 'dashboard-therapist.html';
  return 'dashboard-user.html';
}

export function postAuthUrl(role: Role | null): string {
  if (!role) return CHOOSE_PROFILE_URL;
  return dashboardUrlForRole(role);
}

export async function getUserFromToken(token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const sessionResult = await pool.query(
    'SELECT username, expires_at FROM sessions WHERE token = $1',
    [token]
  );
  if (sessionResult.rows.length === 0) return null;
  const session = sessionResult.rows[0];
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }
  const newExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  await pool.query('UPDATE sessions SET expires_at = $1 WHERE token = $2', [
    newExpiresAt,
    token,
  ]);
  const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [
    session.username,
  ]);
  if (userResult.rows.length === 0) return null;
  return userResult.rows[0] as UserRow;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_MS,
  });
}

export async function createSession(username: string): Promise<string> {
  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  await pool.query(
    'INSERT INTO sessions (token, username, expires_at) VALUES ($1, $2, $3)',
    [token, username, expiresAt]
  );
  return token;
}

export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies[COOKIE_NAME] as string | undefined;
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ success: false, message: 'Not signed in.' });
    return;
  }
  (req as AuthedRequest).currentUser = user;
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies[COOKIE_NAME] as string | undefined;
  const user = await getUserFromToken(token);
  if (!user || !user.is_admin) {
    res.status(403).json({ success: false, message: 'Admin access required.' });
    return;
  }
  (req as AuthedRequest).currentUser = user;
  next();
}

export function requireRole(role: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies[COOKIE_NAME] as string | undefined;
    const user = await getUserFromToken(token);
    if (!user) {
      res.status(401).json({ success: false, message: 'Not signed in.' });
      return;
    }
    if (user.role !== role) {
      res.status(403).json({ success: false, message: 'Not authorized.' });
      return;
    }
    (req as AuthedRequest).currentUser = user;
    next();
  };
}

export interface PostRow {
  id: number;
  author_username: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: number;
  post_id: number;
  author_username: string;
  content: string;
  created_at: string;
}

export interface SafePost {
  id: number;
  authorUsername: string;
  authorDisplayName: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

export interface SafeComment {
  id: number;
  postId: number;
  authorUsername: string;
  authorDisplayName: string;
  content: string;
  createdAt: string;
}

export function sanitizePost(row: any): SafePost {
  return {
    id: row.id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name || row.author_username,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: Number(row.comment_count) || 0,
  };
}

export function sanitizeComment(row: any): SafeComment {
  return {
    id: row.id,
    postId: row.post_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name || row.author_username,
    content: row.content,
    createdAt: row.created_at,
  };
}