<script lang="ts">
	import { rateTrip } from '$lib/gira-api/api';
	import { postBikeRating, reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
	import { tripRating } from '$lib/trip';
	import { t } from '$lib/translations';
	import { errorMessages, keyboard, safeInsets } from '$lib/ui.svelte';
	import IconLoader2 from '@tabler/icons-svelte/icons/loader-2';
	import IconMoodConfuzed from '@tabler/icons-svelte/icons/mood-confuzed';
	import IconMoodConfuzedFilled from '@tabler/icons-svelte/icons/mood-confuzed-filled';
	import IconMoodEmpty from '@tabler/icons-svelte/icons/mood-empty';
	import IconMoodEmptyFilled from '@tabler/icons-svelte/icons/mood-empty-filled';
	import IconMoodHappy from '@tabler/icons-svelte/icons/mood-happy';
	import IconMoodHappyFilled from '@tabler/icons-svelte/icons/mood-happy-filled';
	import IconMoodSmile from '@tabler/icons-svelte/icons/mood-smile';
	import IconMoodSmileFilled from '@tabler/icons-svelte/icons/mood-smile-filled';
	import IconMoodWrrr from '@tabler/icons-svelte/icons/mood-wrrr';
	import IconMoodWrrrFilled from '@tabler/icons-svelte/icons/mood-wrrr-filled';
	import { fade, fly, slide } from 'svelte/transition';

	interface Props {
		tripCode: string;
		bikePlate: string;
		date?: Date;
	}

	let { tripCode, bikePlate, date }: Props = $props();

	const ratingOptions = [
		{ value: 1, icon: IconMoodWrrr, selectedIcon: IconMoodWrrrFilled, label: 'bike_rating_bad' },
		{ value: 2, icon: IconMoodConfuzed, selectedIcon: IconMoodConfuzedFilled, label: 'bike_rating_poor' },
		{ value: 3, icon: IconMoodEmpty, selectedIcon: IconMoodEmptyFilled, label: 'bike_rating_neutral' },
		{ value: 4, icon: IconMoodSmile, selectedIcon: IconMoodSmileFilled, label: 'bike_rating_ok' },
		{ value: 5, icon: IconMoodHappy, selectedIcon: IconMoodHappyFilled, label: 'bike_rating_good' },
	] as const;

	const issueOptions = [
		{ code: 'motor', label: 'trip_feedback_issue_motor' },
		{ code: 'pedals', label: 'trip_feedback_issue_pedals' },
		{ code: 'seat', label: 'trip_feedback_issue_seat' },
		{ code: 'tyre', label: 'trip_feedback_issue_tyre' },
		{ code: 'brakes', label: 'trip_feedback_issue_brakes' },
		{ code: 'handlebar', label: 'trip_feedback_issue_handlebar' },
	] as const;

	type IssueCode = typeof issueOptions[number]['code'];

	let rating = $state<number|null>(null);
	let selectedIssueCodes = $state<IssueCode[]>([]);
	let otherSelected = $state(false);
	let otherText = $state('');
	let submitting = $state(false);

	let showProblems = $derived(rating !== null && rating <= 3);

	function selectRating(value: number) {
		rating = value;
	}

	function toggleIssue(issueCode: IssueCode) {
		if (selectedIssueCodes.includes(issueCode)) {
			selectedIssueCodes = selectedIssueCodes.filter(selectedIssueCode => selectedIssueCode !== issueCode);
		} else {
			selectedIssueCodes = [...selectedIssueCodes, issueCode];
		}
	}

	function createFeedbackDescription() {
		if (!showProblems) return '';

		const descriptionParts = issueOptions
			.filter(option => selectedIssueCodes.includes(option.code))
			.map(option => $t(option.label));
		const trimmedOtherText = otherSelected ? otherText.trim() : '';
		if (trimmedOtherText) descriptionParts.push(trimmedOtherText);

		return descriptionParts.join('; ');
	}

	async function sendFeedback() {
		if (rating === null || submitting) return;

		submitting = true;
		const selectedRating = rating;
		const description = createFeedbackDescription();
		postBikeRating(tripCode, bikePlate, selectedRating, date?.toISOString()).catch(error => {
			reportErrorEvent('bike_rating_post_error', error instanceof Error ? error.message : String(error));
		});
		try {
			const response = await rateTrip(tripCode, selectedRating, description);
			if (!response.rateTrip) {
				errorMessages.add($t('rate_trip_error'));
				reportErrorEvent('rate_trip_error');
				return;
			}

			tripRating.set({ currentRating: null });
		} catch (error) {
			errorMessages.add($t('rate_trip_error'));
			reportErrorEvent('rate_trip_error', error instanceof Error ? error.message : String(error));
		} finally {
			submitting = false;
		}
	}
</script>

<section
	transition:fly={{ y: 180, duration: 200 }}
	class="pointer-events-auto absolute inset-x-0 z-20 mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-background px-5 pt-2 text-info transition-[bottom] duration-300"
	style:bottom="{keyboard.height}px"
	style:padding-bottom="{Math.max($safeInsets.bottom, 20)}px"
	style:max-height="calc(100vh - {keyboard.height + Math.max($safeInsets.top, 8)}px)"
	style:box-shadow="0px -8px 24px 0px var(--color-shadow)"
	aria-label={$t('last_trip_question')}
>
	<div class="mx-auto mb-3 h-1.5 w-16 rounded-full bg-background-tertiary"></div>
	<div class="flex flex-col items-center gap-2">
		<h2 class="text-sm font-bold">{$t('last_trip_question')}</h2>
		<div class="flex items-center justify-center gap-1" role="group" aria-label={$t('last_trip_question')}>
			{#each ratingOptions as option}
				{@const RatingIcon = rating === option.value ? option.selectedIcon : option.icon}
				<button
					type="button"
					class="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-transform active:scale-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					class:bg-background-secondary={rating === option.value}
					disabled={submitting}
					aria-label={$t(option.label)}
					aria-pressed={rating === option.value}
					onclick={() => selectRating(option.value)}
				>
					<RatingIcon size={38} stroke={1.8} />
				</button>
			{/each}
		</div>
	</div>

	{#if rating !== null}
		<div transition:slide={{ duration: 180 }} class="mt-3 flex flex-col gap-4">
			{#if showProblems}
				<div transition:fade={{ duration: 150 }} class="flex flex-col gap-3">
					<h3 class="text-center text-sm font-semibold text-label">{$t('trip_feedback_what_went_wrong')}</h3>
					<div class="grid grid-cols-2 gap-2">
						{#each issueOptions as issue}
							<button
								type="button"
								class="min-h-9 rounded-lg bg-background-secondary px-3 py-2 text-xs font-semibold text-label transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
								class:bg-primary={selectedIssueCodes.includes(issue.code)}
								class:text-background={selectedIssueCodes.includes(issue.code)}
								disabled={submitting}
								aria-pressed={selectedIssueCodes.includes(issue.code)}
								onclick={() => toggleIssue(issue.code)}
							>
								{$t(issue.label)}
							</button>
						{/each}
					</div>
					<button
						type="button"
						class="mx-auto rounded-lg bg-background-secondary px-4 py-2 text-xs font-semibold text-label transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						class:bg-primary={otherSelected}
						class:text-background={otherSelected}
						disabled={submitting}
						aria-pressed={otherSelected}
						onclick={() => otherSelected = !otherSelected}
					>
						+ {$t('trip_feedback_other')}
					</button>

					{#if otherSelected}
						<label transition:slide={{ duration: 150 }} class="flex flex-col gap-1 text-xs font-semibold text-label">
							{$t('trip_feedback_other_reason')}
							<textarea
								bind:value={otherText}
								rows="3"
								class="resize-none rounded-xl border border-background-tertiary bg-background-secondary p-3 text-sm font-medium text-info placeholder:text-label disabled:opacity-60 focus:border-primary focus:ring-primary"
								disabled={submitting}
								placeholder={$t('trip_feedback_other_placeholder')}
							></textarea>
						</label>
					{/if}
				</div>
			{/if}

			<button
				type="button"
				class="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-background disabled:opacity-60"
				disabled={submitting}
				aria-label={$t('trip_feedback_send')}
				aria-busy={submitting}
				onclick={sendFeedback}
			>
				{#if submitting}
					<span transition:fade={{ duration: 100 }} aria-hidden="true">
						<IconLoader2 class="animate-spin" size={24} />
					</span>
				{:else}
					{$t('trip_feedback_send')}
				{/if}
			</button>
		</div>
	{/if}
</section>