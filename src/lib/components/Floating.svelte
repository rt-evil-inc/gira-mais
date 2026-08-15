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
	let showTimeout: ReturnType<typeof setTimeout>;
	$effect(() => {
		// The right inset (notch side in landscape-secondary) is applied here;
		// left-anchored floats already ride the trip HUD's width, which reserves
		// the left inset itself
		const next = { left, right: right === undefined ? undefined : right + $safeInsets.right };
		const movedX = next.left !== x.left || next.right !== x.right;
		if (movedX) x = next;
		if (y === undefined) {
			show = false;
			return;
		}
		const nextPos = bottom ? Math.max((innerHeight - y) + offset, $safeInsets.bottom) : Math.max(y + offset, $safeInsets.top);
		// Anchors get re-pushed without actually moving (a trip update re-reserving
		// the same HUD height, an inset refetch) — blink only for a real move
		if (!movedX && nextPos === pos && show) return;
		pos = nextPos;
		show = false;
		clearTimeout(showTimeout);
		showTimeout = setTimeout(() => show = true, 150);
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