import { json } from '@sveltejs/kit';
import { ytFetch, YOUTUBE_API_BASE } from '$lib/server/youtube';
import { getSession, readSessionCookie } from '$lib/server/youtubeSession';

type ChannelsListResponse = {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
};

type PlaylistItemsResponse = {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
};

/**
 * GET /api/youtube/my/videos?max_results=20&page_token=...
 *
 * Lists the connected user's uploads with full statistics for each video.
 *
 * Implementation:
 *   1. channels.list(mine=true) → uploads playlist id (1 unit)
 *   2. playlistItems.list(playlistId=uploads) → page of videoIds (1 unit)
 *   3. videos.list(id=ids, part=snippet,statistics,contentDetails) → stats (1 unit)
 *
 * Why not search.list? It costs 100 units per call. The uploads-playlist path
 * costs ~3 units for a full page. With a 10,000-units/day default quota the
 * difference matters.
 */
export async function GET({ url, cookies }) {
  const session = getSession(readSessionCookie(cookies));
  if (!session) {
    return json({ error: 'not_connected' }, { status: 401 });
  }

  const maxResults = Math.min(Number(url.searchParams.get('max_results') ?? '20'), 50);
  const pageToken = url.searchParams.get('page_token') ?? '';

  // Step 1: resolve the uploads playlist for this channel.
  const channelsParams = new URLSearchParams({
    part: 'contentDetails',
    mine: 'true',
  });
  const channelsRes = await ytFetch<ChannelsListResponse>(
    `${YOUTUBE_API_BASE}/channels?${channelsParams.toString()}`,
    session.access_token
  );
  if (!channelsRes.ok) {
    return json(channelsRes.body, { status: channelsRes.status });
  }
  const uploadsId = channelsRes.body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) {
    return json({ error: 'no_uploads_playlist', detail: channelsRes.body }, { status: 404 });
  }

  // Step 2: page through the uploads playlist for videoIds.
  const playlistParams = new URLSearchParams({
    part: 'contentDetails,snippet',
    playlistId: uploadsId,
    maxResults: String(maxResults),
  });
  if (pageToken) playlistParams.set('pageToken', pageToken);
  const playlistRes = await ytFetch<PlaylistItemsResponse>(
    `${YOUTUBE_API_BASE}/playlistItems?${playlistParams.toString()}`,
    session.access_token
  );
  if (!playlistRes.ok) {
    return json(playlistRes.body, { status: playlistRes.status });
  }
  const videoIds = (playlistRes.body.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (videoIds.length === 0) {
    return json({
      videos: [],
      nextPageToken: playlistRes.body.nextPageToken ?? null,
      prevPageToken: playlistRes.body.prevPageToken ?? null,
      uploads_playlist_id: uploadsId,
    });
  }

  // Step 3: fetch statistics for the page of videoIds.
  const videosParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails,status',
    id: videoIds.join(','),
  });
  const videosRes = await ytFetch(
    `${YOUTUBE_API_BASE}/videos?${videosParams.toString()}`,
    session.access_token
  );

  return json(
    {
      videos: (videosRes.body as { items?: unknown[] }).items ?? [],
      nextPageToken: playlistRes.body.nextPageToken ?? null,
      prevPageToken: playlistRes.body.prevPageToken ?? null,
      uploads_playlist_id: uploadsId,
      page_info: playlistRes.body.pageInfo,
    },
    { status: videosRes.status }
  );
}
