<script lang="ts">
	import { safeInsets } from '$lib/ui';
	import { fade } from 'svelte/transition';

	interface Props {
		offset?: number;
		y?: number|undefined;
		left?: undefined|number;
		right?: undefined|number;
		bottom?: boolean;
		children?: import('svelte').Snippet;
	}

	let {
		offset = 0,
		y = 0,
		left = undefined,
		right = undefined,
		bottom = false,
		children,
	}: Props = $props();
	let pos = $state(0), innerHeight = $state(0);

	let show = $state(true);
	$effect(() => {
		show = false;
		if (y !== undefined) {
			if (bottom) {
				pos = Math.max((innerHeight - y) + offset, $safeInsets.bottom);
			} else {
				pos = Math.max(y + offset, $safeInsets.top);
			}
			setTimeout(() => show = true, 150);
		}
	});
</script>

<svelte:window bind:innerHeight />

{#key pos}
	{#if show}
		<div transition:fade={{ duration: 150 }} class="absolute" style:left="{left}px" style:right="{right}px" style:top="{bottom ? '' : pos + 'px'}" style:bottom="{bottom ? pos + 'px' : ''}">
			{@render children?.()}
		</div>
	{/if}
{/key}