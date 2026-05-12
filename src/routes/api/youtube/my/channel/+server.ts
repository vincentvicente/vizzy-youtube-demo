import { json } from '@sveltejs/kit';
import { ytFetch, YOUTUBE_API_BASE } from '$lib/server/youtube';
import { getSession, readSessionCookie } from '$lib/server/youtubeSession';

/**
 * GET /api/youtube/my/channel
 *
 * Returns the connected user's own channel(s) — snippet + statistics +
 * contentDetails (the latter gives us the `uploads` playlist id, which is the
 * cheap way to list a channel's videos without burning 100 quota on
 * search.list).
 *
 * Forwards to: GET /youtube/v3/channels?mine=true&part=...
 */
export async function GET({ cookies }) {
  const session = getSession(readSessionCookie(cookies));
  if (!session) {
    return json({ error: 'not_connected' }, { status: 401 });
  }

  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails,brandingSettings',
    mine: 'true',
  });
  const url = `${YOUTUBE_API_BASE}/channels?${params.toString()}`;
  const res = await ytFetch(url, session.access_token);
  return json(res.body, { status: res.status });
}
