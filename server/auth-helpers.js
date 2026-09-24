"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.THIRTY_DAYS_MS = exports.COOKIE_NAME = exports.CHOOSE_PROFILE_URL = void 0;
exports.sanitizeUser = sanitizeUser;
exports.dashboardUrlForRole = dashboardUrlForRole;
exports.postAuthUrl = postAuthUrl;
exports.getUserFromToken = getUserFromToken;
exports.setSessionCookie = setSessionCookie;
exports.createSession = createSession;
exports.requireUser = requireUser;
exports.requireAdmin = requireAdmin;
exports.requireRole = requireRole;
exports.sanitizePost = sanitizePost;
exports.sanitizeComment = sanitizeComment;
const db_1 = __importDefault(require("./db"));
exports.CHOOSE_PROFILE_URL = 'choose-profile.html';
exports.COOKIE_NAME = 'vijana_session';
exports.THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
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
        email: row.email,
        phone: row.phone,
        credentials: row.credentials,
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
        return exports.CHOOSE_PROFILE_URL;
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
    const newExpiresAt = new Date(Date.now() + exports.THIRTY_DAYS_MS);
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
    res.cookie(exports.COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: exports.THIRTY_DAYS_MS,
    });
}
async function createSession(username) {
    const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + exports.THIRTY_DAYS_MS);
    await db_1.default.query('INSERT INTO sessions (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
    return token;
}
async function requireUser(req, res, next) {
    const token = req.cookies[exports.COOKIE_NAME];
    const user = await getUserFromToken(token);
    if (!user) {
        res.status(401).json({ success: false, message: 'Not signed in.' });
        return;
    }
    req.currentUser = user;
    next();
}
async function requireAdmin(req, res, next) {
    const token = req.cookies[exports.COOKIE_NAME];
    const user = await getUserFromToken(token);
    if (!user || !user.is_admin) {
        res.status(403).json({ success: false, message: 'Admin access required.' });
        return;
    }
    req.currentUser = user;
    next();
}
function requireRole(role) {
    return async (req, res, next) => {
        const token = req.cookies[exports.COOKIE_NAME];
        const user = await getUserFromToken(token);
        if (!user) {
            res.status(401).json({ success: false, message: 'Not signed in.' });
            return;
        }
        if (user.role !== role) {
            res.status(403).json({ success: false, message: 'Not authorized.' });
            return;
        }
        req.currentUser = user;
        next();
    };
}
function sanitizePost(row) {
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
function sanitizeComment(row) {
    return {
        id: row.id,
        postId: row.post_id,
        authorUsername: row.author_username,
        authorDisplayName: row.author_display_name || row.author_username,
        content: row.content,
        createdAt: row.created_at,
    };
}
