<script lang="ts">
	import Bike from '$lib/components/Bike.svelte';
	import BikeSkeleton from '$lib/components/BikeSkeleton.svelte';
	import { getStationBikeRatings } from '$lib/gira-mais-api/gira-mais-api';
	import { reportApiError } from '$lib/error-reporting';
	import type { StationBikeRating } from '$lib/gira-mais-api/types';
	import { subscribeStationBikes } from '$lib/gira-api/api';
	import type { AvailableBike } from '$lib/gira-api/models';
	import { currentPos } from '$lib/location';
	import { selectedStation, stations } from '$lib/map.svelte';
	import { t } from '$lib/translations';
	import type { UnlockSubject } from '$lib/unlock-reporting';
	import { safeInsets } from '$lib/ui.svelte';
	import { distanceBetweenCoords, formatDistance } from '$lib/utils';
	import IconInfoCircle from '@tabler/icons-svelte/icons/info-circle';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	interface Props {
		// The sheet's full height once open (header + list), for padding the map
		height?: number;
		posTop?: number|undefined;
		anchorTop?: number|undefined;
	}

	let { height = $bindable(0), posTop = $bindable<number|undefined>(0), anchorTop = $bindable<number|undefined>(undefined) }: Props = $props();
	let bikeListHeight = $state(0);

	let initPos = 0;
	let pos = new Tween($selectedStation != null ? 0 : 9999, {
		duration: 150,
		easing: cubicOut,
	});
	let dragged:HTMLDivElement;
	let dismiss = () => {
		pos.set(dragged.clientHeight);
		$selectedStation = null;
	};
	let station = $derived.by(() => {
		if (stations.value) {
			return stations.value.find(s => s.serialNumber == $selectedStation);
		}
		return undefined;
	});

	// Station names look like "777 - Emel Station"; tolerate names without a dash.
	let nameParts = $derived((station?.name ?? '').split(/-|–/, 2).map(part => part.trim()));
	let code = $derived(nameParts[0] ?? '');
	let name = $derived(nameParts[1] ?? '');
	let bikes = $derived(station?.bikes ?? 0);
	let freeDocks = $derived(station?.freeDocks ?? 0);
	let distance = $derived.by(() => {
		if ($currentPos && station) {
			return distanceBetweenCoords(station.latitude, station.longitude, $currentPos.coords.latitude, $currentPos.coords.longitude);
		}
		return undefined;
	});

	let bikeInfo:(AvailableBike & { rating?: StationBikeRating })[] = $state([]);
	let markedCount = $derived(bikeInfo.filter(bike => bike.hiddenReasons).length);

	async function loadBikeRatings(bikeIds: string[]) {
		try {
			const ratings = await getStationBikeRatings(bikeIds);
			bikeInfo = bikeInfo.map(bike => {
				if (!bikeIds.includes(bike.id)) return bike;
				return { ...bike, rating: ratings[bike.id] ?? null };
			});
		} catch (error) {
			console.error('Failed to get bike ratings', error);
		}
	}

	let isScrolling = $state(false);
	let dragging = $state(false);
	let timeout:ReturnType<typeof setTimeout>;
	let bikeList:HTMLDivElement;
	let listWrapper:HTMLDivElement;
	let menu:HTMLDivElement;
	let updating = $state(false);
	let windowHeight:number|undefined = $state();

	$effect(() => {
		if (pos.current !== null && !dragging && !updating && windowHeight !== undefined) {
			const newPosTop = Math.min(menu?.getBoundingClientRect().y, windowHeight);
			posTop = newPosTop;
		} else {
			posTop = undefined;
		}
	});

	// Where the sheet's top edge is headed, available while station info is
	// still loading: the list is already skeleton-sized from the station's bike
	// count, so the target height is known before the fetch returns. Computed
	// from the list's height cap rather than a rect so the in-flight resize
	// animation doesn't leak intermediate positions
	$effect(() => {
		if (pos.current !== null && !dragging && windowHeight !== undefined && dragged && listWrapper) {
			const chrome = dragged.clientHeight - listWrapper.clientHeight;
			const sheet = chrome + Math.min(windowHeight / 2, bikeListHeight);
			// the sheet keeps its size while sliding out, but no longer claims map space
			height = $selectedStation != null ? sheet : 0;
			anchorTop = Math.min(windowHeight - sheet + pos.current, windowHeight);
		} else {
			anchorTop = undefined;
		}
	});

	function onTouchStart(event: TouchEvent) {
		initPos = event.touches[0].clientY - pos.current;
	}

	function onTouchMove(event: TouchEvent) {
		dragging = true;
		let newPos = Math.max(event.touches[0].clientY - initPos, 0);
		pos.set(newPos, { duration: 0 });
	}

	function onTouchEnd() {
		dragging = false;
		if (Math.abs(pos.current) > dragged.clientHeight * 0.3) {
			dismiss();
		} else {
			pos.set(0);
		}
	}

	async function updateInfo(stationId:string, bikesAtStation: AvailableBike[]) {
		updating = true;
		clearTimeout(timeout);
		if (stations.value) {
			station = stations.value.find(s => s.serialNumber == $selectedStation);
		}
		await tick();
		bikeListHeight = bikeList.clientHeight;
		if (stationId === $selectedStation) {
			// Snapshots arrive on every bike-document change at the station; keep the ratings already
			// loaded so the badges don't flicker, and only fetch ratings for bikes we haven't seen.
			const knownRatings = new Map(bikeInfo.map(bike => [bike.id, bike.rating]));
			bikeInfo = bikesAtStation.map(bike => ({ ...bike, rating: knownRatings.get(bike.id) }));
			const newBikeIds = bikesAtStation.filter(bike => !knownRatings.has(bike.id)).map(bike => bike.id);
			if (newBikeIds.length) loadBikeRatings(newBikeIds);
		}
		await tick();
		bikeListHeight = bikeList.clientHeight;
		await tick();
		timeout = setTimeout(() => {
			updating = false;
		}, 150);
	}

	onMount(() => {
		pos.set(dragged.clientHeight, { duration: 0 });
	});

	$effect(() => {
		if ($selectedStation != null) {
			const stationId = $selectedStation;
			pos.set(0);
			bikeInfo = [];
			// The list is skeleton-sized from the station's bike count as soon as
			// it renders, so report that height now rather than when the bikes
			// arrive: the map pads its centering with it right after the tap
			tick().then(() => bikeListHeight = bikeList.clientHeight);
			return subscribeStationBikes(
				stationId,
				info => void updateInfo(stationId, info),
				error => {
					console.error('Failed to listen for station bikes', error);
					void reportApiError('bike_feed_error', error, { source: 'station-menu', station: stationId });
				},
			);
		} else if (dragged) {
			dismiss();
		}
	});

	function transition(_: HTMLElement) {
		return {
			duration: 150,
			tick: (_:number) => {
				dismiss();
				posTop = windowHeight;
				anchorTop = windowHeight;
			},
		};
	}

	// Bikes the server flags unavailable are reported when unlocked, to notice if VAIMOO stops releasing them.
	function unlockSubject(bike: AvailableBike): UnlockSubject {
		return { source: bike.hiddenReasons ? 'hidden' : 'listed', hiddenReasons: bike.hiddenReasons ?? null, record: bike.record ?? null };
	}

	function getStationFromSerial(serial:string) {
		const s = stations.value.find(s => s.serialNumber == serial);
		if (!s) {
			console.error('Station not found', serial, stations.value);
			throw new Error('Station not found');
		}
		return s;
	}

