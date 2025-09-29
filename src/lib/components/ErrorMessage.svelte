<script lang="ts">
	import { errorMessages } from '$lib/ui.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
</script>

<div class="flex flex-col pointer-events-none z-50 absolute bottom-10 left-1/2 -translate-x-1/2 items-center gap-2">
	{#each $errorMessages as error (error.id)}
		<div animate:flip={{ duration: 400 }} transition:fly={{ y: 80 }} class="bg-warning py-2 px-3 font-bold text-sm text-background rounded-xl w-max max-w-[85vw]">
			{error.msg}
		</div>
	{/each}
</div>