import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';

/**
 * In-memory token store for the YouTube demo.
 *
 * Demo-only: tokens live in process memory keyed by a random session id.
 * Wiped on server restart. Production would persist per-creator with
 * encrypted refresh_token + a background refresh job.
 */
export type YouTubeSession = {
  /** Google account email (from id_token). Display-only. */
  email: string;
  access_token: string;
  /** Google refresh tokens are long-lived (no fixed expiry) but only issued
   *  on first consent unless we force `prompt=consent`. May be undefined if
   *  the user has authorized this app before and we forgot to force consent. */
  refresh_token: string | undefined;
  /** Absolute ms epoch when access_token expires. */
  expires_at: number;
  scope: string;
};

const sessions = new Map<string, YouTubeSession>();

const SESSION_COOKIE = 'yt_sid';
const STATE_COOKIE = 'yt_oauth_state';
const STATE_TTL_SECONDS = 600;

export function createSessionId(): string {
  return randomBytes(24).toString('hex');
}

export function setSession(id: string, session: YouTubeSession): void {
  sessions.set(id, session);
}

export function getSession(id: string | undefined): YouTubeSession | null {
  if (!id) return null;
  return sessions.get(id) ?? null;
}

export function deleteSession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

export function setSessionCookie(cookies: Cookies, sessionId: string): void {
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Local dev uses http://localhost — Secure: true would prevent the cookie
    // from being set. Flip to true once deployed behind HTTPS.
    secure: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function readSessionCookie(cookies: Cookies): string | undefined {
  return cookies.get(SESSION_COOKIE);
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function setOAuthStateCookie(cookies: Cookies, state: string): void {
  cookies.set(STATE_COOKIE, state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: STATE_TTL_SECONDS,
  });
}

export function readOAuthStateCookie(cookies: Cookies): string | undefined {
  return cookies.get(STATE_COOKIE);
}

export function clearOAuthStateCookie(cookies: Cookies): void {
  cookies.delete(STATE_COOKIE, { path: '/' });
}

export function generateOAuthState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Decode a JWT id_token payload without verifying the signature.
 * We only use this to display the connected email in the UI — never to make
 * trust decisions. (Google already verified the signature server-side when
 * it minted the token.)
 */
export function decodeIdTokenPayload(idToken: string): Record<string, unknown> | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}
