<script lang="ts">
	import { t } from '$lib/translations';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconX from '@tabler/icons-svelte/icons/x';

	let { url, dismiss }: { url: string, dismiss: () => void } = $props();

	const emelEmail = 'gira@emel.pt';
	const emelEmailLink = `<a href="mailto:${emelEmail}" class="text-primary underline">${emelEmail}</a>`;
</script>

<div class="w-[340px] max-w-md mx-auto p-6 bg-background rounded-2xl shadow-lg text-left flex flex-col gap-3">
	<div class="flex justify-between items-start gap-3">
		<h1 class="text-lg font-semibold text-warning flex items-center gap-2">
			<IconAlertTriangle size="22" stroke="2" class="shrink-0" />
			{$t('service_warning_title')}
		</h1>
		<IconX class="text-label hover:text-primary cursor-pointer shrink-0" size="24" stroke="1.5" onclick={dismiss} aria-label="Close dialog" />
	</div>
	<div class="text-sm text-label whitespace-pre-line">{@html $t('service_warning_message', { email: emelEmailLink })}</div>
	<div class="flex justify-end gap-5 mt-1 font-bold">
		<button class="text-label" onclick={dismiss}>{$t('cancel_button')}</button>
		<a href={url} class="text-primary" onclick={dismiss}>{$t('service_warning_continue')}</a>
	</div>
</div>