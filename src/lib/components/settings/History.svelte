<script lang="ts">
	import type { TripHistory_TripDetail } from '$lib/gira-api/api-types';
	import { onMount } from 'svelte';
	import HistoryItem from '$lib/components/settings/HistoryItem.svelte';
	import { safeInsets } from '$lib/ui';
	import { fly } from 'svelte/transition';
	import MenuPage from '$lib/components/MenuPage.svelte';
	import { getTripHistory } from '$lib/gira-api/api';
	import { getLocale, t } from '$lib/translations';

	let trips:TripHistory_TripDetail[] = $state([]);
	let observed:HTMLDivElement|undefined = $state();
	let didFirstRequest = $state(false);
	let loading = false;
	let loadedAll = $state(false);
	const loadedPerPage = 15;

	async function loadMoreTripHistory() {
		if (loading) return;
		loading = true;
		const res = await getTripHistory(Math.floor(trips.length / loadedPerPage) + 1, loadedPerPage);
		didFirstRequest = true;
		if (res.tripHistory == null) return;
		if (res.tripHistory.length < loadedPerPage) loadedAll = true;
		trips = trips.concat(res.tripHistory.reduce((acc, cur) => {
			if (cur != null) acc.push(cur);
			return acc;
		}, [] as TripHistory_TripDetail[]));
		loading = false;
	}

	let observer:IntersectionObserver;
	onMount(() => {
		loadMoreTripHistory();
		const options = {
			rootMargin: '128px',
			threshold: 0.1,
		};
		function loadMoreTripHistoryProxy(entries:IntersectionObserverEntry[]) {
			if (entries[0].isIntersecting) loadMoreTripHistory();
		}
		observer = new IntersectionObserver(loadMoreTripHistoryProxy, options);
		if (observed) observer.observe(observed);
		return () => {
			observer.disconnect();
		};
	});

	let aggregate = $derived(Object.entries(trips.reduce((acc, cur) => {
		if (cur == null) return acc;
		const date = new Date(cur.startDate);
		const key = `${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`;
		if (acc[key] == null) acc[key] = [date.getTime(), []];
		acc[key][1].push(cur);
		return acc;
	}, {} as Record<string, [number, TripHistory_TripDetail[]]>)).sort((a, b) => {
		const aDate = new Date(a[0]);
		const bDate = new Date(b[0]);
		return bDate.getTime() - aDate.getTime();
	}));
</script>

<MenuPage>
	<div class="text-3xl font-bold text-info px-5 pt-5">{$t('trips_label')}</div>
	{#if didFirstRequest}
		{#if didFirstRequest && trips.length == 0}
			<div class="flex flex-col items-center justify-center h-full" style:margin-top={-$safeInsets.top - 32 + 'px'}>
				<div class="text-2xl font-bold text-info">{$t('no_trips_label')}</div>
				<div class="text-label text-sm text-center">{$t('no_trips_registered_label')}</div>
			</div>
		{:else}
			<div class="flex flex-col gap-6 p-5">
				{#each aggregate as [_, tripsObj]}
					<div transition:fly={{ y: 150 }} class="flex flex-col gap-3">
						<div class="font-semibold text-label text-sm">{new Date(tripsObj[0]).toLocaleString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</div>
						{#each tripsObj[1] as trip}
							<div transition:fly={{ y: 150 }}>
								<HistoryItem trip={trip} />
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-6 p-5">
			{#each new Array(4).fill(0) as _}
				<div class="flex flex-col gap-3">
					<div class="font-semibold text-label text-sm h-3 my-1 bg-neutral-100 rounded-xl animate-pulse dark:bg-background-secondary"
						style:width={(Math.random() * 15 + 40) + '%'}
					></div>
					{#each new Array(Math.floor(Math.random() * 3 + 1)).fill(0) as _}
						<HistoryItem trip={null} />
					{/each}
				</div>
			{/each}
		</div>
	{/if}
	{#if !loadedAll}
		<div class="mx-auto"
			class:hidden={trips.length == 0}
			style:padding-bottom={$safeInsets.bottom + 'px'}
			bind:this={observed}>
			<svg class="w-20 h-12 mb-4" width="62" height="38" viewBox="0 0 62 38" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M11.0862 26.6841L18.6347 20.9505C15.871 17.2807 10.0799 18.3456 7.56726 18.814C13.1653 19.8331 11.0862 26.6841 11.0862 26.6841Z" class="fill-primary"/>
				<path d="M11.0862 26.6848L20.8612 26.8514C20.5211 24.2944 19.7072 22.3752 18.6347 20.9512L11.0862 26.6848Z" class="fill-primary"/>
				<path d="M28.1018 26.9753L23.685 17.1157M28.1018 26.9753L42.185 10.4097M28.1018 26.9753L20.8612 26.8519M23.685 17.1157L19.7388 8.41601M23.685 17.1157L18.6347 20.9517M42.185 10.4097L46.638 22.118L50.2583 26.6853M42.185 10.4097L40.411 5.11738L44.7192 2L37.4785 2.39874M42.185 10.4097H46.245M20.8612 26.8519L11.0862 26.6853M20.8612 26.8519C20.5211 24.2949 19.7072 22.3757 18.6347 20.9517M19.7388 8.41601H16.6254M19.7388 8.41601H24.0833M11.0862 26.6853C11.0862 26.6853 13.1653 19.8343 7.56725 18.8152M11.0862 26.6853L18.6347 20.9517M7.56725 18.8152C10.0798 18.3468 15.871 17.282 18.6347 20.9517M7.56725 18.8152H2.987" class="stroke-primary" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
				<g class="animate-spin origin-[11.5026px_26.4977px]">
					<circle cx="11.5026" cy="26.4977" r="9.50259" class="stroke-primary" stroke-width="4"/>
					<path d="M2.10678 26.582H21.0676" class="stroke-primary"/>
					<path d="M6.84695 34.793L16.3274 18.3724" class="stroke-primary"/>
					<path d="M16.3274 34.793L6.84696 18.3724" class="stroke-primary"/>
				</g>
				<g class="animate-spin origin-[50.1864px_26.4903px]">
					<circle cx="50.1864" cy="26.4903" r="9.49523" class="stroke-primary" stroke-width="4"/>
					<path d="M40.7966 26.5762H59.7452" class="stroke-primary"/>
					<path d="M45.5337 34.7793L55.0081 18.3693" class="stroke-primary"/>
					<path d="M55.0081 34.7793L45.5337 18.3693" class="stroke-primary"/>
				</g>
			</svg>
		</div>
	{/if}
</MenuPage>