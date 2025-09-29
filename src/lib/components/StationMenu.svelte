<script lang="ts">
	import Bike from '$lib/components/Bike.svelte';
	import BikeSkeleton from '$lib/components/BikeSkeleton.svelte';
	import { getStationInfo } from '$lib/gira-api/api';
	import { currentPos } from '$lib/location';
	import { selectedStation, stations } from '$lib/map.svelte';
	import { t } from '$lib/translations';
	import { enqueueDialog, errorMessages } from '$lib/ui.svelte';
	import { distanceBetweenCoords, formatDistance, getCssVariable } from '$lib/utils';
	import { IconX } from '@tabler/icons-svelte';
	import Search from '@tabler/icons-svelte/icons/search';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	interface Props {
		bikeListHeight?: number;
		posTop?: number|undefined;
	}

	let { bikeListHeight = $bindable(0), posTop = $bindable<number|undefined>(0) }: Props = $props();

	let initPos = 0;
	let pos = tweened($selectedStation != null ? 0 : 9999, {
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

	let name = $derived(station?.name ? station.name.split(/-|–/, 2)[1].trim() : '');
	let bikes = $derived(station?.bikes ?? 0);
	let freeDocks = $derived(station ? Math.max(station.docks - station.bikes, 0) : 0);
	let code = $derived(station?.name ? station.name.split(/-|–/, 2)[0].trim() : '');
	let distance = $derived.by(() => {
		if ($currentPos && station) {
			return distanceBetweenCoords(station.latitude, station.longitude, $currentPos.coords.latitude, $currentPos.coords.longitude);
		}
		return undefined;
	});

	let bikeInfo: {type:'electric'|'classic', id:string, battery:number|null, dock:string, serial:string}[] = $state([]);
	let ghostBikes = $state<{id:string}[]>([]);
	$inspect(ghostBikes);
	let isScrolling = $state(false);
	let dragging = $state(false);
	let timeout:ReturnType<typeof setTimeout>;
	let bikeList:HTMLDivElement;
	let menu:HTMLDivElement;
	let updating = $state(false);
	let windowHeight:number|undefined = $state();

	$effect(() => {
		if ($pos !== null && !dragging && !updating && windowHeight !== undefined) {
			const newPosTop = Math.min(menu?.getBoundingClientRect().y, windowHeight);
			posTop = newPosTop;
		} else {
			posTop = undefined;
		}
	});

	function onTouchStart(event: TouchEvent) {
		initPos = event.touches[0].clientY - $pos;
	}

	function onTouchMove(event: TouchEvent) {
		dragging = true;
		let newPos = Math.max(event.touches[0].clientY - initPos, 0);
		pos.set(newPos, { duration: 0 });
	}

	function onTouchEnd() {
		dragging = false;
		if (Math.abs($pos) > dragged.clientHeight * 0.3) {
			dismiss();
		} else {
			pos.set(0);
		}
	}

	async function updateInfo(stationId:string) {
		updating = true;
		clearTimeout(timeout);
		if (stations.value) {
			station = stations.value.find(s => s.serialNumber == $selectedStation);
		}
		await tick();
		bikeListHeight = bikeList.clientHeight;
		let info = await getStationInfo(stationId);
		let tmpBikeInfo = info.getBikes?.filter(v => v != null).map<typeof bikeInfo[number]>(bike => {
			let dock = info.getDocks?.filter(v => v != null).find(d => d!.code == bike!.parent);
			if (dock == null || !dock.name) console.error('Dock not found', bike, info.getDocks);
			return {
				type: bike.type == 'electric' ?
					'electric' : bike.type == null ?
						bike.name?.[0] == 'E' ?
							'electric' : 'classic' : 'classic',
				id: bike.name!,
				battery: parseInt(bike.battery!) ?? null,
				dock: dock!.name!,
				serial: bike.serialNumber!,
			};
		});
		let tmpDocks = info.getDocks?.filter(v => v != null && v.ledStatus !== 'red')?.length ?? 0;
		let tmpBikes = tmpBikeInfo?.length ?? 0;
		let thisStation = stations.value.find(s => s.serialNumber == stationId);
		if (thisStation) {
			thisStation.bikes = tmpBikes;
			thisStation.docks = tmpDocks;
		}
		if (tmpBikeInfo && stationId === $selectedStation) {
			bikeInfo = tmpBikeInfo;
			freeDocks = Math.max(tmpDocks - tmpBikes, 0);
			bikes = tmpBikes;
		// $stations = $stations;
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
			$pos = 0;
			bikeInfo = [];
			updateInfo($selectedStation);
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

	function getSelectArrowBackground() {
		const primaryColor = getCssVariable('--color-primary').slice(1);
		return `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23${primaryColor}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;
	}

	let bikeIdNumber = $state('');
	let bikeType = $state<'classic'|'electric'>('electric');
	let bikeId = $derived.by(() => {
		if (bikeIdNumber.trim() === '') return null;
		return (bikeType === 'electric' ? 'E' : 'C') + bikeIdNumber.trim();
	});
</script>

<svelte:window bind:innerHeight={windowHeight} />

{#snippet addGhostBike(dismiss:() => void)}
	<div class="w-[340px] max-w-md mx-auto p-6 bg-background rounded-2xl shadow-lg text-left flex flex-col gap-3">
		<div class="flex justify-between">
			<h1 class="text-lg font-semibold text-info">{$t('ghost_bike_title')}</h1>
			<IconX class="text-label hover:text-primary cursor-pointer" size="24" stroke="1.5" onclick={dismiss} aria-label="Close dialog"/>
		</div>
		<div class="text-sm text-label">{$t('ghost_bike_description')}</div>
		<div class="flex w-full text-background rounded-lg p-2 bg-background-secondary border border-background-tertiary focus:border-primary focus:outline-none h-12">
			<select bind:value={bikeType} name="Bike Type" class="bg-background-secondary text-primary rounded-lg px-px pr-8 pl-1 -my-1 -mr-3 border-0 w-12 border-none focus:ring-0 font-bold appearance-none" style:background-image={getSelectArrowBackground()}>
				<option value="classic">C</option>
				<option value="electric">E</option>
			</select>
			<input bind:value={bikeIdNumber} name="Bike ID" type="text" placeholder="1234" class="bg-background-secondary text-label rounded-lg p-2 w-full border-none focus:ring-0" />
		</div>
		<button class="bg-primary w-full text-background rounded-lg py-2 px-4 font-bold" onclick={() => {
			if (bikeId) ghostBikes.push({ id: bikeId });
			else {
				errorMessages.add(
					$t('bike_unlock_no_serial_error'),
					3000,
				);
			}
			dismiss();
		}}>{$t('ghost_dismiss_label')}</button>
	</div>
{/snippet}

<div out:transition bind:this={menu} class="absolute w-full bottom-0 z-10" style:transform="translate(0,{$pos}px)" >
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
			<div bind:this={bikeList} class="flex flex-col p-5 pt-2 gap-3">
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
						<Bike type={bike.type} id={bike.id} battery={bike.battery} dock={bike.dock} serial={bike.serial} disabled={isScrolling} station={station} />
					{/each}
					{#each ghostBikes as bike}
						<Bike type={null} id={bike.id} battery={null} dock={null} serial={null} disabled={isScrolling} station={station} />
					{/each}
				{/if}
				<button class="py-4 pb-2 px-8 w-full flex justify-center text-primary items-center font-semibold gap-2" onclick={() => enqueueDialog(addGhostBike)}>
					<Search size="16px" stroke="2"/> {$t('search_other_bikes')}
				</button>
				<div class="fixed left-0 w-full h-4 -mt-6" style:box-shadow="0px 6px 6px 0px var(--color-background)"></div>
			</div>
		</div>
	</div>
</div>