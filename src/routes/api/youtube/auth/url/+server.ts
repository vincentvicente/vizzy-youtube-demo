import { json } from '@sveltejs/kit';
import {
  GOOGLE_OAUTH_AUTHORIZE_URL,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
  clientCreds,
} from '$lib/server/youtube';
import { generateOAuthState, setOAuthStateCookie } from '$lib/server/youtubeSession';

/**
 * GET /api/youtube/auth/url
 *
 * Builds the Google OAuth authorize URL with a CSRF state. The frontend
 * redirects the browser to this URL; Google calls back to
 * /api/youtube/auth/callback after consent.
 *
 * `access_type=offline` + `prompt=consent` together force Google to return a
 * refresh_token EVERY time. Without `prompt=consent`, Google only returns the
 * refresh_token on first consent — subsequent re-auths return only an
 * access_token, which makes the demo's "refresh" button useless if the user
 * had ever consented before.
 */
export async function GET({ cookies }) {
  const state = generateOAuthState();
  setOAuthStateCookie(cookies, state);

  const params = new URLSearchParams({
    client_id: clientCreds.id,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return json({
    authorize_url: `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    state,
  });
}
