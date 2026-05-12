import { json } from '@sveltejs/kit';
import { ytPublicFetch, extractVideoId } from '$lib/server/youtube';

/**
 * GET /api/youtube/public/video?url=...     (or ?id=...)
 *
 * Path A: API-key-authed. Looks up ANY public YouTube video's snippet +
 * statistics + contentDetails. No OAuth required.
 *
 * This is the capability that TikTok cannot replicate — TikTok's
 * /v2/video/query/ only returns videos owned by the authenticated user.
 * YouTube's videos.list with an API key returns metadata + view/like/comment
 * counts for any public video.
 *
 * Forwards to: GET /youtube/v3/videos?id=...&part=snippet,statistics,contentDetails
 * Quota cost: 1 unit per call.
 */
export async function GET({ url }) {
  const explicitId = url.searchParams.get('id');
  const inputUrl = url.searchParams.get('url');

  const videoId = explicitId ?? (inputUrl ? extractVideoId(inputUrl) : null);
  if (!videoId) {
    return json(
      {
        error: 'could_not_extract_video_id',
        hint: 'Pass ?url=<youtube url> or ?id=<11-char video id>. Supported URL shapes: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/.',
      },
      { status: 400 }
    );
  }

  const res = await ytPublicFetch('/videos', {
    id: videoId,
    part: 'snippet,statistics,contentDetails,status,topicDetails',
  });

  return json(
    {
      video_id: videoId,
      embed_url: `https://www.youtube.com/embed/${videoId}`,
      ...((res.body as object) ?? {}),
    },
    { status: res.status }
  );
}
