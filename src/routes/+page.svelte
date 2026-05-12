<script lang="ts">
	import { onMount } from 'svelte';

	type Me =
		| { connected: false }
		| {
				connected: true;
				email: string;
				expires_at: number;
				has_refresh_token: boolean;
				scope: string;
		  };

	let me = $state<Me>({ connected: false });
	let connectError = $state<string | null>(null);

	// Path A inputs
	let publicVideoInput = $state('');
	let publicChannelInput = $state('');

	// Path B inputs
	let analyticsVideoId = $state('');

	// Result panes
	let resultLabel = $state<string>('');
	let resultJson = $state<unknown>(null);
	let resultStatus = $state<number | null>(null);
	let busy = $state(false);

	// Currently embedded video id (for the iframe player)
	let embedVideoId = $state<string | null>(null);

	onMount(async () => {
		const url = new URL(window.location.href);
		const err = url.searchParams.get('connect_error');
		if (err) {
			connectError = `${err}: ${url.searchParams.get('error_description') ?? ''}`;
			url.searchParams.delete('connect_error');
			url.searchParams.delete('error_description');
			window.history.replaceState(null, '', url.toString());
		}
		await refreshMe();
	});

	async function refreshMe() {
		const res = await fetch('/api/youtube/auth/me');
		me = await res.json();
	}

	async function connect() {
		connectError = null;
		const res = await fetch('/api/youtube/auth/url');
		const { authorize_url } = (await res.json()) as { authorize_url: string };
		window.location.href = authorize_url;
	}

	async function logout() {
		await fetch('/api/youtube/auth/logout', { method: 'POST' });
		await refreshMe();
		resultLabel = '';
		resultJson = null;
		resultStatus = null;
		embedVideoId = null;
	}

	async function refreshToken() {
		await callEndpoint('refresh access_token', '/api/youtube/auth/refresh', { method: 'POST' });
		await refreshMe();
	}

	async function callEndpoint(label: string, path: string, init: RequestInit = {}) {
		busy = true;
		resultLabel = label;
		resultJson = null;
		resultStatus = null;
		try {
			const res = await fetch(path, init);
			resultStatus = res.status;
			const text = await res.text();
			try {
				resultJson = text ? JSON.parse(text) : null;
			} catch {
				resultJson = text;
			}
		} finally {
			busy = false;
		}
	}

	function playEmbedFromResult() {
		// Try to pull a video id out of the most recent result for the iframe.
		const data = resultJson as Record<string, unknown> | null;
		if (!data) return;
		if (typeof data.video_id === 'string') {
			embedVideoId = data.video_id;
			return;
		}
		const items = (data as { items?: Array<{ id?: string }> }).items;
		if (Array.isArray(items) && items[0]?.id) {
			embedVideoId = items[0].id;
		}
	}

	const connected = $derived(me.connected);
</script>

<svelte:head>
	<title>Vizzy YouTube Demo</title>
</svelte:head>

