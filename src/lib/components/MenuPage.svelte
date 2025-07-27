<script lang="ts">
	import { safeInsets } from '$lib/ui';
	import { fly } from 'svelte/transition';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<div transition:fly={{ duration: 150, x: 100 }} class="bg-background col-start-1 col-end-2 row-start-1 row-end-2 z-40">
	<div class="flex flex-col h-screen" style:padding-top={Math.max($safeInsets.top, 16) + 42 + 'px'}>
		<div class="flex flex-col h-full overflow-y-auto">
			<div class="fixed left-0 right-0 h-4 -mt-4" style:box-shadow="0px 6px 6px 0px var(--color-background)"></div>
			{@render children?.()}
		</div>
	</div>
</div>