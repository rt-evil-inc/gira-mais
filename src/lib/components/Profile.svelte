<script lang="ts">
	import { accountInfo, logOut, user } from '$lib/account';
	import Metric from '$lib/components/Metric.svelte';
	import ProfileMenuEntry from '$lib/components/ProfileMenuEntry.svelte';
	import Info from '$lib/components/settings/About.svelte';
	import History from '$lib/components/settings/History.svelte';
	import Settings from '$lib/components/settings/Settings.svelte';
	import { getLocale, t } from '$lib/translations';
	import { safeInsets } from '$lib/ui.svelte';
	import { App } from '@capacitor/app';
	import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
	import { IconHeart, IconStar } from '@tabler/icons-svelte';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconHistory from '@tabler/icons-svelte/icons/history';
	import IconInfoCircle from '@tabler/icons-svelte/icons/info-circle';
	import IconLogout2 from '@tabler/icons-svelte/icons/logout-2';
	import IconMessageReport from '@tabler/icons-svelte/icons/message-report';
	import IconTicket from '@tabler/icons-svelte/icons/ticket';
	import IconTool from '@tabler/icons-svelte/icons/tool';
	import IconX from '@tabler/icons-svelte/icons/x';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	const knownSubscriptionTypes = { // TODO: check if this is correct
		'Passe Anual': 'annual_pass_label',
		'Passe Mensal': 'monthly_pass_label',
		'Passe Diário': 'daily_pass_label',
		'Passe Diario': 'daily_pass_label',
	} as const;

	let { onclose }: {onclose: () => void} = $props();

	let subscriptionName = $derived(($accountInfo?.subscription?.name ?? '') as keyof typeof knownSubscriptionTypes);
	let openPage: 'settings' | 'history' |'info'| null = $state(null);
	let backListener: PluginListenerHandle;

	onMount(() => {
		App.addListener('backButton', () => {
			if (openPage !== null) openPage = null;
			else onclose();
		}).then(l => backListener = l);

		return () => backListener?.remove();
	});

</script>

<div transition:fly={{ duration: 150, x: 100 }} class="absolute w-full h-full inset-0 bg-background z-30 grid" >
	{#if $user}
		<div class="flex flex-col justify-between items-center h-full gap-10 col-start-1 col-end-2 row-start-1 row-end-2 p-4 overflow-x-hidden"
			style:padding-top="{Math.max($safeInsets.top, 16)}px" style:padding-bottom="{Math.max($safeInsets.bottom, 24)}px"
		>
			<div class="flex flex-col justify-center items-center w-full gap-6 mt-9">
				<div class="flex flex-col items-center">
					<div class="font-bold text-primary text-3xl text-center leading-none">
						{$user?.name ? `${$user.name.split(' ').shift()} ${$user.name.split(' ').pop()}` : $t('user_label')}
					</div>
					<div class="text-sm font-medium text-label">{$user?.email}</div>
				</div>
				<div class="flex gap-16">
					<Metric value={$accountInfo?.balance?.toFixed(2) ?? '0.00'} unit={'€'} label={$t('balance_label')} color={($accountInfo?.balance ?? 0) < 0 ? 'warning' : 'info'} />
					<Metric value={$accountInfo?.bonus ?? 0} unit={''} label={$t('points_label')} color={'info'} />
				</div>
				<div>
					<div class="flex items-center gap-1 justify-center">
						<IconTicket size={28} stroke={1.9} class="text-info -my-1" />
						<div class="text-info font-bold text-lg">{subscriptionName ? $t(knownSubscriptionTypes[subscriptionName]) ?? $accountInfo?.subscription?.name : $t('no_subscription_label')}</div>
					</div>
					<div class="text-xs text-label font-medium text-center -mt-[2px]">
						{$accountInfo?.subscription?.expirationDate ? $t('valid_until_label', { date: $accountInfo.subscription.expirationDate.toLocaleString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) }) : ''}
					</div>
				</div>
			</div>
			<div class="flex flex-col grow font-semibold px-2 gap-3 w-full">
				<ProfileMenuEntry icon={IconHistory} text={$t('history_label')} subtext={$t('history_subtext')} onclick={() => openPage = 'history'} />
				<ProfileMenuEntry icon={IconTool} text={$t('settings_label')} subtext={$t('settings_subtext')} onclick={() => openPage = 'settings'} />
				<a href="https://github.com/rt-evil-inc/gira-mais/issues"><ProfileMenuEntry icon={IconMessageReport} text={$t('feedback_label')} subtext={$t('feedback_subtext')} external /></a>
				<ProfileMenuEntry icon={IconInfoCircle} text={$t('about_label')} subtext={$t('about_subtext')} onclick={() => openPage = 'info'} />
				{#if Capacitor.getPlatform() === 'ios'}
					<a href="https://github.com/rt-evil-inc/gira-mais/"><ProfileMenuEntry icon={IconStar} iconClass="stroke-warning" text={$t('star_label')} subtext={$t('star_subtext')} external /></a>
				{:else}
					<a href="https://github.com/sponsors/rt-evil-inc/"><ProfileMenuEntry icon={IconHeart} iconClass="stroke-[#db61a2]" text={$t('contribute_label')} subtext={$t('contribute_subtext')} external /></a>
				{/if}
			</div>
			<button class="flex flex-col items-center mb-3" onclick={() => { onclose(); logOut(); }}>
				<IconLogout2 class="text-primary mr-2" size={32} />
				<span class="text-2xs font-semibold text-label text-center leading-none max-w-[70px]">{$t('exit_label')}</span>
			</button>
		</div>
		{#if openPage === 'history'}
			<History />
		{:else if openPage === 'settings'}
			<Settings />
		{:else if openPage === 'info'}
			<Info />
		{/if}
		<div class="absolute top-2 right-6 flex justify-end z-40" style:margin-top="{Math.max($safeInsets.top, 16)}px">
			<button onclick={() => onclose()}>
				<IconX class="text-info" size={24} />
			</button>
		</div>
		{#if openPage !== null}
			<div transition:fade={{ duration: 150 }} class="absolute top-2 left-6 flex justify-end z-40" style:margin-top="{Math.max($safeInsets.top, 16)}px">
				<button onclick={() => openPage = null}>
					<IconArrowLeft class="text-info" size={24} />
				</button>
			</div>
		{/if}
	{/if}
</div>