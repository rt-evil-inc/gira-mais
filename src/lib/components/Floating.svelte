<script lang="ts">
	import { safeInsets } from '$lib/ui.svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		offset?: number;
		y?: number|undefined;
		left?: undefined|number;
		right?: undefined|number;
		bottom?: boolean;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let {
		offset = 0,
		y = 0,
		left = undefined,
		right = undefined,
		bottom = false,
		class: klass = '',
		children,
	}: Props = $props();
	let pos = $state(0), innerHeight = $state(0);
	// Applied through the effect so horizontal moves also hide the content and
	// fade it back in at the new position, same as vertical ones (it runs
	// before first paint, like the `pos` assignment)
	let x = $state<{ left: number|undefined, right: number|undefined }>({ left: undefined, right: undefined });

	let show = $state(true);
	$effect(() => {
		show = false;
		x = { left, right };
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
		<div transition:fade={{ duration: 150 }} class="absolute {klass}" style:left="{x.left}px" style:right="{x.right}px" style:top="{bottom ? '' : pos + 'px'}" style:bottom="{bottom ? pos + 'px' : ''}">
			{@render children?.()}
		</div>
	{/if}
{/key}