<main>
	<header>
		<h1>Vizzy YouTube Demo</h1>
		<p class="sub">
			SvelteKit demo of two YouTube data paths: <strong>Path A</strong> (API key, public data on any
			channel) and <strong>Path B</strong> (OAuth, private Analytics on the connected creator's own
			channel).
		</p>
	</header>

	{#if connectError}
		<div class="banner err">⚠️ {connectError}</div>
	{/if}

	<!-- =================== Path A: public, API key =================== -->
	<section>
		<h2>Path A — Public (API Key)</h2>

		<div class="row">
			<input
				type="text"
				placeholder="Paste YouTube video URL or 11-char id"
				bind:value={publicVideoInput}
			/>
			<button
				disabled={busy || !publicVideoInput.trim()}
				onclick={() =>
					callEndpoint(
						'GET /api/youtube/public/video',
						`/api/youtube/public/video?url=${encodeURIComponent(publicVideoInput.trim())}`
					)}
			>
				Look up video
			</button>
		</div>

		<div class="row">
			<input
				type="text"
				placeholder="Channel URL / @handle / UC… id"
				bind:value={publicChannelInput}
			/>
			<button
				disabled={busy || !publicChannelInput.trim()}
				onclick={() =>
					callEndpoint(
						'GET /api/youtube/public/channel',
						`/api/youtube/public/channel?url=${encodeURIComponent(publicChannelInput.trim())}`
					)}
			>
				Look up channel
			</button>
			<button
				disabled={busy || !publicChannelInput.trim()}
				onclick={() =>
					callEndpoint(
						'GET /api/youtube/public/channel/videos',
						`/api/youtube/public/channel/videos?url=${encodeURIComponent(publicChannelInput.trim())}&max_results=20`
					)}
			>
				List channel uploads
			</button>
		</div>
	</section>

	<!-- =================== Path B: OAuth + Analytics =================== -->
	<section>
		<h2>Path B — Connected creator (OAuth + Analytics)</h2>

		{#if !connected}
			<button class="primary" onclick={connect}>Connect YouTube</button>
		{:else}
			<div class="status">
				<span class="dot ok"></span>
				Connected as <strong>{me.connected ? me.email : ''}</strong>
				<span class="muted">
					· token expires {me.connected ? new Date(me.expires_at).toLocaleString() : ''}
					· refresh_token: {me.connected && me.has_refresh_token ? 'yes' : 'no'}
				</span>
			</div>

			<div class="row">
				<button
					disabled={busy}
					onclick={() => callEndpoint('GET /api/youtube/my/channel', '/api/youtube/my/channel')}
				>
					My channel
				</button>
				<button
					disabled={busy}
					onclick={() =>
						callEndpoint('GET /api/youtube/my/videos', '/api/youtube/my/videos?max_results=20')}
				>
					My videos
				</button>
				<button
					disabled={busy}
					onclick={() =>
						callEndpoint(
							'GET /api/youtube/analytics/report (last 28 days)',
							'/api/youtube/analytics/report'
						)}
				>
					Analytics — channel (28d)
				</button>
				<button disabled={busy} onclick={refreshToken}>Refresh access_token</button>
				<button disabled={busy} onclick={logout}>Logout</button>
			</div>

			<div class="row">
				<input
					type="text"
					placeholder="video_id (optional, restrict Analytics to one video)"
					bind:value={analyticsVideoId}
				/>
				<button
					disabled={busy || !analyticsVideoId.trim()}
					onclick={() =>
						callEndpoint(
							'GET /api/youtube/analytics/report?video_id=…',
							`/api/youtube/analytics/report?video_id=${encodeURIComponent(analyticsVideoId.trim())}`
						)}
				>
					Analytics — single video
				</button>
				<button
					disabled={busy || !analyticsVideoId.trim()}
					onclick={() =>
						callEndpoint(
							'Analytics — audience retention',
							`/api/youtube/analytics/report?video_id=${encodeURIComponent(analyticsVideoId.trim())}&metrics=audienceWatchRatio,relativeRetentionPerformance&dimensions=elapsedVideoTimeRatio`
						)}
				>
					Retention curve
				</button>
			</div>
		{/if}
	</section>

	<!-- =================== Result pane =================== -->
	{#if resultLabel}
		<section>
			<h2>
				Result <span class="muted">— {resultLabel} {resultStatus ? `(${resultStatus})` : ''}</span>
			</h2>
			<div class="row">
				<button disabled={!resultJson} onclick={playEmbedFromResult}>
					Embed video from result
				</button>
				<button
					disabled={!resultJson}
					onclick={() => {
						embedVideoId = null;
					}}
				>
					Clear embed
				</button>
			</div>
			{#if embedVideoId}
				<div class="embed">
					<iframe
						src={`https://www.youtube.com/embed/${embedVideoId}`}
						title="YouTube video"
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					></iframe>
				</div>
			{/if}
			<pre>{JSON.stringify(resultJson, null, 2)}</pre>
		</section>
	{/if}

</main>

<style>
	:global(html, body) {
		margin: 0;
		font-family:
			ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #0d0d10;
		color: #e7e7ea;
	}
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	header h1 {
		margin: 0 0 0.25rem;
		font-size: 1.75rem;
	}
	.sub {
		margin: 0 0 1.5rem;
		color: #aaa;
	}
	section {
		background: #15151a;
		border: 1px solid #25252c;
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}
	section h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	input[type='text'] {
		flex: 1 1 240px;
		min-width: 0;
		padding: 0.55rem 0.75rem;
		border-radius: 8px;
		border: 1px solid #2e2e36;
		background: #0d0d10;
		color: #e7e7ea;
		font: inherit;
	}
	button {
		padding: 0.55rem 0.9rem;
		border-radius: 8px;
		border: 1px solid #2e2e36;
		background: #1f1f26;
		color: #e7e7ea;
		font: inherit;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		background: #2a2a32;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.primary {
		background: #ff0033;
		border-color: #ff0033;
		color: #fff;
	}
	button.primary:hover {
		background: #d4002a;
	}
	.banner.err {
		background: #3a1a1a;
		border: 1px solid #6a2a2a;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		color: #ffb4b4;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		font-size: 0.95rem;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
	}
	.dot.ok {
		background: #3ad07f;
	}
	.muted {
		color: #8c8c93;
		font-weight: normal;
	}
	pre {
		background: #0a0a0d;
		border: 1px solid #25252c;
		padding: 0.75rem;
		border-radius: 8px;
		max-height: 60vh;
		overflow: auto;
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.embed {
		position: relative;
		padding-top: 56.25%;
		margin: 0.75rem 0;
		border-radius: 8px;
		overflow: hidden;
	}
	.embed iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
</style>
