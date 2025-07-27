<script lang="ts">
	import { accountInfo, user } from '$lib/account';
	import IconMoonFilled from '@tabler/icons-svelte/icons/moon-filled';
	import { onDestroy } from 'svelte';

	let { onclick }: {onclick: () => void} = $props();

	let offHours = $state((new Date).getHours() >= 2 && (new Date).getHours() < 6);
	let noSubscription = $state(false);
	let negativeBalance = $state(false);

	$effect(() => {
		noSubscription = $accountInfo?.subscription === null;
		negativeBalance = ($accountInfo?.balance ?? 0) < 0;
	});

	const interval = setInterval(() => {
		offHours = (new Date).getHours() >= 2 && (new Date).getHours() < 6;
	}, 60 * 1000);
	onDestroy(() => clearInterval(interval));
</script>

{#if $user}
	<button class="relative group" style:filter="drop-shadow(0px 0px 20px var(--color-shadow))" {onclick}>
		<svg class="-m-2" width="72" height="72" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
			<g>
				<path class={noSubscription || offHours ? 'fill-label' : negativeBalance ? 'fill-warning' : 'fill-primary'} d="M156.963 119.452C159.69 120.499 161.069 123.568 159.822 126.208C154.644 137.163 146.715 146.628 136.771 153.656C125.384 161.703 111.867 166.193 97.9277 166.558C83.9889 166.923 70.2549 163.147 58.4624 155.706C46.67 148.266 37.3487 137.495 31.6773 124.757C26.0059 112.019 24.2392 97.8854 26.6006 84.1432C28.9619 70.401 35.3452 57.6677 44.9434 47.5534C54.5415 37.439 66.9233 30.398 80.5231 27.3207C92.3994 24.6334 104.739 25.0742 116.344 28.5568C119.141 29.3961 120.499 32.475 119.452 35.2012V35.2012C118.406 37.9275 115.352 39.2649 112.544 38.4627C102.902 35.7079 92.6926 35.4094 82.857 37.635C71.2972 40.2507 60.7726 46.2355 52.6142 54.8327C44.4558 63.4299 39.03 74.2532 37.0228 85.9341C35.0157 97.6149 36.5174 109.629 41.3381 120.456C46.1587 131.283 54.0818 140.438 64.1054 146.763C74.129 153.087 85.8029 156.297 97.6509 155.987C109.499 155.677 120.989 151.86 130.668 145.02C138.903 139.2 145.512 131.413 149.917 122.404C151.2 119.781 154.237 118.406 156.963 119.452V119.452Z" />
				<path class={noSubscription || offHours ? 'fill-label' : negativeBalance ? 'fill-warning' : 'fill-primary'} d="M127.455 38.8036C128.871 36.2495 132.102 35.3103 134.543 36.9134C145.452 44.0784 154.189 54.1537 159.734 66.0451C165.279 77.9365 167.381 91.1059 165.858 104.068C165.517 106.968 162.721 108.84 159.854 108.283C156.988 107.726 155.14 104.95 155.443 102.046C156.563 91.2828 154.751 80.381 150.15 70.5143C145.549 60.6476 138.363 52.2519 129.398 46.1922C126.978 44.5569 126.04 41.3576 127.455 38.8036Z" />
				<g>
					<circle cx="96" cy="96" r="50" class="group-active:fill-background-secondary dark:group-active:fill-background-tertiary fill-background dark:fill-background-secondary transition-colors" />
				</g>
			</g>
		</svg>
		{#if offHours}
			<IconMoonFilled size={24} class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-semibold text-info" />
		{:else}
			<span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-semibold text-info">{$user.name.charAt(0)}</span>
		{/if}
	</button>
{/if}