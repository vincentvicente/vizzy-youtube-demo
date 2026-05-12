import { json } from '@sveltejs/kit';
import { ytFetch, YOUTUBE_ANALYTICS_API_BASE } from '$lib/server/youtube';
import { getSession, readSessionCookie } from '$lib/server/youtubeSession';

/**
 * GET /api/youtube/analytics/report?
 *     metrics=views,estimatedMinutesWatched,averageViewDuration
 *     &dimensions=day
 *     &start_date=2025-04-01&end_date=2025-05-01
 *     &video_id=...        (optional — restrict to one video)
 *     &max_results=...     (optional)
 *
 * Thin proxy to the YouTube Analytics reports.query endpoint. Defaults below
 * pull a sensible "last 28 days, daily" snapshot for the authenticated user's
 * entire channel.
 *
 * Why this matters for Vizzy: these metrics are PRIVATE to the channel owner.
 * No amount of public API-key polling can return watch time, average view
 * duration, audience demographics, or retention curves. The OAuth grant is
 * what unlocks them.
 *
 * Reference:
 *   https://developers.google.com/youtube/analytics/reference/reports/query
 */
export async function GET({ url, cookies }) {
  const session = getSession(readSessionCookie(cookies));
  if (!session) {
    return json({ error: 'not_connected' }, { status: 401 });
  }

  const today = new Date();
  const fourWeeksAgo = new Date(today);
  fourWeeksAgo.setDate(today.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const metrics =
    url.searchParams.get('metrics') ??
    'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained';
  const dimensions = url.searchParams.get('dimensions') ?? 'day';
  const startDate = url.searchParams.get('start_date') ?? fmt(fourWeeksAgo);
  const endDate = url.searchParams.get('end_date') ?? fmt(today);
  const maxResults = url.searchParams.get('max_results');
  const videoId = url.searchParams.get('video_id');

  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics,
    dimensions,
  });
  if (maxResults) params.set('maxResults', maxResults);
  if (videoId) params.set('filters', `video==${videoId}`);

  const apiUrl = `${YOUTUBE_ANALYTICS_API_BASE}/reports?${params.toString()}`;
  const res = await ytFetch(apiUrl, session.access_token);
  return json(
    {
      query: { metrics, dimensions, startDate, endDate, video_id: videoId ?? null },
      ...((res.body as object) ?? {}),
    },
    { status: res.status }
  );
}
