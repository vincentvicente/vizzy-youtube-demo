import { json } from '@sveltejs/kit';
import { ytPublicFetch, extractChannelRef } from '$lib/server/youtube';

type ChannelsListResponse = {
  items?: Array<{
    id?: string;
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
 * GET /api/youtube/public/channel/videos?
 *     url=... | id=UC... | handle=name
 *     &max_results=20 &page_token=...
 *
 * Path A: list any public channel's recent uploads with statistics.
 *
 * Implementation mirrors /api/youtube/my/videos but with API key auth instead
 * of OAuth. Same 3-call sequence (channels → playlistItems → videos), same
 * ~3 quota units per page. Avoids search.list (100 units).
 */
export async function GET({ url }) {
  const explicitId = url.searchParams.get('id');
  const explicitHandle = url.searchParams.get('handle');
  const inputUrl = url.searchParams.get('url');

  let ref: { type: 'id' | 'handle'; value: string } | null = null;
  if (explicitId) ref = { type: 'id', value: explicitId };
  else if (explicitHandle) ref = { type: 'handle', value: explicitHandle.replace(/^@/, '') };
  else if (inputUrl) ref = extractChannelRef(inputUrl);

  if (!ref) {
    return json(
      {
        error: 'could_not_extract_channel_ref',
        hint: 'Pass ?url=<youtube channel url>, ?id=UC..., or ?handle=name.',
      },
      { status: 400 }
    );
  }

  const maxResults = Math.min(Number(url.searchParams.get('max_results') ?? '20'), 50);
  const pageToken = url.searchParams.get('page_token') ?? '';

  // Step 1: resolve uploads playlist for this channel.
  const channelParams: Record<string, string> = {
    part: 'contentDetails,snippet',
  };
  if (ref.type === 'id') channelParams.id = ref.value;
  else channelParams.forHandle = `@${ref.value}`;

  const channelRes = await ytPublicFetch<ChannelsListResponse>('/channels', channelParams);
  if (!channelRes.ok) {
    return json(channelRes.body, { status: channelRes.status });
  }
  const channelItem = channelRes.body.items?.[0];
  const uploadsId = channelItem?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) {
    return json(
      { error: 'no_uploads_playlist_or_channel_not_found', ref, detail: channelRes.body },
      { status: 404 }
    );
  }

  // Step 2: page the uploads playlist.
  const playlistParams: Record<string, string | number> = {
    part: 'contentDetails,snippet',
    playlistId: uploadsId,
    maxResults,
  };
  if (pageToken) playlistParams.pageToken = pageToken;

  const playlistRes = await ytPublicFetch<PlaylistItemsResponse>('/playlistItems', playlistParams);
  if (!playlistRes.ok) {
    return json(playlistRes.body, { status: playlistRes.status });
  }
  const videoIds = (playlistRes.body.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (videoIds.length === 0) {
    return json({
      channel_id: channelItem?.id,
      uploads_playlist_id: uploadsId,
      videos: [],
      nextPageToken: playlistRes.body.nextPageToken ?? null,
      prevPageToken: playlistRes.body.prevPageToken ?? null,
    });
  }

  // Step 3: stats for the page.
  const videosRes = await ytPublicFetch('/videos', {
    part: 'snippet,statistics,contentDetails,status',
    id: videoIds.join(','),
  });

  return json(
    {
      channel_id: channelItem?.id,
      uploads_playlist_id: uploadsId,
      videos: (videosRes.body as { items?: unknown[] }).items ?? [],
      nextPageToken: playlistRes.body.nextPageToken ?? null,
      prevPageToken: playlistRes.body.prevPageToken ?? null,
      page_info: playlistRes.body.pageInfo,
    },
    { status: videosRes.status }
  );
}
