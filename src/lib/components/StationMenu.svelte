<script lang="ts">
	import Bike from '$lib/components/Bike.svelte';
	import BikeSkeleton from '$lib/components/BikeSkeleton.svelte';
	import { getStationBikeRatings } from '$lib/gira-mais-api/gira-mais-api';
	import type { StationBikeRating } from '$lib/gira-mais-api/types';
	import { subscribeStationBikes } from '$lib/gira-api/api';
	import type { AvailableBike } from '$lib/gira-api/models';
	import { currentPos } from '$lib/location';
	import { selectedStation, stations } from '$lib/map.svelte';
	import { t } from '$lib/translations';
	import { safeInsets } from '$lib/ui.svelte';
	import { distanceBetweenCoords, formatDistance } from '$lib/utils';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	interface Props {
		bikeListHeight?: number;
		posTop?: number|undefined;
	}

	let { bikeListHeight = $bindable(0), posTop = $bindable<number|undefined>(0) }: Props = $props();

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
	let manualBike: AvailableBike | null = $state(null);

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
		const extraBike = manualBike;
		const visibleBikes = extraBike && !bikesAtStation.some(bike => bike.id === extraBike.id) ? [...bikesAtStation, extraBike] : bikesAtStation;
		if (stationId === $selectedStation) {
			// Snapshots arrive on every bike-document change at the station; keep the ratings already
			// loaded so the badges don't flicker, and only fetch ratings for bikes we haven't seen.
			const knownRatings = new Map(bikeInfo.map(bike => [bike.id, bike.rating]));
			bikeInfo = visibleBikes.map(bike => ({ ...bike, rating: knownRatings.get(bike.id) }));
			const newBikeIds = visibleBikes.filter(bike => !knownRatings.has(bike.id)).map(bike => bike.id);
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
			manualBike = null;
			return subscribeStationBikes(
				stationId,
				info => void updateInfo(stationId, info),
				error => console.error('Failed to listen for station bikes', error),
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
			},
		};
	}

	function getStationFromSerial(serial:string) {
		const s = stations.value.find(s => s.serialNumber == serial);
		if (!s) {
			console.error('Station not found', serial, stations.value);
			throw new Error('Station not found');
		}
		return s;
	}

/* Ghost-bike lookup disabled: the VAIMOO backend lists every dockable bike, so the legacy "missing bike" workaround is not needed.
	function getSelectArrowBackground() {
		const primaryColor = getCssVariable('--color-primary').slice(1);
		return `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23${primaryColor}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;
	}

	let bikeIdNumber = $state<number|null>(null);
	let bikeType = $state<'classic'|'electric'>('electric');
	let bikeId = $derived.by(() => {
		if (bikeIdNumber === null) return null;
		return (bikeType === 'electric' ? 'E' : 'C') + bikeIdNumber.toString().padStart(4, '0');
	});

	const makeExtraBikeFunction = (dismiss: () => void) => {
		return async () => {
			await tick();
			if (bikeId === null) {
				errorMessages.add(
					$t('bike_unlock_invalid_id_error'),
					2000,
				);
				bikeIdInput?.focus();
				return;
			}
			const foundBike = await findAvailableBike(bikeId);
			if (foundBike) {
				manualBike = foundBike;
				if (!bikeInfo.some(bike => bike.id === foundBike.id)) bikeInfo.push(foundBike);
				loadBikeRatings([foundBike.id]);
			} else {
				errorMessages.add(
					$t('bike_unlock_no_serial_error'),
					3000,
				);
				bikeIdInput?.focus();
				return;
			}
			dismiss();
			await tick();
			bikeListHeight = bikeList.clientHeight;
			bikeIdNumber = null;
		};
	};

	let bikeIdInput: HTMLInputElement|null = $state(null);
	$effect(() => {
		if (bikeIdInput && $selectedStation !== null) {
			bikeIdInput.focus();
		}
	});
	*/
</script>

<svelte:window bind:innerHeight={windowHeight} />

<!--
{#snippet addGhostBike(dismiss:() => void)}
	<div class="w-[340px] max-w-md mx-auto p-6 bg-background rounded-2xl shadow-lg text-left flex flex-col gap-3">
		<div class="flex justify-between">
			<h1 class="text-lg font-semibold text-info">{$t('ghost_bike_title')}</h1>
			<IconX class="text-label hover:text-primary cursor-pointer" size="24" stroke="1.5" onclick={dismiss} aria-label="Close dialog"/>
		</div>
		<div class="text-sm text-label">{$t('ghost_bike_description')}</div>
		<div class="flex w-full text-background rounded-lg p-2 bg-background-secondary border border-background-tertiary focus:border-primary focus:outline-none h-12">
			<select bind:value={bikeType} name="Bike Type" class="bg-background-secondary text-primary rounded-lg px-px pr-8 pl-1 -my-1 -mr-3 border-0 w-12 border-none focus:ring-0 font-bold appearance-none"
				style:background-image={getSelectArrowBackground()}
			>
				<option value="classic">C</option>
				<option value="electric">E</option>
			</select>
			<input bind:this={bikeIdInput} bind:value={bikeIdNumber} name="Bike ID" type="number" placeholder="1234"
				class="bg-background-secondary placeholder-label text-info rounded-lg p-2 w-full border-none focus:ring-0"
				onkeydown={async e => {
					if (e.key.length === 1 && (e.key < '0' || e.key > '9')) {
						e.preventDefault();
					}
					if (e.key === 'Enter') {
						makeExtraBikeFunction(dismiss)();
					}
				}}
			/>
		</div>
		<button class="bg-primary w-full text-background rounded-lg py-2 px-4 font-bold" onclick={makeExtraBikeFunction(dismiss)}>{$t('ghost_dismiss_label')}</button>
	</div>
{/snippet}
-->

<div out:transition bind:this={menu} class="absolute w-full bottom-0 z-10" style:transform="translate(0,{pos.current}px)" >
	<div bind:this={dragged} class="bg-background rounded-t-4xl" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
		<div class="w-full h-6 pt-2" ontouchstart={onTouchStart} ontouchend={onTouchEnd} ontouchmove={onTouchMove}>
			<div class="mx-auto bg-background-tertiary w-16 h-[6px] rounded-full"></div>
		</div>
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
		<div class="overflow-y-auto transition-all" style:height="calc(min(50vh,{bikeListHeight}px))" onscroll={() => isScrolling = true} ontouchend={() => isScrolling = false}>
			<div bind:this={bikeList} class="flex flex-col p-5 pt-2 gap-3" style:padding-bottom="max(1.25rem, {$safeInsets.bottom}px)">
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
						<Bike type={bike.type} id={bike.id} battery={bike.battery} dock={bike.manual ? null : bike.dock} serial={bike.communicationId} rating={bike.rating} disabled={isScrolling} station={station} />
					{/each}
				{/if}
				<!-- Ghost-bike lookup disabled, see the commented-out addGhostBike snippet above.
				<button class="py-4 pb-2 px-8 w-full flex justify-center text-primary items-center font-semibold gap-2" onclick={() => enqueueDialog(addGhostBike)}>
					<Search size="16px" stroke="2"/> {$t('search_other_bikes')}
				</button>
				-->
				<div class="fixed left-0 w-full h-4 -mt-6" style:box-shadow="0px 6px 6px 0px var(--color-background)"></div>
			</div>
		</div>
	</div>
</div>