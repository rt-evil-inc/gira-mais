<script lang="ts">
	import { getIssueCategories, submitTripIssue } from '$lib/gira-api/api';
	import type { CompletedTrip, IssueCategory } from '$lib/gira-api/models';
	import { dismissCompletedTrip } from '$lib/trip';
	import { t } from '$lib/translations';
	import { enqueueDialog, errorMessages, safeInsets } from '$lib/ui.svelte';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconX from '@tabler/icons-svelte/icons/x';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	let { trip }: { trip: CompletedTrip } = $props();
	let categories: IssueCategory[] = $state([]);
	let categoryId: number | undefined = $state();
	let comment = $state('');
	let sending = $state(false);

	onMount(() => {
		void getIssueCategories().then(value => categories = value).catch(error => console.error('Could not load issue categories', error));
	});

	function durationMinutes() {
		return Math.max(0, Math.round((trip.endedAt.getTime() - trip.startedAt.getTime()) / 60_000));
	}

	async function sendReport(dismiss: () => void) {
		if (!comment.trim() || categoryId == null || sending) return;
		sending = true;
		try {
			await submitTripIssue({ tripId: trip.id, bikeId: trip.bikeId, comment: comment.trim(), issueCategoryId: categoryId });
			errorMessages.add($t('report_sent_message'));
			dismiss();
		} catch (error) {
			console.error('Could not submit trip issue', error);
			errorMessages.add($t('report_failed_message'));
		} finally {
			sending = false;
		}
	}
</script>

{#snippet reportDialog(dismiss: () => void)}
	<div class="w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-background p-5 shadow-lg">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="font-bold text-info">{$t('report_trip_problem')}</h2>
			<button onclick={dismiss} aria-label="Close"><IconX class="text-label" size={22} /></button>
		</div>
		<label class="mb-1 block text-xs font-semibold text-label" for="issue-category">{$t('problem_category_label')}</label>
		<select id="issue-category" bind:value={categoryId} class="mb-3 w-full rounded-lg border-background-tertiary bg-background-secondary text-info">
			<option value={undefined} disabled>—</option>
			{#each categories as category}
				<option value={category.id}>{category.name}</option>
			{/each}
		</select>
		<label class="mb-1 block text-xs font-semibold text-label" for="issue-comment">{$t('problem_comment_label')}</label>
		<textarea id="issue-comment" bind:value={comment} rows="4" class="w-full rounded-lg border-background-tertiary bg-background-secondary text-info"></textarea>
		<button disabled={sending || categoryId == null || !comment.trim()} onclick={() => sendReport(dismiss)} class="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-background disabled:opacity-50">
			{$t('send_report_label')}
		</button>
	</div>
{/snippet}

<div transition:fly={{ y: -80 }} class="absolute left-1/2 z-20 w-[360px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-2xl bg-background p-4 shadow-xl" style:top={`${Math.max(12, $safeInsets.top + 8)}px`}>
	<div class="flex items-start gap-3">
		<div class="rounded-full bg-primary p-1 text-background"><IconCheck size={20} /></div>
		<div class="min-w-0 grow">
			<div class="font-bold text-info">{$t('trip_completed_title')}</div>
			<div class="text-sm text-label">
				{trip.bikeId ?? '—'} · {durationMinutes()} {$t('minutes_label')}
				{#if trip.cost != null} · {$t('trip_cost_label')} {trip.cost.toFixed(2)} €{/if}
			</div>
			{#if trip.endStation}<div class="truncate text-xs text-label">{trip.endStation}</div>{/if}
			<button class="mt-2 text-sm font-semibold text-primary" onclick={() => enqueueDialog(reportDialog)}>{$t('report_trip_problem')}</button>
		</div>
		<button onclick={dismissCompletedTrip} aria-label="Close"><IconX class="text-label" size={20} /></button>
	</div>
</div>
