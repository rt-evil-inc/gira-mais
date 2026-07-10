<script lang="ts">
	import { searchLocations, type GeocodingResult } from '$lib/geocoding';
	import { currentPos } from '$lib/location';
	import { selectedStation } from '$lib/map.svelte';
	import { currentRoute, routeDestination, routePending, type PlannedRoute } from '$lib/routing';
	import { currentTrip } from '$lib/trip';
	import { t } from '$lib/translations';
	import { IconBike, IconChevronRight, IconMapPin, IconSearch, IconWalk, IconX } from '@tabler/icons-svelte';
	import { cubicOut } from 'svelte/easing';
	import { get } from 'svelte/store';

	let query = $state('');
	let results = $state<GeocodingResult[]|null>(null);
	let focused = $state(false);
	let input: HTMLInputElement|undefined = $state();
	let contentHeight = $state<number|null>(null);
	let debounce: ReturnType<typeof setTimeout>;

	// Delay showing the summary slightly after a route arrives, so that when a
	// dismissal is immediately followed by a new route (e.g. picking a search
	// result), the drawer always finishes folding before it opens again — the
	// two never overlap into a single jerky resize-while-sliding motion
	let showSummary = $state(false);
	$effect(() => {
		if ($currentRoute != null && $currentTrip == null) {
			const timeout = setTimeout(() => showSummary = true, 200);
			return () => clearTimeout(timeout);
		}
		showSummary = false;
	});

	// Keep the input in sync with destinations set elsewhere (map tap, station tap)
	routeDestination.subscribe(destination => {
		clearTimeout(debounce);
		results = null;
		query = destination ? destination.name ?? get(t)('selected_location') : '';
	});

	function onInput() {
		clearTimeout(debounce);
		const q = query.trim();
		if (q.length < 2) {
			results = null;
			return;
		}
		debounce = setTimeout(async () => {
			try {
				const pos = get(currentPos);
				const found = await searchLocations(q, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null);
				if (q === query.trim()) results = found;
			} catch (e) {
				console.error('Location search failed', e);
				results = [];
			}
		}, 300);
	}

	function select(result: GeocodingResult) {
		selectedStation.set(null);
		routeDestination.set({ type: 'location', lat: result.lat, lng: result.lng, name: result.name });
		input?.blur();
	}

	function clear() {
		clearTimeout(debounce);
		routeDestination.set(null);
	}

	// Snapshot of the last non-null route, so the summary still has content to
	// render while it slides back behind the bar after the route is dismissed
	let lastRoute = $state<PlannedRoute|null>(null);
	currentRoute.subscribe(route => {
		if (route) lastRoute = route;
	});

	// Slides the summary strip rigidly out from / back behind the bar, like a
	// drawer: translating (instead of growing height, as slide does) keeps the
	// hidden top of the strip filling the voids beside the bar's rounded corners
	// and moves the text together with the strip. The opacity ramp only kicks in
	// once the strip is almost fully tucked in, hiding the final corner slivers.
	function drawer(node: Element, { duration = 150 } = {}) {
		const height = (node as HTMLElement).offsetHeight - 24; // exposed below the bar
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `transform: translateY(${(t - 1) * height}px); opacity: ${Math.min(1, t / 0.4)}`,
		};
	}

	// The height morph should only animate while the extension stays mounted
	// (results ↔ summary). After it folds away, forget the measured height so a
	// remounted drawer starts at its natural height instead of animating down
	// from the stale one
	function resetContentHeight(_node: Element) {
		return {
			destroy() {
				contentHeight = null;
			},
		};
	}

	function legMinutes(seconds: number) {
		return Math.max(1, Math.round(seconds / 60));
	}

	function formatTime(date: Date) {
		return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
	}
</script>

<div class="flex flex-col items-start gap-2">
	<div class="flex flex-col w-full">
		<!-- the pill keeps its full rounding; the route summary strip slides out
			from behind it (z-below), reading as a second attached layer -->
		<div class="relative z-10 flex items-center gap-2 w-full h-12 px-4 bg-background dark:bg-background-secondary rounded-full" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
			<IconSearch class="text-label shrink-0" size="20" stroke="2" />
			<input
				bind:this={input}
				bind:value={query}
				oninput={onInput}
				onfocus={() => focused = true}
				onblur={() => setTimeout(() => focused = false, 150)}
				type="text"
				enterkeyhint="search"
				placeholder={$t('search_placeholder')}
				class="grow min-w-0 bg-transparent border-none focus:ring-0 p-0 text-info placeholder-label font-medium"
			/>
			{#if query.length > 0 || $routeDestination != null}
				<button onclick={clear} aria-label="Clear destination">
					<IconX class="text-label shrink-0" size="20" stroke="2" />
				</button>
			{/if}
		</div>
		<!-- one extension surface behind the pill: the search results while typing,
			the route summary otherwise, animating its height between the two -->
		{#if (focused && results != null) || (lastRoute != null && showSummary)}
			<!-- the wrapper clips the extension at the bar's midline (where the pill
				is full-width), so it can never peek out above the bar while sliding;
				the padding, cancelled by negative margins, keeps the shadow visible.
				pointer-events-none so the widened wrapper never eats taps beside the
				bar — re-enabled on the surface itself -->
			<div class="relative -mt-6 -mx-8 -mb-8 px-8 pb-8 overflow-hidden pointer-events-none">
				<div transition:drawer use:resetContentHeight class="pointer-events-auto pt-6 rounded-b-[24px] bg-background-secondary dark:bg-background {$routePending && !(focused && results != null) ? 'animate-pulse' : ''}" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
					<!-- the summary height (h-10) is set synchronously with the mode
						switch — only the variable-height results list relies on the
						measured (and thus one-frame-stale) contentHeight -->
					<div class="transition-[height] duration-150 overflow-hidden" style:height={focused && results != null ? contentHeight != null ? contentHeight + 'px' : 'auto' : '40px'}>
						<div bind:clientHeight={contentHeight}>
							{#if focused && results != null}
								<div class="max-h-[40vh] overflow-y-auto py-2">
									{#each results as result}
										<button class="flex items-center gap-3 w-full px-4 py-2 text-left" onclick={() => select(result)}>
											<IconMapPin class="text-label shrink-0" size="20" stroke="2" />
											<div class="flex flex-col min-w-0">
												<span class="text-info font-semibold text-sm truncate">{result.name}</span>
												{#if result.detail}
													<span class="text-label text-xs truncate">{result.detail}</span>
												{/if}
											</div>
										</button>
									{:else}
										<span class="block px-4 py-2 text-sm text-label">{$t('no_results_found')}</span>
									{/each}
								</div>
							{:else if lastRoute}
								<!-- during a trip the TripStatus HUD already shows this information -->
								{@const route = lastRoute}
								<div class="flex items-center gap-1 h-10 px-4 text-info text-sm font-semibold">
									{#each route.legs as leg, i}
										{#if i > 0}
											<IconChevronRight class="text-label shrink-0" size="14" stroke="2.5" />
										{/if}
										{#if leg.mode === 'bike'}
											<IconBike class="text-primary shrink-0" size="18" stroke="2" />
										{:else}
											<IconWalk class="text-primary shrink-0" size="18" stroke="2" />
										{/if}
										<span>{legMinutes(leg.duration)}</span>
									{/each}
									<span class="text-label font-medium ml-1">·</span>
									<span class="ml-1">{formatTime(new Date(Date.now() + route.totalDuration * 1000))}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>