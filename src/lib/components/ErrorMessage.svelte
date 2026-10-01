<script lang="ts">
	import { dialogQueue, errorMessages, keyboard } from '$lib/ui.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';

	interface Props {
		/** Window-top offset of the station menu sheet, so toasts sit right above it instead of covering the bike list. */
		menuPos?: number;
	}
	let { menuPos = undefined }: Props = $props();

	let innerHeight = $state(0);
	// A dialog's backdrop covers the sheet, so its toasts shouldn't chase the sheet's edge.
	const aboveMenu = $derived(dialogQueue.length === 0 && menuPos !== undefined && menuPos < innerHeight ? innerHeight - menuPos + 12 : 40);
	// The keyboard overlays the sheet (the webview doesn't resize), so sit above whichever edge is higher.
	// Adding the two instead pushed toasts past the top of the screen whenever a tall sheet met the keyboard.
	const bottom = $derived(keyboard.visible ? Math.max(aboveMenu, keyboard.height + 12) : aboveMenu);
</script>

<svelte:window bind:innerHeight />

<div
	class="flex flex-col pointer-events-none z-[110] absolute left-1/2 -translate-x-1/2 items-center gap-2 transition-[bottom] duration-300 ease-out"
	style:bottom={bottom + 'px'}
>
	{#each $errorMessages as error (error.id)}
		<div animate:flip={{ duration: 400 }} transition:fly={{ y: 80 }} class="flex items-center gap-2 w-max max-w-[85vw] font-bold text-sm bg-warning text-background rounded-2xl py-2.5 px-3" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
			<IconAlertTriangle size={20} stroke={2} class="shrink-0" />
			<span>{error.msg}</span>
			{#if error.count > 1}
				<span class="rounded-full px-1.5 py-0.5 text-xs leading-none shrink-0 bg-black/20">×{error.count}</span>
			{/if}
		</div>
	{/each}
</div>