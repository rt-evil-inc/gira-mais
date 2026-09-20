<script lang="ts">
	import { submitTripRating } from '$lib/gira-api/api';
	import { postBikeRating, reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
	import { currentRoute } from '$lib/routing';
	import { t } from '$lib/translations';
	import { markTripRated, tripRating } from '$lib/trip';
	import { DETAILS_RATING_THRESHOLD, forwardsToEmel, markRatingDragHintSeen, ratingDragHintSeen, TRIP_RATING_REASONS, type TripRatingDetails, type TripRatingReasonCode } from '$lib/trip-rating';
	import { safeInsets } from '$lib/ui.svelte';
	import { Keyboard } from '@capacitor/keyboard';
	import { VaimooApiError } from '$lib/vaimoo-api/client';
	import IconArrowBackUp from '@tabler/icons-svelte/icons/arrow-back-up';
	import IconArrowsMoveVertical from '@tabler/icons-svelte/icons/arrows-move-vertical';
	import IconMoodConfuzed from '@tabler/icons-svelte/icons/mood-confuzed';
	import IconMoodConfuzedFilled from '@tabler/icons-svelte/icons/mood-confuzed-filled';
	import IconMoodEmpty from '@tabler/icons-svelte/icons/mood-empty';
	import IconMoodEmptyFilled from '@tabler/icons-svelte/icons/mood-empty-filled';
	import IconMoodHappy from '@tabler/icons-svelte/icons/mood-happy';
	import IconMoodHappyFilled from '@tabler/icons-svelte/icons/mood-happy-filled';
	import IconMoodSmile from '@tabler/icons-svelte/icons/mood-smile';
	import IconMoodSmileFilled from '@tabler/icons-svelte/icons/mood-smile-filled';
	import IconMoodWrrr from '@tabler/icons-svelte/icons/mood-wrrr';
	import { onDestroy, onMount } from 'svelte';
	import { cubicOut, linear } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { get } from 'svelte/store';
	import { fade, fly } from 'svelte/transition';

	/*
	 * One card, three resting places, one number in between. `position` is where the card's
	 * handle is relative to the compact card: 0 is the compact card (question and faces), up
	 * to `detailsHeight` reveals the details step underneath, negative lifts the whole card
	 * off the top of the screen. Dragging the handle writes it directly and letting go
	 * animates it to the nearest resting place, so a drag can be picked up mid-flight and
	 * there are never two animations disagreeing about where the card is.
	 *
	 * Good ratings are sent at a tap; bad ones open the details first, as the official app
	 * does. Either way the rating waits behind an undo bar before anything leaves the phone.
	 */

	interface Props {
		tripCode: string;
		bikePlate: string;
		date?: Date;
	}

	let { tripCode, bikePlate, date }: Props = $props();

	type Panel = 'hidden' | 'compact' | 'expanded';
	type Pending = { rating: number; details?: TripRatingDetails; panel: Panel; reasons: TripRatingReasonCode[]; comment: string };

	const COMPACT_WIDTH = 244;
	const MAX_EXPANDED_WIDTH = 560;
	const SETTLE_ms = 300;
	const UNDO_DELAY_ms = 4000;
	/** How far ahead the release velocity is projected when choosing where to settle. */
	const RELEASE_PROJECTION_ms = 200;
	/** Fraction of the way off the top past which a release dismisses the card. */
	const DISMISS_FRACTION = 0.35;
	/** Fraction of the details a release has to reveal to open them, and to keep them open once they are. */
	const OPEN_FRACTION = 0.3;
	const STAY_OPEN_FRACTION = 0.6;

	const FACES = [
		{ outline: IconMoodWrrr, filled: null },
		{ outline: IconMoodConfuzed, filled: IconMoodConfuzedFilled },
		{ outline: IconMoodEmpty, filled: IconMoodEmptyFilled },
		{ outline: IconMoodSmile, filled: IconMoodSmileFilled },
		{ outline: IconMoodHappy, filled: IconMoodHappyFilled },
	];

	let rating = $state<number>();
	let reasons = $state<TripRatingReasonCode[]>([]);
	let comment = $state('');
	let panel = $state<Panel>('compact');
	let pending = $state<Pending | null>(null);
	let sent = false;
	let showHint = $state(false);
	let undoTimeout: ReturnType<typeof setTimeout> | undefined;

	// Geometry: the details are always laid out at their expanded width and clipped by the
	// card, so their measured height doesn't move while the card is widening under them
	let innerWidth = $state(0);
	let innerHeight = $state(0);
	let headerHeight = $state(0);
	let cardHeight = $state(0);
	let detailsNaturalHeight = $state(0);
	const top = $derived(Math.max(16, $safeInsets.top + 8) + 64 + ($currentRoute ? 40 : 0));
	const expandedWidth = $derived(Math.max(COMPACT_WIDTH, Math.min(MAX_EXPANDED_WIDTH, innerWidth - 24)));
	// Never past the bottom of the screen; the details scroll instead. The keyboard is deliberately
	// not subtracted: the card sits at the top and would only jump around as it comes and goes
	const detailsHeight = $derived(Math.min(detailsNaturalHeight, Math.max(160, innerHeight - top - headerHeight - 72)));
	const hiddenPosition = $derived(-(top + cardHeight + 24));
	// Measured against the compact card, so dismissing takes the same pull whether or not the details are open
	const dismissPosition = $derived(-(top + headerHeight + 40 + 24) * DISMISS_FRACTION);

	const position = new Tween(0, { duration: SETTLE_ms, easing: cubicOut });
	const revealed = $derived(Math.max(0, Math.min(position.current, detailsHeight)));
	const progress = $derived(detailsHeight > 0 ? revealed / detailsHeight : 0);
	const width = $derived(COMPACT_WIDTH + (expandedWidth - COMPACT_WIDTH) * progress);
	// Lifted off the top when dismissing; nudged down a little when pulled past fully open
	const offsetY = $derived(Math.min(0, position.current) + Math.max(0, position.current - detailsHeight));

	const undoProgress = new Tween(1, { duration: UNDO_DELAY_ms, easing: linear });

	// The open card follows its content: a chip row wrapping or the screen rotating
	// re-targets the tween instead of leaving the details half clipped
	let dragging = $state(false);
	$effect(() => {
		if (panel === 'expanded' && !dragging && !pending) position.set(detailsHeight);
	});

	onMount(() => {
		ratingDragHintSeen().then(seen => showHint = !seen).catch(() => {});
	});

	onDestroy(() => {
		// Unmounted mid-undo (a new trip, a logout): the rider had their chance, send it now
		if (pending && !sent) {
			clearTimeout(undoTimeout);
			sent = true;
			void send(pending.rating, pending.details);
			void markTripRated(tripCode).catch(() => {});
		}
	});

	function hideHint() {
		if (!showHint) return;
		showHint = false;
		void markRatingDragHintSeen().catch(() => {});
	}

	function settle(next: Panel) {
		panel = next;
		if (next === 'hidden') {
			position.set(hiddenPosition);
			setTimeout(finish, SETTLE_ms);
		} else if (next === 'compact') {
			position.set(0);
		}
	// 'expanded' is animated by the effect above, which also tracks the details' height
	}

	async function finish() {
		await markTripRated(tripCode).catch(error => console.warn('Could not remember handled trip rating', error));
		if (get(tripRating).currentRating?.code === tripCode) tripRating.set({ currentRating: null });
	}

	// The comment is a line or two, so the keyboard's return key closes it instead of adding lines
	function onCommentKeydown(event: KeyboardEvent & { currentTarget: EventTarget & HTMLTextAreaElement }) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		event.currentTarget.blur();
		Keyboard.hide().catch(() => {}); // not implemented on web
	}

	function toggleReason(code: TripRatingReasonCode) {
		reasons = reasons.includes(code) ? reasons.filter(reason => reason !== code) : [...reasons, code];
	}

	function pick(value: number) {
		rating = value;
		if (panel !== 'compact') return;
		if (value <= DETAILS_RATING_THRESHOLD) settle('expanded');
		else submit();
	}

	function submit() {
		if (rating === undefined || pending) return;
		const trimmed = comment.trim();
		const details = reasons.length || trimmed ? { reasons: [...reasons], comment: trimmed } : undefined;
		pending = { rating, details, panel, reasons: [...reasons], comment };
		settle('compact');
		undoProgress.set(1, { duration: 0 });
		undoProgress.set(0);
		undoTimeout = setTimeout(finalize, UNDO_DELAY_ms);
	}

	function undo() {
		if (!pending) return;
		clearTimeout(undoTimeout);
		({ rating, reasons, comment } = pending);
		const previous = pending.panel;
		pending = null;
		settle(previous);
	}

	function finalize() {
		if (!pending || sent) return;
		clearTimeout(undoTimeout);
		const { rating: value, details } = pending;
		sent = true;
		pending = null;
		void send(value, details);
		settle('hidden');
	}

	async function send(value: number, details?: TripRatingDetails) {
		if (forwardsToEmel(value, details)) await forwardToEmel(value, details);
		// The Gira+ aggregate behind the bike-condition badges, kept regardless of VAIMOO's answer
		void postBikeRating(tripCode, bikePlate, value, date?.toISOString(), details).catch(error => {
			console.warn('Could not mirror bike rating to Gira+', error);
			reportErrorEvent('bike_rating_mirror_error');
		});
	}

	async function forwardToEmel(value: number, details?: TripRatingDetails) {
		try {
			await submitTripRating(tripCode, bikePlate, value, details, date);
		} catch (error) {
			// VAIMOO has been rejecting otherwise valid opinion feedback since the migration.
			// Rating is optional, so the rider isn't bothered; the code is reported so the
			// rejection can be understood from the statistics.
			console.warn('VAIMOO trip rating was not accepted; continuing', error);
			let detail = error instanceof Error ? error.message : String(error);
			if (error instanceof VaimooApiError) detail = `${error.code ?? error.status}: ${error.errors.map(item => item.message).join('; ')}`;
			reportErrorEvent('rate_trip_error', detail);
		}
	}

	// Dragging the handle

	let dragStartY = 0;
	let dragStartPosition = 0;
	let lastY = 0;
	let lastTime = 0;
	let velocity = 0;
	let moved = false;

	function onPointerDown(event: PointerEvent & { currentTarget: EventTarget & HTMLElement }) {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragging = true;
		moved = false;
		dragStartY = lastY = event.clientY;
		dragStartPosition = position.current;
		lastTime = event.timeStamp;
		velocity = 0;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const deltaY = event.clientY - dragStartY;
		if (Math.abs(deltaY) > 4) moved = true;
		const deltaTime = Math.max(1, event.timeStamp - lastTime);
		velocity = velocity * 0.6 + (event.clientY - lastY) / deltaTime * 0.4;
		lastY = event.clientY;
		lastTime = event.timeStamp;
		const raw = dragStartPosition + deltaY;
		// Resists past fully open, stops at fully hidden
		const next = raw > detailsHeight ? detailsHeight + (raw - detailsHeight) * 0.25 : Math.max(hiddenPosition, raw);
		position.set(next, { duration: 0 });
	}

	function onPointerUp(event: PointerEvent & { currentTarget: EventTarget & HTMLElement }) {
		if (!dragging) return;
		dragging = false;
		event.currentTarget.releasePointerCapture(event.pointerId);
		if (!moved) return; // a tap: the click handler toggles the details
		hideHint();
		const projected = position.current + velocity * RELEASE_PROJECTION_ms;
		const openFraction = panel === 'expanded' ? STAY_OPEN_FRACTION : OPEN_FRACTION;
		if (projected < dismissPosition) settle('hidden');
		else if (projected > detailsHeight * openFraction) settle('expanded');
		else settle('compact');
	}

	function onHandleClick() {
		if (moved) return;
		hideHint();
		settle(panel === 'expanded' ? 'compact' : 'expanded');
	}
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#snippet face(value: number, filled: boolean, size: number)}
	{@const Icon = filled ? FACES[value - 1].filled : FACES[value - 1].outline}
	{#if Icon}
		<Icon {size} stroke={1.7} class="text-primary" />
	{:else}
		<!-- tabler has no filled "wrrr" face -->
		<svg style:width="{size * 0.83}px" style:height="{size * 0.83}px" viewBox="0 0 91 91" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
			<path d="M45.14 86.28C39.7374 86.28 34.3877 85.2159 29.3964 83.1484C24.4051 81.0809 19.8698 78.0506 16.0496 74.2304C12.2294 70.4102 9.19908 65.8749 7.1316 60.8836C5.06412 55.8923 4 50.5426 4 45.14C4 39.7374 5.06412 34.3877 7.1316 29.3964C9.19908 24.4051 12.2294 19.8698 16.0496 16.0496C19.8698 12.2294 24.4051 9.19907 29.3964 7.1316C34.3877 5.06412 39.7374 4 45.14 4C56.051 4 66.5151 8.33438 74.2304 16.0496C81.9456 23.7649 86.28 34.229 86.28 45.14C86.28 56.051 81.9456 66.5151 74.2304 74.2304C66.5151 81.9456 56.051 86.28 45.14 86.28Z" class="fill-primary stroke-primary" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M27 63.2833L31.5711 58.7122L38.4278 63.2833L45.2844 58.7122L52.1411 63.2833L58.9978 58.7122L63.5689 63.2833M29.2856 42.7133L36.1422 35.8567L29.2856 29M61.2833 42.7133L54.4267 35.8567L61.2833 29" class="stroke-background" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	{/if}
{/snippet}

<!-- sits below the search bar (64px), and below its route summary extension too when one is shown -->
<div in:fly={{ y: -120 }} out:fade={{ duration: 150 }} class="absolute left-0 right-0 flex justify-center pointer-events-none" style:top="{top}px">
	<div
		bind:clientHeight={cardHeight}
		class="pointer-events-auto flex flex-col items-center overflow-hidden bg-background text-info"
		style:width="{width}px"
		style:border-radius="{16 + 8 * progress}px"
		style:transform="translateY({offsetY}px)"
		style:box-shadow="0px 0px 20px 0px var(--color-shadow)"
	>
		{#if pending}
			<div in:fade={{ duration: 150 }} class="flex flex-col items-center gap-2 w-full p-3 pb-2">
				<div class="flex items-center gap-2 text-sm font-bold whitespace-nowrap">
					<span>{$t('rating_thank_you')}</span>
					{@render face(pending.rating, true, 28)}
				</div>
				<button class="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-background-secondary text-sm font-bold active:bg-background-tertiary" onclick={undo}>
					<IconArrowBackUp size={18} stroke={2.2} />
					{$t('undo_button')}
				</button>
				<div class="h-1 w-full rounded-full bg-background-secondary overflow-hidden">
					<div class="h-full rounded-full bg-primary" style:width="{undoProgress.current * 100}%"></div>
				</div>
			</div>
		{:else}
			<div bind:clientHeight={headerHeight} class="flex flex-col items-center gap-1 w-full pt-2 px-2">
				<span class="font-bold whitespace-nowrap" style:font-size="{14 + 3 * progress}px" style:line-height="{18 + 6 * progress}px" style:margin-bottom="{6 * progress}px">{$t('last_trip_question')}</span>
				<div class="flex" style:gap="{3 + 5 * progress}px">
					{#each FACES as _, index}
						{@const value = index + 1}
						<button class="flex items-center justify-center w-10 h-10 rounded-full" aria-label={String(value)} aria-pressed={rating === value} onclick={() => pick(value)}>
							{@render face(value, rating === value, 40)}
						</button>
					{/each}
				</div>
			</div>

			<div class="relative w-full overflow-hidden" style:height="{revealed}px" style:opacity={progress} aria-hidden={progress === 0}>
				<div class="absolute top-0 left-1/2 -translate-x-1/2 overflow-y-auto" style:width="{expandedWidth}px" style:max-height="{detailsHeight}px">
					<div bind:clientHeight={detailsNaturalHeight} class="flex flex-col items-center gap-3 px-4 pt-3 pb-1">
						<h3 class="font-bold text-base leading-tight text-center">
							{rating !== undefined && rating > DETAILS_RATING_THRESHOLD ? $t('rating_details_question') : $t('rating_problem_question')}
						</h3>
						<div class="flex flex-wrap justify-center gap-2">
							{#each TRIP_RATING_REASONS as reason (reason.code)}
								{@const selected = reasons.includes(reason.code)}
								<button
									class="h-9 px-3.5 rounded-full text-sm font-semibold transition-colors duration-150 {selected ? 'bg-primary text-background' : 'bg-background-secondary text-info'}"
									aria-pressed={selected}
									onclick={() => toggleReason(reason.code)}
								>{$t(reason.label)}</button>
							{/each}
						</div>
						<textarea
							bind:value={comment}
							rows="2"
							maxlength="500"
							enterkeyhint="done"
							onkeydown={onCommentKeydown}
							placeholder={$t('rating_comment_placeholder')}
							class="w-full resize-none rounded-lg border border-background-tertiary bg-background-secondary text-sm text-info placeholder-label focus:border-primary focus:ring-primary"
						></textarea>
						<button class="flex items-center justify-center h-12 w-full rounded-lg bg-primary text-background font-bold disabled:opacity-50" disabled={rating === undefined} onclick={submit}>
							{$t('rating_submit_button')}
						</button>
					</div>
				</div>
			</div>

			<button
				class="flex flex-col items-center w-full pt-1 pb-2 touch-none"
				aria-label={$t('rating_drag_handle_label')}
				aria-expanded={panel === 'expanded'}
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
				onclick={onHandleClick}
			>
				{#if showHint}
					<span transition:fade={{ duration: 150 }} class="flex items-center gap-2 mx-3 mt-1 mb-2 px-3 py-1.5 rounded-full bg-background-secondary text-xs font-semibold leading-tight text-left whitespace-pre-line text-info">
						<IconArrowsMoveVertical size={16} stroke={2.2} class="shrink-0 text-primary" />
						{$t('rating_drag_hint')}
					</span>
				{/if}
				<div class="h-1.5 w-12 rounded-full bg-background-tertiary"></div>
			</button>
		{/if}
	</div>
</div>