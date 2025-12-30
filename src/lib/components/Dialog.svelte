<script lang="ts">
	import { dialogQueue, keyboard } from '$lib/ui.svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	let toRender = $derived(dialogQueue[0]);
</script>
{#if toRender}
	<div class="top-0 z-[100] fixed w-screen h-screen flex flex-col items-center justify-center transition-all"
		transition:fade="{{ duration: 300, easing: cubicInOut }}"
		style:padding-bottom={Math.max(0, keyboard.height - 20) + 'px'}>
		<button class="absolute w-full h-full bg-black/40 -z-10"
			onclick={() => toRender.dismiss() }
			aria-label="Dismiss dialog"
		></button>
		{@render toRender.snippet(toRender.dismiss)}
	</div>
{/if}