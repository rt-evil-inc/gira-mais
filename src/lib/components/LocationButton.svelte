<script lang="ts">
	import { currentPos, watchPosition } from '$lib/location';
	import { following } from '$lib/map.svelte';
	import { Capacitor } from '@capacitor/core';
	import { Geolocation } from '@capacitor/geolocation';
	import { draw } from 'svelte/transition';

	interface Props {
		locationPermission?: boolean;
	}

	let { locationPermission = $bindable(false) }: Props = $props();
</script>

<button class="bg-background dark:bg-background-secondary p-2 rounded-full grid grid-cols-1 grid-rows-1 w-12 h-12 active:bg-background dark:active:bg-background-tertiary transition-colors" style:box-shadow="0px 0px 20px 0px var(--color-shadow)"
	onclick={() => {
		if (locationPermission) {
			$following = !$following;
			if ($following) watchPosition();
		} else {
			if (Capacitor.getPlatform() !== 'web') {
				Geolocation.requestPermissions().then(({ location }) => {
					locationPermission = location == 'granted';
					if (locationPermission) {
						$following = true;
						watchPosition();
					}
				});
			} else {
				watchPosition();
			}
		}
	}} >
	{#if locationPermission}
		<div style="grid-row: 1;grid-column: 1;" >
			<svg
				xmlns="http://www.w3.org/2000/svg" class="transition-all {$currentPos ? '' : 'animate-[spin_3s_linear_infinite]'} {$following ? 'text-primary' : 'text-label'}" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
				<path transition:draw={{ duration: 150 }} stroke="none" d="M0 0h24v24H0z" fill="none"/>
				<path transition:draw={{ duration: 150 }} class:animate-searching={!$currentPos} d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
				<path transition:draw={{ duration: 150 }} d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" />
				<path d="M12 4l0 -2" />
				<path d="M12 20l0 2" />
				<path d="M20 12h2" />
				<path d="M4 12l-2 0" />
			</svg>
		</div>
	{:else}
		<div style="grid-row: 1;grid-column: 1;" >
			<svg
				xmlns="http://www.w3.org/2000/svg" class="text-warning" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
				<path transition:draw={{ duration: 150 }} stroke="none" d="M0 0h24v24H0z" fill="none"/>
				<path transition:draw={{ duration: 150 }} d="M9.75 9.856C9.75 9.43006 9.9573 9.02157 10.3263 8.72039C10.6953 8.4192 11.1957 8.25 11.7176 8.25H12.2797C12.8016 8.25 13.302 8.4192 13.671 8.72039C14.04 9.02157 14.2473 9.43006 14.2473 9.856C14.268 10.2036 14.1695 10.5481 13.9668 10.8378C13.764 11.1274 13.4678 11.3465 13.123 11.462C12.7781 11.616 12.482 11.9081 12.2792 12.2943C12.0764 12.6805 11.9779 13.1399 11.9986 13.6033M11.9986 15.7446V15.75" />
				<path transition:draw={{ duration: 150 }} d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" />
				<path d="M12 4l0 -2" />
				<path d="M12 20l0 2" />
				<path d="M20 12h2" />
				<path d="M4 12l-2 0" />
			</svg>
		</div>
	{/if}
</button>

<style>
	@keyframes searching {
		50% {
			opacity: 0;
		}
	}

	.animate-searching {
		animation: searching 1s infinite;
	}
</style>