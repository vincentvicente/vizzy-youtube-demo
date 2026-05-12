# vizzy-youtube-demo

SvelteKit demo of two YouTube data paths: **Path A** (API key, public data on
any channel) and **Path B** (OAuth, private Analytics on the connected
creator's own channel).

YouTube counterpart to `vizzy-tiktok-demo`.

---

## What this demo does

**Path A — Public (API key only)**
1. Paste any YouTube video URL → `videos.list` → snippet + statistics + contentDetails.
2. Paste any channel URL / `@handle` / `UC…` id → `channels.list` → snippet + statistics + uploads playlist.
3. List that channel's recent uploads with per-video statistics — implemented via `channels.list` → `playlistItems.list` → `videos.list`, **not** `search.list` (which costs 100 quota units per call vs. ~3 for this path).

**Path B — OAuth (connected creator's private Analytics)**
1. Google OAuth 2.0 → server holds `access_token` + `refresh_token`.
2. `channels.list?mine=true` → connected creator's own channel.
3. Page through their uploads with full statistics.
4. `youtubeAnalytics.reports.query` for last 28 days at the channel level — `views`, `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`, `likes`, `comments`, `shares`, `subscribersGained`.
5. Optional: same call filtered to a single `video_id`, or pulling the
   `audienceWatchRatio` retention curve (`dimensions=elapsedVideoTimeRatio`).
6. Manual `refresh_token` rotation button + `logout` that calls Google's
   revoke endpoint.

Why this matters for Vizzy: the Analytics metrics in Path B are **private** to
the channel owner. Public API-key polling cannot return watch time, retention,
or audience demographics. Path B is what makes "signed creator" data
qualitatively different from "any public creator."

---

## Differences from the TikTok demo

| Aspect | TikTok demo | YouTube demo |
|---|---|---|
| Public-data path | ❌ Not possible — `/v2/video/query/` returns only the authenticated user's videos | ✅ Path A works on any public video/channel |
| OAuth purpose | Required for every read (incl. own basic info) | Required only for **private Analytics** |
| Callback URL | Must be public HTTPS (needs ngrok) | `http://localhost:5173` is accepted — **no tunnel needed** |
| Sandbox / test users | Sandbox app, max 10 target users | OAuth Testing mode, max 100 test users |
| Refresh token | 365-day lifetime | No fixed expiry (revoked only by user / 6 months idle / scope change) |
| Refresh token issuance | Returned on every token exchange | Returned **only on first consent** unless `prompt=consent` is sent — this demo always does |
| Video playback | TikTok iframe only, no mp4 | Standard `youtube.com/embed/{id}` iframe |
| Quota | None published | 10,000 units/day default; avoid `search.list` (100 u/call) |

---

## Local deployment

Prerequisites: Node 18+, npm, a Google Cloud project with the YouTube Data API
v3 and YouTube Analytics API enabled, and a Google account on the OAuth
consent screen's Test Users list with a YouTube channel.

### 1. Configure Google Cloud Console

In `console.cloud.google.com`:

1. Create a project (e.g. `vizzy-youtube-demo`).
2. **API and services → 库** — enable `YouTube Data API v3` and `YouTube Analytics API`.
3. **Google Auth Platform**:
   - **品牌塑造**: set app name, support email, developer contact.
   - **目标对象**: user type = External; add the Google email you'll test with to Test users.
   - **数据访问**: add scopes `youtube.readonly` and `yt-analytics.readonly`.
   - **客户端**: create a Web application client. Set:
     - Authorized JavaScript origin: `http://localhost:5173`
     - Authorized redirect URI: `http://localhost:5173/api/youtube/auth/callback`
4. **API and services → 凭据** — create an API key, restrict to YouTube Data API v3.

You should end up with three values:
- OAuth client ID (ends with `.apps.googleusercontent.com`)
- OAuth client secret (starts with `GOCSPX-`)
- API key (starts with `AIza`)

### 2. Clone + install

```bash
git clone <this repo>
cd vizzy-youtube-demo
npm install
cp .env.example .env
```

Fill `.env`:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
YOUTUBE_API_KEY=AIza...
GOOGLE_REDIRECT_ORIGIN=http://localhost:5173
```

### 3. Run

```bash
npm run dev
# → http://localhost:5173
```

Open `http://localhost:5173`. Try Path A first with any public YouTube URL —
this validates the API key + project setup before involving OAuth. Then click
**Connect YouTube** for Path B.

---

## Endpoints

All endpoints proxy a single upstream call (except `/my/videos` and
`/public/channel/videos`, which chain `channels.list` → `playlistItems.list`
→ `videos.list` to avoid the expensive `search.list`).

| Method | Path | Forwards to | Auth |
|---|---|---|---|
| GET  | `/api/youtube/auth/url` | builds `accounts.google.com/o/oauth2/v2/auth` URL with CSRF state | — |
| GET  | `/api/youtube/auth/callback` | `POST /token` (grant=authorization_code) | — |
| POST | `/api/youtube/auth/refresh` | `POST /token` (grant=refresh_token) | session |
| GET  | `/api/youtube/auth/me` | reports session state | session |
| POST | `/api/youtube/auth/logout` | `POST /revoke` + drops session | session |
| GET  | `/api/youtube/public/video?url=…` | `GET /videos` | API key |
| GET  | `/api/youtube/public/channel?url=…` | `GET /channels` | API key |
| GET  | `/api/youtube/public/channel/videos?url=…` | `channels` → `playlistItems` → `videos` | API key |
| GET  | `/api/youtube/my/channel` | `GET /channels?mine=true` | OAuth |
| GET  | `/api/youtube/my/videos?max_results=…&page_token=…` | `channels.mine` → `playlistItems` → `videos` | OAuth |
| GET  | `/api/youtube/analytics/report?metrics=…&dimensions=…&start_date=…&end_date=…&video_id=…` | `youtubeAnalytics.reports.query` | OAuth |

The browser never sees `client_secret`, `access_token`, `refresh_token`, or
the API key — all Google calls are server-side, fronted by an HttpOnly
session cookie (`yt_sid`) that's just an opaque key into a server-memory token
map.

---

## Platform capability matrix

Verified via the endpoints above. "Verified ✅" means the response shape was
inspected end-to-end with a real channel.

| Data | Path A (public, API key) | Path B (OAuth, channel owner) | Notes |
|---|---|---|---|
| Video snippet (title, description, thumbnails) | ✅ | ✅ | |
| Video statistics (views, likes, comments) | ✅ | ✅ | `dislikeCount` was removed by YouTube; never returned |
| Video contentDetails (duration, caption flag) | ✅ | ✅ | |
| Channel snippet + statistics (subscribers, total views) | ✅ | ✅ | `hiddenSubscriberCount: true` channels return `subscriberCount: 0` |
| Channel uploads list | ✅ | ✅ | Use uploads playlist, not search |
| Private video metadata | ❌ | ✅ | Only the channel owner can see unlisted/private |
| Watch time / avg view duration / % | ❌ | ✅ | YouTube Analytics API — Path A literally cannot return |
| Audience demographics (age / gender / geography) | ❌ | ✅ | Aggregated only after a channel has enough activity |
| Retention curve (`audienceWatchRatio`) | ❌ | ✅ | Per-video, per video-time-decile |
| Traffic source breakdown | ❌ | ✅ | |
| Revenue / RPM | ❌ | ⚠️ Needs `yt-analytics-monetary.readonly` (not in this demo's scopes) | |

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| OAuth consent screen says "Access blocked: This app is not verified" | The Google account you're signing in with is not on the Test users list. Add it in Google Auth Platform → 目标对象. |
| `redirect_uri_mismatch` | The redirect URI in the OAuth client config must EXACTLY match `${GOOGLE_REDIRECT_ORIGIN}/api/youtube/auth/callback`. Trailing slash, port, and scheme all matter. |
| `403 accessNotConfigured` | The relevant API isn't enabled on the Cloud project (Data API v3 for Path A, Analytics API for Path B). |
| Path B works but `analytics/report` returns empty `rows: []` | The channel has too little activity in the requested window. Widen the date range or use an older channel. |
| `quotaExceeded` | Default daily quota is 10,000 units. Don't use `search.list` (100 u/call); the demo deliberately avoids it. |
| Refresh button returns `no_refresh_token` | Google withholds `refresh_token` if the user has previously consented and `prompt=consent` wasn't sent. The demo always sends it, but if you somehow got into this state: logout, then connect again. |
| `keyInvalid` on Path A | API key was restricted to a different API. Loosen API restrictions in Cloud Console → Credentials. |

---

## Project layout

```
src/
  lib/server/
    youtube.ts          # fetch helpers (OAuth + API-key), scopes, URL parsers
    youtubeSession.ts   # in-memory token store + cookie helpers + id_token decode
  routes/
    +page.svelte        # the demo UI
    +layout.svelte
    api/youtube/
      auth/
        url/+server.ts       # builds Google authorize URL with CSRF state
        callback/+server.ts  # code → access_token + refresh_token + id_token
        refresh/+server.ts   # refresh_token → access_token
        me/+server.ts        # session probe for the UI
        logout/+server.ts    # revoke + drop session
      public/                # Path A: API-key only
        video/+server.ts          # videos.list by URL/id
        channel/+server.ts        # channels.list by url/@handle/id
        channel/videos/+server.ts # uploads playlist + per-video stats
      my/                    # Path B: OAuth
        channel/+server.ts        # channels.list?mine=true
        videos/+server.ts         # own uploads + per-video stats
      analytics/
        report/+server.ts         # youtubeAnalytics.reports.query
static/
```

---

## From demo to production

- **Persist per-creator tokens** in DB with encrypted `refresh_token`. Add an
  `expires_at` index and a background job that refreshes ~5 min before expiry.
- **Wrap `ytFetch` with auto-retry on 401**, refreshing then replaying.
- **Lift Testing mode**: submitting the OAuth consent screen for verification
  removes the 100-test-user cap. Sensitive-scope verification (which
  `yt-analytics.readonly` is) takes longer (weeks) and requires a homepage,
  privacy policy, and a recorded demo.
- **Cache aggressively**. Public stats change slowly relative to quota cost.
- **Switch session cookie to `secure: true`** when deployed behind HTTPS.

---

## License

Internal demo, unlicensed.
