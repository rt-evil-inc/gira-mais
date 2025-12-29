<script lang="ts">
	import { login } from '$lib/account';
	import { onDestroy } from 'svelte';
	import { userCredentials } from '$lib/account';
	import { Keyboard } from '@capacitor/keyboard';
	import { t } from '$lib/translations';
	import { IconLoader2 } from '@tabler/icons-svelte';
	import { keyboard } from '$lib/ui.svelte';

	let email = $state('');
	let password = $state('');
	let errorCode:number|null = $state(null);
	let loading = $state(false);
	const errorCodes:{[key:number]:string} = {
		100: $t('invalid_credentials_error'),
	};
	function clearError() {
		errorCode = null;
	}
	async function loginWrapper() {
		if (loading) return;
		loading = true;
		errorCode = null;
		try {
			errorCode = await login(email, password);
			if (errorCode === 0) userCredentials.set({ email, password });
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col max-w-sm px-4 w-full h-full justify-center transition-all duration-300" style:padding-bottom="{keyboard.height}px">
	<div class="bg-background rounded-2xl max-w-sm w-full flex flex-col items-center p-6" style:box-shadow="0px 0px 20px 0px var(--color-shadow)">
		<div class="text-center text-lg text-info font-semibold mb-2 rounded-lg">{$t('welcome_message')}</div>
		<form class="flex flex-col w-full gap-4" onsubmit={loginWrapper}>
			<div class="w-full">
				<div class="text-sm text-info font-medium pb-1">{$t('email_label')}</div>
				<input type="email" required oninput={clearError} bind:value={email} placeholder={$t('email_placeholder')} class="placeholder-label text-info w-full px-2 h-12 rounded-lg border border-background-tertiary bg-background-secondary focus:ring-primary focus:border-primary">
			</div>
			<div class="w-full">
				<div class="text-sm text-info font-medium pb-1">{$t('password_label')}</div>
				<input type="password" required oninput={clearError} bind:value={password} placeholder="••••••••" class="placeholder-label text-info w-full px-2 h-12 rounded-lg border border-background-tertiary bg-background-secondary focus:ring-primary focus:border-primary">
				{#if errorCode !== null && errorCode !== 0}
					<div class="text-sm text-red-500 pt-1">{errorCodes[errorCode] || $t('unknown_error')}</div>
				{/if}
			</div>
			<button class="form-textarea border-0 w-full h-12 rounded-lg bg-primary text-background font-bold focus:ring-primary focus:border-primary flex justify-center items-center" disabled={loading}>
				{#if loading}
					<IconLoader2 class="animate-spin" />
				{:else}
					{$t('login_button')}
				{/if}
			</button>
		</form>
	</div>
</div>
<p class="absolute bottom-10 px-8 text-center text-xs text-label">{$t('login_disclaimer')}</p>