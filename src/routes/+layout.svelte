<script lang="ts">
	import { safeInsets } from '$lib/ui.svelte';
	import { appSettings } from '$lib/settings';
	import '@fontsource/inter/latin-400.css';
	import '@fontsource/inter/latin-500.css';
	import '@fontsource/inter/latin-600.css';
	import '@fontsource/inter/latin-700.css';
	import '@fontsource/roboto-mono/latin-400.css';
	import { onMount } from 'svelte';
	import { StatusBar, Style } from '@capacitor/status-bar';
	import { Capacitor } from '@capacitor/core';
	import { NavigationBar } from '@mauricewegner/capacitor-navigation-bar';
	import { SafeArea } from 'capacitor-plugin-safe-area';
	import '../app.css';
	import { App } from '@capacitor/app';
	import { loadUserCreds, refreshToken, token } from '$lib/account';
	import { updateActiveTripInfo, updateStations } from '$lib/injest-api-data';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { loadSettings } from '$lib/settings';
	import { reportAppUsageEvent } from '$lib/gira-mais-api/gira-mais-api';
	import { watchPosition } from '$lib/location';
	import { startDebugControls } from '$lib/debug';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
	import { theme } from '$lib/theme';

	function updateInsets() {
		SafeArea.getSafeAreaInsets().then(({ insets }) => {
			// Keep the old object when nothing changed, so subscribers (Floating
			// fades, TripStatus sizing) don't re-trigger on every keyboard resize
			safeInsets.update(cur => cur.top === insets.top && cur.bottom === insets.bottom && cur.left === insets.left && cur.right === insets.right ? cur : insets);
		});
	}

	if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
		StatusBar.setOverlaysWebView({ overlay: true });
		NavigationBar.setTransparency({ isTransparent: true });
		updateInsets();
		// Insets change with orientation. The plugin's safeAreaChanged event is
		// sensor-driven and often samples the insets before the window re-lays
		// out, delivering stale values at random — refetching when the webview
		// has actually resized reads them settled. Only width changes count:
		// the keyboard resizes the height and shifts the bottom inset, and
		// reacting to that would blink the floating UI and unfocus the search
		// bar under the user's fingers
		let lastWidth = window.innerWidth;
		window.addEventListener('resize', () => {
			if (window.innerWidth === lastWidth) return;
			lastWidth = window.innerWidth;
			updateInsets();
		});
	}

	onMount(() => {
		const stopDebugControls = import.meta.env.DEV ? startDebugControls() : undefined;
		loadUserCreds();
		loadSettings().then(() => {
			reportAppUsageEvent();
			appSettings.subscribe(() => {
				watchPosition();
			});
		});
		App.addListener('resume', async () => {
			if ($token != null && $token.refreshToken != null) {
				console.debug('Refreshing token because app was reopened');
				await refreshToken();
			}
			updateActiveTripInfo();
			updateStations();
		});

		theme.subscribe(currentTheme => {
			if (!currentTheme) return;
			document.documentElement.setAttribute('data-theme', currentTheme);
			if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
				StatusBar.setStyle({ style: currentTheme === 'dark' ? Style.Dark : Style.Light });
			}
		});

		ScreenOrientation.lock({ orientation: 'portrait' });

		return () => {
			stopDebugControls?.();
			App.removeAllListeners();
		};
	});
</script>

{#if $appSettings?.theme}
	<div class="w-screen h-screen font-sans">
		{@render children?.()}
	</div>
{/if}