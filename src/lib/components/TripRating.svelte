<script lang="ts">
	import { t } from '$lib/translations';
	import { errorMessages, safeInsets } from '$lib/ui.svelte';

	import { rateTrip } from '$lib/gira-api/api';
	import { postBikeRating, reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
	import { appSettings } from '$lib/settings';
	import { tripRating } from '$lib/trip';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
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

	/*
	 * Rating drag interaction:
	 * - The bottom handle is always visible and drives one continuous panel position.
	 * - Position 0 is the compact state: question + faces + handle.
	 * - Positive position expands the details area; progress is derived from position / measured expanded height.
	 * - Negative position moves the whole compact popup upward, allowing dismissal to track the pointer.
	 * - On release, velocity is projected forward and the nearest state is chosen: hidden, compact, or expanded.
	 * - This lets users carefully place the panel at compact height, fling down to expand, or fling/drag up to dismiss.
	 * - The first-time explainer points users at this handle, then settings.explainers.rating_drag is marked true.
	 */
	interface Props {
		tripCode: string;
		bikePlate: string;
		date?: Date;
		preview?: boolean;
		onDismiss?: () => void;
	}

	const badTripReasons = [
		'rating_reason_brakes',
		'rating_reason_wheels',
		'rating_reason_pedals',
		'rating_reason_dock',
		'rating_reason_acceleration',
	] as const;
	const compactWidth = 244;
	const maxExpandedWidth = 640;
	const releaseProjectionMs = 240;
	const alwaysShowDragExplainerForTesting = true;
	const disableRatingSubmissionForTesting = true;
	const ratingUndoDelay = 4000;

	type BadTripReason = typeof badTripReasons[number] | 'rating_reason_other';
	type PanelState = 'hidden' | 'compact' | 'expanded';
	type PendingSubmission = {
		rating: number;
		selectedReasons: BadTripReason[];
		otherReason: string;
		comment: string;
		panelPosition: number;
	};

	let { tripCode, bikePlate, date, preview = false, onDismiss = () => {} }: Props = $props();
	let rating:number|undefined = $state();
	let visible = $state(true);
	let panelPosition = $state(0);
	let dragging = $state(false);
	let dragStartY = 0;
	let dragStartPosition = 0;
	let dragDistance = 1;
	let lastDragY = 0;
	let lastDragTime = 0;
	let dragVelocityY = 0;
	let windowWidth = $state(0);
	let popup:HTMLDivElement|undefined = $state();
	let detailsContent:HTMLDivElement|undefined = $state();
	let submitting = $state(false);
	let selectedReasons:BadTripReason[] = $state([]);
	let otherReason = $state('');
	let dragExplainerVisible = $state(false);
	let dismissTimeout:ReturnType<typeof setTimeout>|undefined;
	let submissionTimeout:ReturnType<typeof setTimeout>|undefined;
	let pendingSubmission:PendingSubmission|undefined = $state();
	let thankYouVisible = $state(false);
	let undoProgressStarted = $state(false);
	let pendingSubmissionId = $state(0);
	let popupTop = $derived(Math.max(16, $safeInsets.top + 8));
	let hiddenPosition = $derived(-((popup?.offsetHeight ?? 140) + popupTop + 24));
	let expandDistance = $derived((detailsContent?.scrollHeight ?? 0) + 112);
	let clampedPanelPosition = $derived(Math.min(expandDistance, Math.max(hiddenPosition, panelPosition)));
	let detailsProgress = $derived(Math.min(1, Math.max(0, clampedPanelPosition / Math.max(1, expandDistance))));
	let expandedWidth = $derived(Math.min(maxExpandedWidth, Math.max(compactWidth, windowWidth - 24)));
	let popupWidth = $derived(compactWidth + (expandedWidth - compactWidth) * detailsProgress);
	let detailsVisible = $derived(detailsProgress > 0.02);
	let dragOffsetY = $derived(Math.min(0, clampedPanelPosition));

	function toggleReason(reason: BadTripReason) {
		selectedReasons = selectedReasons.includes(reason) ?
			selectedReasons.filter(selectedReason => selectedReason !== reason) :
				[...selectedReasons, reason];
	}

	$effect(() => {
		if (!visible || alwaysShowDragExplainerForTesting) return;
		if (!$appSettings || $appSettings.explainers.rating_drag) return;
		dragExplainerVisible = true;
		appSettings.update(settings => ({
			...settings,
			explainers: {
				...settings.explainers,
				rating_drag: true,
			},
		}));
	});

	async function rate(tripCode: string, bikePlate:string, rating:number, comment:string) {
		if (preview || disableRatingSubmissionForTesting) return true;
		postBikeRating(tripCode, bikePlate, rating, date?.toISOString());
		return (await rateTrip(tripCode, rating, comment)).rateTrip;
	}

	async function setRating(ratingValue: number) {
		rating = ratingValue;
		if (detailsProgress === 0) await submitRating();
	}

	async function submitRating() {
		if (rating === undefined || submitting || pendingSubmission) return;
		submitting = true;
		const ratingToSubmit = rating;
		const selectedReasonsToRestore = [...selectedReasons];
		const otherReasonToRestore = otherReason;
		const panelPositionToRestore = panelPosition;
		const tripRatingToRestore = $tripRating.currentRating;
		const reasonLabels = selectedReasons.map(reason => $t(reason));
		const comment = [...reasonLabels, otherReason.trim()].filter(Boolean).join('\n');
		pendingSubmission = {
			rating: ratingToSubmit,
			selectedReasons: selectedReasonsToRestore,
			otherReason: otherReasonToRestore,
			comment,
			panelPosition: panelPositionToRestore,
		};
		pendingSubmissionId += 1;
		if (tripRatingToRestore) $tripRating.currentRating = tripRatingToRestore;
		panelPosition = 0;
		thankYouVisible = false;
		undoProgressStarted = false;
		setTimeout(() => {
			if (!pendingSubmission) return;
			thankYouVisible = true;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					undoProgressStarted = true;
				});
			});
			submissionTimeout = setTimeout(() => {
				finalizePendingSubmission();
			}, ratingUndoDelay);
		}, panelPositionToRestore === 0 ? 0 : 300);
	}

	async function finalizePendingSubmission() {
		if (!pendingSubmission) return;
		const submission = pendingSubmission;
		pendingSubmission = undefined;
		thankYouVisible = false;
		undoProgressStarted = false;
		const result = await rate(tripCode, bikePlate, submission.rating, submission.comment);
		if (!result) {
			errorMessages.add($t('rate_trip_error'));
			reportErrorEvent('rate_trip_error');
			submitting = false;
			return;
		}
		settlePanel('hidden');
		submitting = false;
	}

	function undoPendingSubmission() {
		if (!pendingSubmission) return;
		if (submissionTimeout) {
			clearTimeout(submissionTimeout);
			submissionTimeout = undefined;
		}
		rating = pendingSubmission.rating;
		selectedReasons = pendingSubmission.selectedReasons;
		otherReason = pendingSubmission.otherReason;
		const panelPositionToRestore = pendingSubmission.panelPosition;
		pendingSubmission = undefined;
		thankYouVisible = false;
		undoProgressStarted = false;
		submitting = false;
		requestAnimationFrame(() => {
			panelPosition = panelPositionToRestore;
		});
	}

	function dismissRating() {
		if (preview) {
			visible = false;
		} else {
			$tripRating.currentRating = null;
		}
		onDismiss();
	}

	function nearestPanelState(projectedPosition: number): PanelState {
		const states:{ state: PanelState, position: number }[] = [
			{ state: 'hidden', position: hiddenPosition },
			{ state: 'compact', position: 0 },
			{ state: 'expanded', position: expandDistance },
		];
		return states.reduce((nearest, state) => Math.abs(projectedPosition - state.position) < Math.abs(projectedPosition - nearest.position) ? state : nearest).state;
	}

	function settlePanel(state: PanelState, dismissAfterHidden = true, resetCompact = true) {
		if (dismissTimeout) {
			clearTimeout(dismissTimeout);
			dismissTimeout = undefined;
		}
		if (state === 'hidden') {
			panelPosition = hiddenPosition;
			if (dismissAfterHidden) dismissTimeout = setTimeout(dismissRating, 300);
		} else if (state === 'expanded') {
			panelPosition = expandDistance;
		} else {
			panelPosition = 0;
			if (resetCompact) {
				rating = undefined;
				selectedReasons = [];
				otherReason = '';
			}
		}
	}

	function onHandlePointerDown(event: PointerEvent) {
		if (!alwaysShowDragExplainerForTesting) dragExplainerVisible = false;
		dragging = true;
		dragStartY = event.clientY;
		dragDistance = Math.max(1, expandDistance);
		dragStartPosition = panelPosition;
		lastDragY = event.clientY;
		lastDragTime = event.timeStamp;
		dragVelocityY = 0;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onHandlePointerMove(event: PointerEvent) {
		if (!dragging) return;
		const deltaY = event.clientY - dragStartY;
		const deltaTime = Math.max(1, event.timeStamp - lastDragTime);
		const instantVelocity = (event.clientY - lastDragY) / deltaTime;
		dragVelocityY = dragVelocityY * 0.65 + instantVelocity * 0.35;
		panelPosition = Math.min(dragDistance, Math.max(hiddenPosition, dragStartPosition + deltaY));
		lastDragY = event.clientY;
		lastDragTime = event.timeStamp;
	}

	function onHandlePointerUp(event: PointerEvent) {
		if (!dragging) return;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		const projectedPosition = panelPosition + dragVelocityY * releaseProjectionMs;
		settlePanel(nearestPanelState(projectedPosition));
		dragging = false;
		dragVelocityY = 0;
	}
</script>

<svelte:window bind:innerWidth={windowWidth} />

{#if visible}
	<div transition:fly={{ y: -120 }} class="pointer-events-none absolute left-0 right-0 z-30 flex justify-center px-3" style:top="{popupTop}px">
		<div
			bind:this={popup}
			class="pointer-events-auto relative flex max-w-[calc(100vw-24px)] flex-col items-center justify-center gap-1 overflow-hidden bg-background text-info transition-[width,border-radius,padding,transform] duration-300 ease-in-out"
			class:duration-0={dragging}
			style:width={`${popupWidth}px`}
			style:transform={`translateY(${dragOffsetY}px)`}
			style:border-radius={`${16 + 12 * detailsProgress}px`}
			style:padding={`${8 + 8 * detailsProgress}px ${8 + 12 * detailsProgress}px ${8 + 8 * detailsProgress}px`}
			style:box-shadow="0px 0px 20px 0px var(--color-shadow)"
		>
			<div class="grid w-full">
			{#if pendingSubmission && thankYouVisible}
				<div class="col-start-1 row-start-1 flex w-full flex-col items-center gap-2" transition:fade={{ duration: 150 }}>
					<div class="flex items-center gap-2 text-sm font-bold text-info">
						<span>{$t('rating_thank_you')}</span>
						{#if pendingSubmission.rating === 1}
							<IconMoodWrrr size={32} stroke={1.7} class="shrink-0 text-primary" />
						{:else if pendingSubmission.rating === 2}
							<IconMoodConfuzedFilled size={32} stroke={1.7} class="shrink-0 text-primary" />
						{:else if pendingSubmission.rating === 3}
							<IconMoodEmptyFilled size={32} stroke={1.7} class="shrink-0 text-primary" />
						{:else if pendingSubmission.rating === 4}
							<IconMoodSmileFilled size={32} stroke={1.7} class="shrink-0 text-primary" />
						{:else if pendingSubmission.rating === 5}
							<IconMoodHappyFilled size={32} stroke={1.7} class="shrink-0 text-primary" />
						{/if}
					</div>
					<button class="h-9 rounded-lg bg-background-secondary px-4 text-sm font-bold text-info active:bg-background-tertiary" onclick={undoPendingSubmission}>
						{$t('undo_button')}
					</button>
					<div class="h-[5px] w-full overflow-hidden rounded-full bg-background-secondary">
						{#key pendingSubmissionId}
							<div
								class="h-full rounded-full bg-primary transition-[width] ease-linear"
								style:width={undoProgressStarted ? '0%' : '100%'}
								style:transition-duration={undoProgressStarted ? `${ratingUndoDelay}ms` : '0ms'}
							></div>
						{/key}
					</div>
				</div>
			{:else}
				<div class="col-start-1 row-start-1 flex w-full flex-col items-center gap-1" transition:fade={{ duration: 150 }}>
				<span
					class="mx-1 whitespace-nowrap text-center font-bold text-info transition-[font-size,line-height,margin-bottom] duration-300 ease-in-out"
					class:duration-0={dragging}
					style:font-size={`${14 + 4 * detailsProgress}px`}
					style:line-height={`${18 + 6 * detailsProgress}px`}
					style:margin-bottom={`${12 * detailsProgress}px`}
				>{$t('last_trip_question')}</span>

				<div
					class="grid grid-cols-5 transition-[gap,margin-bottom] duration-300 ease-in-out"
					class:duration-0={dragging}
					style:gap={`${3 + 5 * detailsProgress}px`}
					style:margin-bottom={`${24 * detailsProgress}px`}
				>
				<button class="flex h-10 w-10 items-center justify-center rounded-full" aria-label="1" onclick={() => setRating(1)}>
					{#if rating === 1}
						<IconMoodWrrr size={40} stroke={1.7} class="fill-primary text-primary" />
					{:else}
						<IconMoodWrrr size={40} stroke={1.7} class="text-primary" />
					{/if}
				</button>
				<button class="flex h-10 w-10 items-center justify-center rounded-full" aria-label="2" onclick={() => setRating(2)}>
					{#if rating === 2}
						<IconMoodConfuzedFilled size={40} stroke={1.7} class="text-primary" />
					{:else}
						<IconMoodConfuzed size={40} stroke={1.7} class="text-primary" />
					{/if}
				</button>
				<button class="flex h-10 w-10 items-center justify-center rounded-full" aria-label="3" onclick={() => setRating(3)}>
					{#if rating === 3}
						<IconMoodEmptyFilled size={40} stroke={1.7} class="text-primary" />
					{:else}
						<IconMoodEmpty size={40} stroke={1.7} class="text-primary" />
					{/if}
				</button>
				<button class="flex h-10 w-10 items-center justify-center rounded-full" aria-label="4" onclick={() => setRating(4)}>
					{#if rating === 4}
						<IconMoodSmileFilled size={40} stroke={1.7} class="text-primary" />
					{:else}
						<IconMoodSmile size={40} stroke={1.7} class="text-primary" />
					{/if}
				</button>
				<button class="flex h-10 w-10 items-center justify-center rounded-full" aria-label="5" onclick={() => setRating(5)}>
					{#if rating === 5}
						<IconMoodHappyFilled size={40} stroke={1.7} class="text-primary" />
					{:else}
						<IconMoodHappy size={40} stroke={1.7} class="text-primary" />
					{/if}
				</button>
			</div>

			<div
				class="grid w-full transition-[grid-template-rows,opacity] duration-300 ease-in-out"
				class:duration-0={dragging}
				style:grid-template-rows={`${detailsProgress}fr`}
				style:opacity={detailsProgress}
				aria-hidden={!detailsVisible}
			>
				<div bind:this={detailsContent} class="min-h-0 overflow-hidden">
					<h3 class="mb-5 text-center text-lg font-bold leading-tight">{$t('rating_problem_question')}</h3>
					<div class="mb-3 flex flex-wrap justify-center gap-3">
						{#each badTripReasons as reason}
							<button
								class="flex min-h-9 items-center justify-center rounded-lg px-3 text-center text-base font-medium transition-colors {selectedReasons.includes(reason) ? 'bg-neutral-400 text-white dark:bg-neutral-600' : 'bg-background-secondary text-info'}"
								onclick={() => toggleReason(reason)}
							>
								<span>{ $t(reason) }</span>
							</button>
						{/each}
					</div>
					<button class="mx-auto mb-6 flex h-9 items-center rounded-lg px-4 text-base transition-colors {selectedReasons.includes('rating_reason_other') ? 'bg-neutral-400 text-white dark:bg-neutral-600' : 'bg-background-secondary text-info'}" onclick={() => toggleReason('rating_reason_other')}>
						<IconPlus size={16} class="mr-1" />
						{$t('rating_other_button')}
					</button>
					<div class="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out {selectedReasons.includes('rating_reason_other') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}">
						<div class="min-h-0 overflow-hidden">
							<label class="mb-3 block text-sm font-bold" for="rating-other-reason">{$t('rating_other_label')}</label>
							<textarea
								id="rating-other-reason"
								class="mb-6 h-40 w-full resize-none rounded-lg border border-background-tertiary bg-background-secondary text-lg text-info placeholder:text-label focus:border-primary focus:ring-primary"
								placeholder={$t('rating_other_placeholder')}
								bind:value={otherReason}
							></textarea>
						</div>
					</div>
				</div>
			</div>

			<div
				class="grid w-full transition-[grid-template-rows,opacity] duration-300 ease-in-out"
				class:duration-0={dragging}
				style:grid-template-rows={`${detailsProgress}fr`}
				style:opacity={detailsProgress}
				aria-hidden={!detailsVisible}
			>
				<div class="min-h-0 overflow-hidden">
					<button
						class="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-3 text-base font-bold text-background disabled:opacity-50"
						disabled={rating === undefined || submitting}
						onclick={submitRating}
					>
						{$t('rating_submit_button')}
					</button>
				</div>
			</div>

			{#if alwaysShowDragExplainerForTesting || dragExplainerVisible}
				<div class="mt-1 w-full">
					<div class="rounded-lg bg-background-secondary px-3 py-2 text-center text-xs font-semibold leading-tight text-info">
						{$t('rating_drag_explainer')}
					</div>
				</div>
			{/if}
				</div>
				<div
					class="mt-1 flex h-4 w-full touch-none items-center justify-center"
					role="slider"
					tabindex="0"
					aria-label={$t('rating_drag_handle_label')}
					aria-valuemin="0"
					aria-valuemax="1"
					aria-valuenow={detailsProgress}
					onpointerdown={onHandlePointerDown}
					onpointermove={onHandlePointerMove}
					onpointerup={onHandlePointerUp}
					onpointercancel={onHandlePointerUp}
				>
					<div class="h-[6px] w-16 rounded-full bg-background-tertiary"></div>
				</div>
			{/if}
			</div>
		</div>
	</div>
{/if}
