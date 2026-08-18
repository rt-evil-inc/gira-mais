<script lang="ts">
	import { errorMessages, keyboard } from '$lib/ui.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';

	interface Props {
		/** Window-top offset of the station menu sheet, so toasts sit right above it instead of covering the bike list. */
		menuPos?: number;
	}
	let { menuPos = undefined }: Props = $props();

	let innerHeight = $state(0);
	const bottom = $derived(menuPos !== undefined && menuPos < innerHeight ? innerHeight - menuPos + 12 : 40);
</script>

<svelte:window bind:innerHeight />

<div
	class="flex flex-col pointer-events-none z-[110] absolute left-1/2 -translate-x-1/2 items-center gap-2 transition-[bottom] duration-300 ease-out"
	style:bottom={bottom + 'px'}
	style:padding-bottom={Math.max(0, keyboard.height - 20) + 'px'}
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