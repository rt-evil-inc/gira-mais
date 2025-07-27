<script>
	import { currentTrip } from '$lib/trip';
</script>

{#if $currentTrip !== null}
	<a href="tel:211163125" aria-label="Call support" class="bg-background dark:bg-background-secondary p-2 rounded-full grid grid-cols-1 grid-rows-1 w-12 h-12 active:bg-background dark:active:bg-background-tertiary transition-colors stroke-label" style:filter="drop-shadow(0px 0px 20px var(--color-shadow))">
		<svg class="mt-[1px]" width="32" height="32" viewBox="0 0 89 75" fill="none" stroke-width="7" xmlns="http://www.w3.org/2000/svg">
			<path d="M11.2178 13.4736H24.7785L31.5588 30.4245L23.0834 35.5097C26.7141 42.8716 32.6724 48.8298 40.0342 52.4605L45.1195 43.9851L62.0703 50.7655V64.3261C62.0703 66.1244 61.356 67.849 60.0844 69.1205C58.8128 70.3921 57.0882 71.1064 55.29 71.1064C42.0658 70.3028 29.593 64.6872 20.2249 55.319C10.8568 45.9509 5.24114 33.4781 4.4375 20.254C4.4375 18.4557 5.15185 16.7311 6.42341 15.4595C7.69497 14.188 9.41958 13.4736 11.2178 13.4736Z" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M63.3984 17.9033V26.411" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M73.7696 41.2904H80.6388C81.3491 41.2822 82.045 41.0883 82.6572 40.7278C83.2694 40.3674 83.7767 39.853 84.1285 39.2358C84.4803 38.6186 84.6645 37.92 84.6627 37.2096C84.661 36.4992 84.4733 35.8016 84.1184 35.1861L66.8775 6.39606C66.5148 5.79734 66.0038 5.30228 65.3939 4.95868C64.784 4.61509 64.0958 4.43457 63.3958 4.43457C62.6957 4.43457 62.0075 4.61509 61.3976 4.95868C60.7877 5.30228 60.2767 5.79734 59.914 6.39606V6.39819L44.2617 32.5317" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M63.3984 35.792H63.4182" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</a>
{/if}