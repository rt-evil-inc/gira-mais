<script lang="ts">
	import { t } from '$lib/translations';
	import { errorMessages, safeInsets } from '$lib/ui';

	import { rateTrip } from '$lib/gira-api/api';
	import { postBikeRating, reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
	import { tripRating } from '$lib/trip';
	import IconMoodConfuzed from '@tabler/icons-svelte/icons/mood-confuzed';
	import IconMoodConfuzedFilled from '@tabler/icons-svelte/icons/mood-confuzed-filled';
	import IconMoodEmpty from '@tabler/icons-svelte/icons/mood-empty';
	import IconMoodEmptyFilled from '@tabler/icons-svelte/icons/mood-empty-filled';
	import IconMoodHappy from '@tabler/icons-svelte/icons/mood-happy';
	import IconMoodHappyFilled from '@tabler/icons-svelte/icons/mood-happy-filled';
	import IconMoodSmile from '@tabler/icons-svelte/icons/mood-smile';
	import IconMoodSmileFilled from '@tabler/icons-svelte/icons/mood-smile-filled';
	import IconMoodWrrr from '@tabler/icons-svelte/icons/mood-wrrr';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		tripCode: string;
		bikePlate: string;
		date?: Date;
	}

	let { tripCode, bikePlate, date }: Props = $props();
	let rating:number|undefined = $state();

	async function rate(tripCode: string, bikePlate:string, rating:number) {
		postBikeRating(tripCode, bikePlate, rating, date?.toISOString());
		return (await rateTrip(tripCode, rating)).rateTrip;
	}

	async function setRating(ratingValue: number) {
		rating = ratingValue;
		const result = await rate(tripCode, bikePlate, rating);
		$tripRating.currentRating = null;
		if (!result) {
			errorMessages.add($t('rate_trip_error'));
			reportErrorEvent('rate_trip_error');
		}
	}
</script>

<div transition:fly={{ y: -120 }} class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center p-2 gap-1 bg-background rounded-2xl" style:box-shadow="0px 0px 20px 0px var(--color-shadow)" style:top="{Math.max(16, $safeInsets.top + 8)}px">
	<span class="font-bold text-info text-sm mx-1 whitespace-nowrap">{$t('last_trip_question')}</span>
	<div class="grid columns-5 gap-[3px]">
		{#if rating === 1}
			<div transition:fade={{ duration: 150 }} class="flex items-center justify-center w-[40px] h-[40px] col-start-1 col-end-1 row-start-1 row-end-1">
				<svg class="w-[33.33px] h-[33.33px]" width="91" height="91" viewBox="0 0 91 91" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M45.14 86.28C39.7374 86.28 34.3877 85.2159 29.3964 83.1484C24.4051 81.0809 19.8698 78.0506 16.0496 74.2304C12.2294 70.4102 9.19908 65.8749 7.1316 60.8836C5.06412 55.8923 4 50.5426 4 45.14C4 39.7374 5.06412 34.3877 7.1316 29.3964C9.19908 24.4051 12.2294 19.8698 16.0496 16.0496C19.8698 12.2294 24.4051 9.19907 29.3964 7.1316C34.3877 5.06412 39.7374 4 45.14 4C56.051 4 66.5151 8.33438 74.2304 16.0496C81.9456 23.7649 86.28 34.229 86.28 45.14C86.28 56.051 81.9456 66.5151 74.2304 74.2304C66.5151 81.9456 56.051 86.28 45.14 86.28Z" class="fill-primary stroke-primary" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M27 63.2833L31.5711 58.7122L38.4278 63.2833L45.2844 58.7122L52.1411 63.2833L58.9978 58.7122L63.5689 63.2833M29.2856 42.7133L36.1422 35.8567L29.2856 29M61.2833 42.7133L54.4267 35.8567L61.2833 29" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>
		{:else}
			<div transition:fade={{ duration: 150 }} class="col-start-1 col-end-1 row-start-1 row-end-1" ontouchstart={() => setRating(1)}>
				<IconMoodWrrr size={40} stroke={1.7} class="text-primary" />
			</div>
		{/if}

		{#if rating === 2}
			<div transition:fade={{ duration: 150 }} class="col-start-2 col-end-2 row-start-1 row-end-1">
				<IconMoodConfuzedFilled size={40} stroke={1.7} class="text-primary" />
			</div>
		{:else}
			<div transition:fade={{ duration: 150 }} class="col-start-2 col-end-2 row-start-1 row-end-1" ontouchstart={() => setRating(2)}>
				<IconMoodConfuzed size={40} stroke={1.7} class="text-primary" />
			</div>
		{/if}

		{#if rating === 3}
			<div transition:fade={{ duration: 150 }} class="col-start-3 col-end-3 row-start-1 row-end-1">
				<IconMoodEmptyFilled size={40} stroke={1.7} class="text-primary" />
			</div>
		{:else}
			<div transition:fade={{ duration: 150 }} class="col-start-3 col-end-3 row-start-1 row-end-1" ontouchstart={() => setRating(3)}>
				<IconMoodEmpty size={40} stroke={1.7} class="text-primary" />
			</div>
		{/if}

		{#if rating === 4}
			<div transition:fade={{ duration: 150 }} class="col-start-4 col-end-4 row-start-1 row-end-1">
				<IconMoodSmileFilled size={40} stroke={1.7} class="text-primary" />
			</div>
		{:else}
			<div transition:fade={{ duration: 150 }} class="col-start-4 col-end-4 row-start-1 row-end-1" ontouchstart={() => setRating(4)}>
				<IconMoodSmile size={40} stroke={1.7} class="text-primary" />
			</div>
		{/if}

		{#if rating === 5}
			<div transition:fade={{ duration: 150 }} class="col-start-5 col-end-5 row-start-1 row-end-1">
				<IconMoodHappyFilled size={40} stroke={1.7} class="text-primary" />
			</div>
		{:else}
			<div transition:fade={{ duration: 150 }} class="col-start-5 col-end-5 row-start-1 row-end-1" ontouchstart={() => setRating(5)}>
				<IconMoodHappy size={40} stroke={1.7} class="text-primary" />
			</div>
		{/if}
	</div>
</div>