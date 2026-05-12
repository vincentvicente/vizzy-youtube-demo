import { json } from '@sveltejs/kit';
import { googleOAuthFetch, clientCreds } from '$lib/server/youtube';
import { getSession, readSessionCookie, setSession } from '$lib/server/youtubeSession';

type RefreshResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

/**
 * POST /api/youtube/auth/refresh
 *
 * Manual rotation of access_token via the long-lived refresh_token. Surfaced
 * as a button in the demo so you can watch the response shape. In production
 * this would be invoked automatically when expires_at is near.
 */
export async function POST({ cookies }) {
  const sid = readSessionCookie(cookies);
  const session = getSession(sid);
  if (!session) {
    return json({ error: 'not_connected' }, { status: 401 });
  }
  if (!session.refresh_token) {
    return json(
      {
        error: 'no_refresh_token',
        hint: 'Google only returns refresh_token on first consent. Log out, then connect again — the /auth/url endpoint uses prompt=consent to force a fresh refresh_token.',
      },
      { status: 400 }
    );
  }

  const res = await googleOAuthFetch<RefreshResponse | { error: string; error_description?: string }>({
    client_id: clientCreds.id,
    client_secret: clientCreds.secret,
    grant_type: 'refresh_token',
    refresh_token: session.refresh_token,
  });

  if (!res.ok || !('access_token' in (res.body as object))) {
    return json(res.body, { status: res.status });
  }

  const t = res.body as RefreshResponse;
  setSession(sid!, {
    ...session,
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
    scope: t.scope ?? session.scope,
  });

  return json({
    ok: true,
    expires_in: t.expires_in,
    scope: t.scope ?? session.scope,
  });
}
