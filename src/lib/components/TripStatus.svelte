<script lang="ts">

	import Metric from '$lib/components/Metric.svelte';
	import { following } from '$lib/map.svelte';
	import { t } from '$lib/translations';
	import { currentTrip as trip, type ActiveTrip } from '$lib/trip';
	import { safeInsets } from '$lib/ui.svelte';
	import { KeepAwake } from '@capacitor-community/keep-awake';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { onMount } from 'svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		height: number;
		width: number;
		lockOrientation?: boolean;
	}

	let { height = $bindable(), width = $bindable(), lockOrientation = $bindable(false) }: Props = $props();

	// Seeded from the window aspect so the very first render already reserves
	// the right edge — the async orientation plugin only confirms it later
	let portrait = $state(window.innerHeight > window.innerWidth);

	// Reserve the screen edge the HUD occupies. Driven by a plain subscription
	// because effects in this component are paused the moment the trip-end
	// outro starts, so an effect alone would never free the space; the effect
	// below re-applies it when the device rotates or the insets change mid-trip
	function reserve(trip: ActiveTrip|null) {
		if (trip) {
			height = portrait ? (trip.destination ? 216 : 160) + Math.max(12, $safeInsets.top) : 0;
			width = portrait ? 0 : (trip.destination ? 238 : 190) + $safeInsets.left;
			lockOrientation = false;
		} else {
			height = 0;
			width = 0;
			lockOrientation = true;
		}
	}
	trip.subscribe(reserve);
	$effect(() => reserve($trip));

	$effect(() => {
		if (lockOrientation) {
			ScreenOrientation.lock({ orientation: 'portrait' });
		} else {
			ScreenOrientation.unlock();
		}
	});

	let seconds: number = $state(0);
	let inter: ReturnType<typeof setInterval>;

	onMount(() => {
		inter = setInterval(() => seconds++, 1000);
		$following = true;
		KeepAwake.keepAwake();
		ScreenOrientation.orientation().then(o => portrait = o.type === 'portrait-primary');
		ScreenOrientation.addListener('screenOrientationChange', o => portrait = o.type === 'portrait-primary');
		return () => {
			clearInterval(inter);
			KeepAwake.allowSleep();
			ScreenOrientation.removeAllListeners();
			// The lock effect above is paused as soon as the trip-end outro
			// starts, so it never sees lockOrientation flip back — re-lock here,
			// once the HUD is actually gone
			if (lockOrientation) ScreenOrientation.lock({ orientation: 'portrait' });
		};
	});

	function msToMinuteSeconds(ms: number) {
		let seconds = Math.floor(ms / 1000);
		let displaySeconds = (seconds % 60).toString().padStart(2, '0');
		let minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
		return `${minutes}:${displaySeconds}`;
	}

	function formatTime(date: Date) {
		return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
	}

	/** "<1min", "26min" or "1h26min", as value/unit pairs for Metric */
	function formatDurationMinutes(ms: number): { value: string, unit: string, secondValue?: string, secondUnit?: string } {
		const minutes = Math.round(ms / 60000);
		if (minutes < 1) return { value: '<1', unit: 'min' };
		if (minutes < 60) return { value: minutes.toString(), unit: 'min' };
		return { value: Math.floor(minutes / 60).toString(), unit: 'h', secondValue: (minutes % 60).toString().padStart(2, '0'), secondUnit: 'min' };
	}
</script>

<div transition:fly={portrait ? { y: -172 } : { x: -172 }} class="absolute bg-background top-0 left-0 transition-all" style:height={portrait ? `${height}px` : '100%'} style:width={portrait ? '100%' : `${width}px`} style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
	{#if $trip != null}
		<!-- + seconds - seconds is on purpose so that it refreshes every second -->
		{@const deltaSeconds = Date.now() - $trip.startDate.getTime() + seconds - seconds}
		<div class="flex flex-col items-center gap-2 relative {$trip.destination ? 'h-64' : 'h-52'} {portrait ? '' : 'top-1/2 -translate-y-1/2'}" style={`margin-${portrait ? 'top' : 'left'}: ${portrait ? Math.max(12, $safeInsets.top) : $safeInsets.left}px`}>
			{#if $trip.bikePlate}
				<span class="font-semibold text-label text-lg">{$trip.bikePlate}</span>
			{:else}
				<div class="w-14 h-5 my-1 bg-background-tertiary animate-pulse rounded-md"></div>
			{/if}
			<span class="text-5xl text-primary font-bold">{msToMinuteSeconds(deltaSeconds) ?? seconds}</span> <!-- Using `seconds` variable to force an update every second -->
			<div class="absolute top-[92px] transition-all {portrait ? $trip.destination ? 'left-12' : 'left-20' : $trip.destination ? 'left-4' : 'right-1/2 translate-x-1/2'}">
				<Metric value={$trip.traveledDistanceKm >= 1 ? $trip.traveledDistanceKm : Math.round($trip.traveledDistanceKm * 1000)} unit={$trip.traveledDistanceKm >= 1 ? 'km' : 'm'} label={$t('distance_traveled')} />
			</div>
			<div class="absolute transition-all {portrait ? $trip.destination ? 'top-[92px] right-1/2 translate-x-1/2' : 'top-[92px] right-20 translate-x-0' : $trip.destination ? 'top-[92px] right-4' : 'top-[150px] right-1/2 translate-x-1/2'}">
				<Metric value={$trip.speed <= 0 ? '--' : $trip.speed} unit="km/h" label={$t('average_speed')} />
			</div>
			{#if $trip.destination}
				<div transition:fly={{ x: 64, duration: 150, easing: cubicInOut }} class="absolute transition-all {portrait ? 'top-[92px] right-12' : 'top-[150px] left-4'}">
					{#if $trip.distanceLeft != null}
						<Metric value={$trip.distanceLeft >= 1 ? $trip.distanceLeft : Math.round($trip.distanceLeft * 1000)} unit={$trip.distanceLeft >= 1 ? 'km' : 'm'} label={$t('distance_left')} />
					{/if}
				</div>
				<div transition:fade={{ duration: 150 }}>
					<div class="absolute top-[150px] transition-all {portrait ? 'left-24' : 'right-4'}">
						{#if $trip.arrivalTime}
							{@const timeLeft = formatDurationMinutes($trip.arrivalTime.getTime() - Date.now())}
							<Metric value={timeLeft.value} unit={timeLeft.unit} secondValue={timeLeft.secondValue} secondUnit={timeLeft.secondUnit} label={$t('time_left')} />
						{/if}
					</div>
					<div class="absolute transition-all {portrait ? 'top-[150px] right-24' : 'top-[208px] right-1/2 translate-x-1/2'}">
						{#if $trip.arrivalTime}
							<Metric value={formatTime($trip.arrivalTime)} label={$t('arrival_time')} />
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>