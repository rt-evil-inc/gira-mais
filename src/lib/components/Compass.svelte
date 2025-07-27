<script lang="ts">
	import { bearing, bearingNorth } from '$lib/location';
	import { fade } from 'svelte/transition';
</script>

{#if $bearing !== 0}
	<button aria-label="Reorient Compass" onclick={() => bearingNorth.set(true)} transition:fade={{ duration: 150 }} class="bg-background dark:bg-background-secondary p-2 rounded-full grid grid-cols-1 grid-rows-1 w-12 h-12 active:bg-background-secondary dark:active:bg-background-tertiary" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
		<svg class="w-full h-full" style:transform="rotate({-$bearing}deg)" width="30" height="90" viewBox="0 0 30 90" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path fill-rule="evenodd" clip-rule="evenodd" d="M28.5166 52.6049C29.2024 50.5049 29.5452 47.7524 29.5452 45H0.45459C0.454585 47.7524 0.797443 50.5049 1.48317 52.6049L12.5167 86.3953C13.8881 90.5953 16.1117 90.5953 17.4831 86.3953L28.5166 52.6049Z" class="fill-background-tertiary dark:fill-label dark:opacity-50" />
			<path d="M28.5166 37.3952L17.4831 3.60487C16.1117 -0.595175 13.8881 -0.595177 12.5167 3.60486L1.48317 37.3952C0.797454 39.4952 0.454595 42.2476 0.45459 45H29.5452C29.5452 42.2476 29.2024 39.4952 28.5166 37.3952Z" class="fill-primary" />
			<circle cx="15" cy="45" r="6" class="fill-background dark:fill-background-secondary active:bg-background-secondary dark:active:bg-background-tertiary"/>
		</svg>
	</button>
{/if}