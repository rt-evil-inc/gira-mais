<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		description: string;
		/** The control shown on the right: a toggle, a select, ... */
		children?: Snippet;
	}

	let { label, description, children }: Props = $props();
</script>

<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
	<div class="grow">
		<div class="font-semibold leading-tight mb-1">{label}</div>
		<div class="text-xs font-medium leading-[1.1] text-label">{description}</div>
	</div>
	{@render children?.()}
</div>