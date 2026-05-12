import { json } from '@sveltejs/kit';
import { GOOGLE_OAUTH_REVOKE_URL } from '$lib/server/youtube';
import {
  clearSessionCookie,
  deleteSession,
  getSession,
  readSessionCookie,
} from '$lib/server/youtubeSession';

/**
 * POST /api/youtube/auth/logout
 *
 * Best-effort token revocation at Google's side + drop the local session.
 * Revocation is fire-and-forget — if Google is unreachable we still nuke the
 * local session so the user isn't stuck "connected" with a dead token.
 */
export async function POST({ cookies }) {
  const sid = readSessionCookie(cookies);
  const session = getSession(sid);

  if (session) {
    const tokenToRevoke = session.refresh_token ?? session.access_token;
    try {
      await fetch(`${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(tokenToRevoke)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      /* ignore — revocation is best-effort */
    }
  }

  deleteSession(sid);
  clearSessionCookie(cookies);
  return json({ ok: true });
}
