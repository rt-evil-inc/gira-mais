<script lang="ts">
	import Floating from '$lib/components/Floating.svelte';
	import LocationButton from '$lib/components/LocationButton.svelte';
	import Login from '$lib/components/Login.svelte';
	import Map from '$lib/components/Map.svelte';
	import ProfileButton from '$lib/components/ProfileButton.svelte';
	import Profile from '$lib/components/Profile.svelte';
	import StationMenu from '$lib/components/StationMenu.svelte';
	import TripStatus from '$lib/components/TripStatus.svelte';
	import TripRating from '$lib/components/TripRating.svelte';
	import { currentTrip, tripRating } from '$lib/trip';
	import { following, selectedStation } from '$lib/map';
	import { safeInsets } from '$lib/ui';
	import { Geolocation } from '@capacitor/geolocation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { fade } from 'svelte/transition';
	import { watchPosition } from '$lib/location';
	import { onMount } from 'svelte';
	import Compass from '$lib/components/Compass.svelte';
	import ErrorMessage from '$lib/components/ErrorMessage.svelte';
	import { App } from '@capacitor/app';
	import { token } from '$lib/account';
	import type { PluginListenerHandle } from '@capacitor/core';
	import InfoDialog from '$lib/components/InfoDialog.svelte';
	import SupportButton from '$lib/components/SupportButton.svelte';
	import NetworkWarning from '$lib/components/NetworkWarning.svelte';
	import { Network, type ConnectionStatus } from '@capacitor/network';

	let backListener: PluginListenerHandle;
	let menuHeight = 0;
	let stationMenuPos:number|undefined = 0;
	let tripStatusHeight:number = 0;
	let tripStatusWidth:number = 0;
	let profileOpen = false;
	let locationPermission = false;
	let networkStatus = true;

	onMount(() => {
		Geolocation.checkPermissions().then(({ location }) => {
			locationPermission = location == 'granted';
			setTimeout(() => {
				if (locationPermission) {
					$following = true;
					// watchPosition();
					currentTrip.subscribe(trip => {
						if (trip === null) watchPosition(); // Remove background watcher when no trip is active
					});
				}
			}, 500);
		});

		App.addListener('backButton', () => {
			if (!profileOpen) {
				if ($selectedStation != null) {
					$selectedStation = null;
				} else {
					App.exitApp();
				}
			}
		}).then(l => backListener = l);

		return () => backListener?.remove();
	});

	Network.getStatus().then((s: ConnectionStatus) => networkStatus = s.connected);
	Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
		networkStatus = status.connected;
	});
</script>

<div class="h-full w-full relative overflow-hidden">
	{#if $token === null}
		<div transition:fade={{ duration: 150 }} class="absolute w-full h-full z-20 flex items-center justify-center">
			<Login />
		</div>
	{/if}
	<Map loading={!$token} bind:bottomPadding={menuHeight} bind:topPadding={tripStatusHeight} bind:leftPadding={tripStatusWidth} />

	{#if $currentTrip !== null}
		<TripStatus bind:height={tripStatusHeight} bind:width={tripStatusWidth} />
	{:else}
		<StationMenu bind:posTop={stationMenuPos} bind:bikeListHeight={menuHeight} />
		{#if $tripRating.currentRating != null && networkStatus}
			<TripRating tripCode={$tripRating.currentRating.code} bikePlate={$tripRating.currentRating.bikePlate} date={$tripRating.currentRating.endDate} />
		{/if}
	{/if}

	{#if !networkStatus}
		<NetworkWarning />
	{/if}

	<Floating right={20} y={stationMenuPos} bottom offset={20}>
		<LocationButton bind:locationPermission />
	</Floating>

	<Floating right={16} y={tripStatusHeight} offset={16}>
		<ProfileButton on:click={() => profileOpen = true}/>
	</Floating>

	<Floating right={20} y={Math.max(tripStatusHeight + 16, $safeInsets.top)} offset={70}>
		<Compass />
	</Floating>

	<Floating left={20} y={tripStatusHeight} offset={20}>
		<SupportButton />
	</Floating>

	{#if profileOpen}
		<Profile on:close={() => profileOpen = false}/>
	{/if}
</div>

<InfoDialog />
<ErrorMessage />