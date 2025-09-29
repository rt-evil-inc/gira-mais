<script>
	import { getMessage } from '$lib/gira-mais-api/gira-mais-api';
	import { Preferences } from '@capacitor/preferences';
	import { t } from '$lib/translations';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { httpRequestWithRetry } from '$lib/utils';
	import { version } from '$app/environment';
	import X from '@tabler/icons-svelte/icons/x';

	let message = $state('');
	let messageTimestamp = $state('');
	let latestVersion = $state('');

	/**
	 * Compare two semantic versions
	 * @param {string} version1 - First version (e.g., "1.2.3" or "v1.2.3")
	 * @param {string} version2 - Second version (e.g., "1.3.0" or "v1.3.0")
	 * @returns {number} - Returns 1 if version1 > version2, -1 if version1 < version2, 0 if equal
	 */
	function compareSemanticVersions(version1, version2) {
		// Clean versions by removing 'v' prefix if present
		const cleanV1 = version1.startsWith('v') ? version1.slice(1) : version1;
		const cleanV2 = version2.startsWith('v') ? version2.slice(1) : version2;

		const v1Parts = cleanV1.split('.').map(Number);
		const v2Parts = cleanV2.split('.').map(Number);

		// Pad with zeros if one version has fewer parts
		const maxLength = Math.max(v1Parts.length, v2Parts.length);
		while (v1Parts.length < maxLength) v1Parts.push(0);
		while (v2Parts.length < maxLength) v2Parts.push(0);

		for (let i = 0; i < maxLength; i++) {
			if (v1Parts[i] > v2Parts[i]) return 1;
			if (v1Parts[i] < v2Parts[i]) return -1;
		}

		return 0;
	}

	onMount(() => {
		getMessage().then(async res => {
			if (res) {
				const lastMessageTimestamp = Date.parse((await Preferences.get({ key: 'lastMessageTimestamp' })).value || '0');
				if (res.showAlways || Date.parse(res.timestamp) > lastMessageTimestamp) {
					message = res.message;
					messageTimestamp = res.timestamp;
				}
			}

			if ((await Preferences.get({ key: 'settings/updateWarning' })).value === 'true') {
				httpRequestWithRetry({
					method: 'GET',
					url: 'https://api.github.com/repos/rt-evil-inc/gira-mais/releases/latest',
					headers: {
						'Accept': 'application/vnd.github.v3+json',
					},
				}).then(async response => {
					if (!response || response.status !== 200) return;
					const ignoredVersion = (await Preferences.get({ key: 'ignoredVersion' })).value || '';
					const latestVersionTag = response.data.tag_name;

					// Only show dialog if latest version is semantically greater than current version and not ignored
					if (latestVersionTag !== ignoredVersion && compareSemanticVersions(latestVersionTag, version) > 0) {
						latestVersion = latestVersionTag;
					}
				});
			}
		});
	});
</script>

{#if message || latestVersion}
	<div transition:fade={{ duration: 150 }} class="absolute top-0 flex items-center justify-center w-full h-full bg-black/50 z-50">
		{#if message}
			<div class="relative bg-background rounded-2xl col-start-1 col-end-2 max-w-sm w-full flex flex-col p-6 m-2" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
				<div class="text-info font-medium max-h-[70vh] overflow-y-auto">{@html message}</div>
				<div class="flex justify-end mt-4">
					<button class="text-primary font-bold mx-2" onclick={() => { message = ''; Preferences.set({ key: 'lastMessageTimestamp', value: messageTimestamp }); }}>{$t('ok_button')}</button>
				</div>
				<button class="absolute top-4 right-4 text-label" onclick={() => { message = ''; Preferences.set({ key: 'lastMessageTimestamp', value: messageTimestamp }); }}>
					<X class="w-6 h-6" />
				</button>
			</div>
		{:else if latestVersion}
			<div transition:fade={{ delay: 150, duration: 150 }} class="relative bg-background rounded-2xl max-w-xs w-full flex flex-col p-6 m-2" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
				<div class="text-info font-medium max-h-[70vh] overflow-y-auto">
					<h1 class="text-lg font-semibold">{$t('new_version_available')}</h1>
					<p>v{version} -> <b>{latestVersion}</b></p>
					<a href="https://github.com/rt-evil-inc/gira-mais/releases" class="text-primary underline">{$t('see_release_notes')}</a>
					<p class="text-xs text-label mt-2">{$t('update_warning_setting_note')}</p>
				</div>
				<div class="flex justify-end mt-4 gap-2">
					<button class="text-primary font-bold mx-2" onclick={() => { Preferences.set({ key: 'ignoredVersion', value: latestVersion }); latestVersion = ''; }}>{$t('ignore_button')}</button>
					<button class="text-primary font-bold mx-2" onclick={() => { latestVersion = ''; }}>{$t('ok_button')}</button>
				</div>
				<button class="absolute top-4 right-4 text-label" onclick={() => { latestVersion = ''; }}>
					<X class="w-6 h-6" />
				</button>
			</div>
		{/if}
	</div>
{/if}