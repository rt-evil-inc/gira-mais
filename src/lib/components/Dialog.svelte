<script lang="ts">
	import { dialogQueue, keyboard } from '$lib/ui.svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	let toRender = $derived(dialogQueue[0]);

	function stopScrolling(e: TouchEvent) {
		e.preventDefault();
	}
	$effect(() => {
		if (toRender) {
			document.documentElement.addEventListener('touchmove', stopScrolling, { passive: false });
		} else {
			document.documentElement.removeEventListener('touchmove', stopScrolling);
		}
	});
</script>
{#if toRender}
	<div class="top-0 z-[100] fixed w-screen h-screen flex flex-col items-center justify-center transition-all"
		transition:fade="{{ duration: 300, easing: cubicInOut }}"
	>
		<div class="absolute w-full h-full bg-black/40 -z-10"
			onpointerdown={() => {
				toRender.dismiss();
			}}
			role="none"
		></div>
		{@render toRender.snippet(toRender.dismiss)}
		<div style:padding-bottom={Math.max(0, keyboard.height - 20) + 'px'} class="w-full"></div>
	</div>
{/if}