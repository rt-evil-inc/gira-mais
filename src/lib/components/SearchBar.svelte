<script lang="ts" module>
	let dismiss: (() => boolean)|null = null;

	/** Unfocus the search bar, closing its results; true if it was focused */
	export function dismissSearchBar(): boolean {
		return dismiss?.() ?? false;
	}
</script>

<script lang="ts">
	import { searchLocations, type GeocodingResult } from '$lib/geocoding';
	import { searchStations } from '$lib/station-search';
	import { addToSearchHistory, searchHistory, type SearchHistoryEntry } from '$lib/search-history';
	import { currentPos } from '$lib/location';
	import { selectedStation, stations, type StationInfo } from '$lib/map.svelte';
	import { currentRoute, routeDestination, routePending, type PlannedRoute } from '$lib/routing';
	import { currentTrip } from '$lib/trip';
	import { t } from '$lib/translations';
	import { Keyboard } from '@capacitor/keyboard';
	import { onMount } from 'svelte';
	import { IconBike, IconChevronRight, IconHistory, IconMapPin, IconSearch, IconWalk, IconX } from '@tabler/icons-svelte';
	import { cubicOut } from 'svelte/easing';
	import { get } from 'svelte/store';

	interface Props {
		/** Collapse into a round search button until tapped (landscape trips,
		  * where the map space is scarce and the HUD already shows the trip) */
		collapsible?: boolean;
	}

	let { collapsible = false }: Props = $props();

	let query = $state('');
	let results = $state<GeocodingResult[]|null>(null);
	let stationResults = $state<StationInfo[]>([]);
	let focused = $state(false);
	let expanded = $state(false);
	let input: HTMLInputElement|undefined = $state();
	let contentHeight = $state<number|null>(null);
	const collapsed = $derived(collapsible && !expanded);

	function expand() {
		expanded = true;
		input?.focus();
	}
	const showingHistory = $derived(focused && query.trim().length < 2 && $searchHistory.length > 0);
	const showingResults = $derived(focused && (results != null || stationResults.length > 0 || showingHistory));
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

	dismiss = () => {
		const wasFocused = focused;
		focused = false;
		expanded = false;
		input?.blur();
		return wasFocused;
	};

	// Dismissing the keyboard (Android back press, done key or a swipe down)
	// also closes the search. Android consumes that back press before the app
	// sees it, so the backButton handler alone would take two presses. Using
	// the native event — not an effect on the keyboard state — so that focusing
	// the bar can never re-trigger it
	onMount(() => {
		const listener = Keyboard.addListener('keyboardWillHide', () => dismiss?.()).catch(() => null); // not implemented on web
		return () => {
			listener.then(l => l?.remove());
		};
	});

	// Keep the input in sync with destinations set elsewhere (map tap, station tap)
	routeDestination.subscribe(destination => {
		clearTimeout(debounce);
		results = null;
		stationResults = [];
		query = destination?.name ?? '';
	});

	function onInput() {
		clearTimeout(debounce);
		const q = query.trim();
		if (q.length < 2) {
			results = null;
			stationResults = [];
			return;
		}
		const pos = get(currentPos);
		const bias = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
		// Stations are matched locally and shown right away, while the geocoder
		// results follow when they arrive
		stationResults = searchStations(stations.value, q, bias);
		debounce = setTimeout(async () => {
			try {
				const found = await searchLocations(q, bias);
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
		addToSearchHistory({ type: 'location', lat: result.lat, lng: result.lng, name: result.name });
		input?.blur();
	}

	function selectStation(station: StationInfo) {
		// Same path as tapping the station on the map: the route ends at the
		// station, and its menu opens
		selectedStation.set(station.serialNumber);
		routeDestination.set({ type: 'station', lat: station.latitude, lng: station.longitude, name: station.name, stationSerial: station.serialNumber });
		addToSearchHistory({ type: 'station', lat: station.latitude, lng: station.longitude, name: station.name, stationSerial: station.serialNumber });
		input?.blur();
	}

	function selectHistoryEntry(entry: SearchHistoryEntry) {
		if (entry.type === 'station') {
			const station = stations.value.find(s => s.serialNumber === entry.stationSerial && s.assetStatus === 'active');
			if (station) {
				selectStation(station);
				return;
			}
		}
		select({ name: entry.name, detail: '', lat: entry.lat, lng: entry.lng });
	}

	// The keyboard's search key selects the first visible row: the top station
	// match if any, else the top geocoder result — fetched right away when the
	// debounced search hasn't returned yet
	async function submit() {
		if (stationResults.length > 0) {
			selectStation(stationResults[0]);
			return;
		}
		if (results != null && results.length > 0) {
			select(results[0]);
			return;
		}
		clearTimeout(debounce);
		const q = query.trim();
		if (q.length < 2) return;
		try {
			const pos = get(currentPos);
			const found = await searchLocations(q, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null);
			if (q !== query.trim()) return;
			results = found;
			if (found.length > 0) select(found[0]);
		} catch (e) {
			console.error('Location search failed', e);
			results = [];
		}
	}

	function clear() {
		clearTimeout(debounce);
		// The subscription below also does this, but only when a destination was
		// set — clearing an unsubmitted query must not depend on it
		query = '';
		results = null;
		stationResults = [];
		routeDestination.set(null);
		// Unfocus in the same batch as emptying the query — waiting for the blur
		// timeout would flash the history list into the emptied bar
		dismiss?.();
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

<div class="flex flex-col items-start gap-2 pointer-events-none max-w-md">
	<div class="flex flex-col w-full">
		<!-- the pill keeps its full rounding; the route summary strip slides out
		from behind it (z-below), reading as a second attached layer. Collapsed,
		it morphs into a round button aligned with the other floating ones. The
		icon grows via a scale transform — animating its width/height re-layouts
		every frame and stutters -->
		<div class="pointer-events-auto relative z-10 flex items-center gap-2 h-12 overflow-hidden bg-background dark:bg-background-secondary rounded-full transition-all duration-200 {collapsed ? 'w-12 ml-1 px-3.5' : 'w-full px-4'}" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
			<IconSearch class="text-label shrink-0 transition-transform duration-200 {collapsed ? 'scale-[1.4]' : ''}" size="20" stroke="2.2" />
			<input
				bind:this={input}
				bind:value={query}
				oninput={onInput}
				onkeydown={e => e.key === 'Enter' && submit()}
				onfocus={() => focused = true}
				onblur={() => setTimeout(() => {
					focused = false;
					expanded = false;
				}, 150)}
				type="text"
				enterkeyhint="search"
				placeholder={$t('search_placeholder')}
				class="grow min-w-0 bg-transparent border-none focus:ring-0 p-0 text-info placeholder-label font-medium transition-opacity duration-200 {collapsed ? 'opacity-0' : ''}"
			/>
			{#if query.length > 0 || $routeDestination != null}
				<button onclick={clear} aria-label="Clear destination">
					<IconX class="text-label shrink-0" size="20" stroke="2" />
				</button>
			{/if}
			{#if collapsed}
				<!-- invisible tap target over the whole button — the input can't be
				the target, since tapping it would pop the keyboard mid-expansion -->
				<button class="absolute inset-0" onclick={expand} aria-label={$t('search_placeholder')}></button>
			{/if}
		</div>
		<!-- one extension surface behind the pill: the search results while typing,
			the route summary otherwise, animating its height between the two -->
		{#if showingResults || (lastRoute != null && showSummary)}
			<!-- the wrapper clips the extension at the bar's midline (where the pill
				is full-width), so it can never peek out above the bar while sliding;
				the padding, cancelled by negative margins, keeps the shadow visible.
				pointer-events-none so the widened wrapper never eats taps beside the
				bar — re-enabled on the surface itself -->
			<div class="relative -mt-6 -mx-8 -mb-8 px-8 pb-8 overflow-hidden pointer-events-none">
				<div transition:drawer use:resetContentHeight class="pointer-events-auto pt-6 rounded-b-[24px] bg-background-secondary dark:bg-background {$routePending && !showingResults ? 'animate-pulse' : ''}" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
					<!-- the summary height (h-10) is set synchronously with the mode
						switch — only the variable-height results list relies on the
						measured (and thus one-frame-stale) contentHeight -->
					<div class="transition-[height] duration-150 overflow-hidden" style:height={showingResults ? contentHeight != null ? contentHeight + 'px' : 'auto' : '40px'}>
						<div bind:clientHeight={contentHeight}>
							{#if showingResults}
								<div class="max-h-[40vh] overflow-y-auto py-2">
									{#if showingHistory}
										{#each $searchHistory as entry}
											<button class="flex items-center gap-3 w-full px-4 py-2 text-left" onclick={() => selectHistoryEntry(entry)}>
												<IconHistory class="text-label shrink-0" size="20" stroke="2" />
												<span class="text-info font-semibold text-sm truncate">{entry.name}</span>
											</button>
										{/each}
									{/if}
									{#each stationResults as station}
										<button class="flex items-center gap-3 w-full px-4 py-2 text-left" onclick={() => selectStation(station)}>
											<IconBike class="text-label shrink-0" size="20" stroke="2" />
											<div class="flex flex-col min-w-0">
												<span class="text-info font-semibold text-sm truncate">{station.name}</span>
												<span class="text-label text-xs truncate">{$t('station_availability', { bikes: station.bikes.toString(), docks: Math.max(station.docks - station.bikes, 0).toString() })}</span>
											</div>
										</button>
									{/each}
									{#each results ?? [] as result}
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
										{#if stationResults.length === 0 && results != null}
											<span class="block px-4 py-2 text-sm text-label">{$t('no_results_found')}</span>
										{/if}
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