</script>

<svelte:window bind:innerHeight={windowHeight} />

<div out:transition bind:this={menu} class="absolute w-full bottom-0 z-10" style:transform="translate(0,{pos.current}px)" >
	<div bind:this={dragged} class="bg-background rounded-t-4xl" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="w-full h-6 pt-2" ontouchstart={onTouchStart} ontouchend={onTouchEnd} ontouchmove={onTouchMove}>
			<div class="mx-auto bg-background-tertiary w-16 h-[6px] rounded-full"></div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex p-9 pt-0 pb-2 gap-4" ontouchstart={onTouchStart} ontouchend={onTouchEnd} ontouchmove={onTouchMove}>
			<div class="flex flex-col grow">
				<div class="flex items-center gap-2">
					<span class="font-bold text-sm text-info">{$t('station_label')} {code}</span>
					{#if distance}
						<span transition:fade={{ duration: 150 }} class="font-semibold bg-background-secondary text-xs text-info px-1 py-[1px] rounded">{formatDistance(distance)}</span>
					{/if}
				</div>
				<span class="text-xs font-medium text-label leading-none mt-[2px]">{name}</span>
			</div>
			<div class="flex flex-col items-center text-info">
				<span class="font-bold text-2xl leading-none">{bikes}</span>
				<span class="font-bold text-[7px] leading-none">{$t('bikes_label')}</span>
			</div>
			<div class="flex flex-col items-center text-info">
				<span class="font-bold text-2xl leading-none">{freeDocks}</span>
				<span class="font-bold text-[7px] text-center leading-none">{$t('free_docks_label')}</span>
			</div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={listWrapper} class="overflow-y-auto transition-all" style:height="calc(min(50vh,{bikeListHeight}px))" onscroll={() => isScrolling = true} ontouchend={() => isScrolling = false}>
			<div bind:this={bikeList} class="flex flex-col p-5 pt-2 gap-3" style:padding-bottom="max(1.25rem, {$safeInsets.bottom}px)">
				{#if markedCount > 0}
					<div class="flex items-center gap-3 rounded-2xl bg-background-secondary dark:bg-background-tertiary px-4 py-3 text-xs font-medium text-label">
						<IconInfoCircle size={20} stroke={1.8} class="shrink-0" />
						<span>{$t(markedCount === 1 ? 'marked_unavailable_bikes_one' : 'marked_unavailable_bikes', { count: String(markedCount) })}</span>
					</div>
				{/if}
				{#if bikeInfo.length == 0}
					{#each new Array(bikes) as _}
						<BikeSkeleton />
					{:else}
						<span class="text-center text-sm text-label mt-4">{$t('no_bikes_found')}</span>
					{/each}
				{/if}
				{#if $selectedStation !== null}
					{@const station = getStationFromSerial($selectedStation)}
					{#each bikeInfo as bike}
						<Bike type={bike.type} id={bike.id} battery={bike.battery} dock={bike.dock} serial={bike.communicationId} rating={bike.rating} disabled={isScrolling} station={station} unlock={unlockSubject(bike)} />
					{/each}
				{/if}
				<div class="fixed left-0 w-full h-4 -mt-6" style:box-shadow="0px 6px 6px 0px var(--color-background)"></div>
			</div>
		</div>
	</div>
</div>