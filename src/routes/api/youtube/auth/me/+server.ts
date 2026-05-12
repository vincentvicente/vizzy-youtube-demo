import { json } from '@sveltejs/kit';
import { getSession, readSessionCookie } from '$lib/server/youtubeSession';

/**
 * GET /api/youtube/auth/me
 *
 * Lets the frontend ask "am I connected, and if so to which Google account?"
 * without exposing any tokens.
 */
export async function GET({ cookies }) {
  const session = getSession(readSessionCookie(cookies));
  if (!session) {
    return json({ connected: false });
  }
  return json({
    connected: true,
    email: session.email,
    expires_at: session.expires_at,
    has_refresh_token: Boolean(session.refresh_token),
    scope: session.scope,
  });
}
