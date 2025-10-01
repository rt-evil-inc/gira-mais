<script lang="ts">
	import { dialogQueue } from '$lib/ui.svelte';
	import { Keyboard } from '@capacitor/keyboard';
	import { onDestroy } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	let toRender = $derived(dialogQueue[0]);

	let keyboardHeight = $state(0);
	Keyboard.addListener('keyboardWillShow', info => keyboardHeight = info.keyboardHeight);
	Keyboard.addListener('keyboardWillHide', () => keyboardHeight = 0);

	onDestroy(() => {
		Keyboard.removeAllListeners();
	});
</script>
{#if toRender}
	<div class="top-0 z-[100] fixed w-screen h-screen flex flex-col items-center justify-center" transition:fade="{{ duration: 50, easing: cubicOut }}" style:padding-bottom="{keyboardHeight - 20}px">
		<button class="absolute w-full h-full bg-black/40 -z-10"
			onclick={() => toRender.dismiss() }
			aria-label="Dismiss dialog"
		></button>

		{@render toRender.snippet(toRender.dismiss)}
	</div>
{/if}