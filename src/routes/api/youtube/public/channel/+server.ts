import { json } from '@sveltejs/kit';
import { ytPublicFetch, extractChannelRef } from '$lib/server/youtube';

/**
 * GET /api/youtube/public/channel?url=...   (or ?id=UC... or ?handle=name)
 *
 * Path A: API-key-authed channel lookup. Accepts:
 *   - Canonical channel id (UC...)
 *   - @handle (with or without leading @)
 *   - youtube.com/@handle URL
 *   - youtube.com/channel/UC... URL
 *
 * Forwards to: GET /youtube/v3/channels
 * Quota cost: 1 unit per call.
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
        hint: 'Pass ?url=<youtube channel url>, ?id=UC..., or ?handle=name. Custom URLs like youtube.com/c/Name cannot be resolved via API key alone.',
      },
      { status: 400 }
    );
  }

  const params: Record<string, string> = {
    part: 'snippet,statistics,contentDetails,brandingSettings,topicDetails',
  };
  if (ref.type === 'id') {
    params.id = ref.value;
  } else {
    params.forHandle = `@${ref.value}`;
  }

  const res = await ytPublicFetch('/channels', params);
  return json(
    { ref, ...((res.body as object) ?? {}) },
    { status: res.status }
  );
}
