import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_ORIGIN,
  YOUTUBE_API_KEY,
} from '$env/static/private';

export const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_ANALYTICS_API_BASE = 'https://youtubeanalytics.googleapis.com/v2';

export const GOOGLE_REDIRECT_URI = `${GOOGLE_REDIRECT_ORIGIN}/api/youtube/auth/callback`;

/**
 * Scopes used by Path B (OAuth).
 *
 * youtube.readonly        — list authenticated user's channels + uploads
 * yt-analytics.readonly   — Analytics reports (watch time, retention, audience)
 *                           ↑ this is what Path A (public, API-key only) can't see
 *
 * openid + email + profile let us identify the connected Google account in the
 * UI without hitting any extra API (the id_token is returned alongside the
 * access_token).
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const;

export const clientCreds = {
  id: GOOGLE_CLIENT_ID,
  secret: GOOGLE_CLIENT_SECRET,
};

export const apiKey = YOUTUBE_API_KEY;

export type YTResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
};

/** Bearer-authed GET against a Google API. */
export async function ytFetch<T = unknown>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<YTResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return parseResult<T>(res);
}

/** API-key-authed GET — used by Path A for public data. */
export async function ytPublicFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<YTResult<T>> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  search.set('key', apiKey);
  const url = `${YOUTUBE_API_BASE}${path}?${search.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  return parseResult<T>(res);
}

/** Form-urlencoded POST to Google's OAuth token endpoint. */
export async function googleOAuthFetch<T = unknown>(
  body: Record<string, string>
): Promise<YTResult<T>> {
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  return parseResult<T>(res);
}

async function parseResult<T>(res: Response): Promise<YTResult<T>> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { ok: res.ok, status: res.status, body: body as T };
}

/**
 * Extract a YouTube video id from a variety of URL shapes:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   https://youtu.be/dQw4w9WgXcQ
 *   https://www.youtube.com/shorts/dQw4w9WgXcQ
 *   https://www.youtube.com/embed/dQw4w9WgXcQ
 *   dQw4w9WgXcQ   (raw id passed through)
 *
 * Returns null if no recognizable id is found.
 */
export function extractVideoId(input: string): string | null {
  const s = input.trim();

  // Raw id (YouTube video ids are 11 chars: [A-Za-z0-9_-])
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;

  // youtube.com/watch?v=ID
  const watchMatch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/ID  or  youtube.com/{shorts,embed,v,live}/ID
  const pathMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts|embed|v|live)\/)([A-Za-z0-9_-]{11})/);
  if (pathMatch) return pathMatch[1];

  return null;
}

/**
 * Channel ids on YouTube come in several flavors:
 *   - UC...  → canonical channel id (24 chars, starts with UC)
 *   - @handle → modern channel handle (e.g. @mkbhd)
 *   - custom URL (e.g. /c/MKBHD) — these are NOT resolvable via API key alone
 *
 * Returns either:
 *   { type: 'id', value: 'UC...' }
 *   { type: 'handle', value: 'mkbhd' }    (no leading @)
 *   null
 */
export function extractChannelRef(
  input: string
): { type: 'id'; value: string } | { type: 'handle'; value: string } | null {
  const s = input.trim();

  // Raw channel id
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { type: 'id', value: s };

  // Raw @handle
  if (/^@[\w.-]+$/.test(s)) return { type: 'handle', value: s.slice(1) };

  // URL with /channel/UC...
  const idMatch = s.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (idMatch) return { type: 'id', value: idMatch[1] };

  // URL with /@handle
  const handleMatch = s.match(/youtube\.com\/@([\w.-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };

  return null;
}
